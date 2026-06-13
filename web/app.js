/**
 * Limpide — local browser processing only.
 * No fetch upload, no storage, no server-side handling of user files.
 */

const MIME_JPEG = "image/jpeg";
const DEFAULT_DROPZONE_LABEL = "Drop files here or click to browse";
const EXIF_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const HEIC_EXTENSIONS = new Set([".heic", ".heif"]);

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = `status${kind ? ` ${kind}` : ""}`;
}

function setDropzoneLabel(dropzone, label, hasFiles = false) {
  const text = dropzone.querySelector(".dropzone-label");
  if (text) {
    text.textContent = label;
  }
  dropzone.classList.toggle("has-file", hasFiles);
}

function fileExtension(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function outputName(inputName, suffix) {
  const dot = inputName.lastIndexOf(".");
  const stem = dot === -1 ? inputName : inputName.slice(0, dot);
  return `${stem}${suffix}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderFileList(listElement, files) {
  listElement.innerHTML = "";
  if (!files.length) {
    listElement.hidden = true;
    return;
  }

  for (const file of files) {
    const item = document.createElement("li");
    item.textContent = file.name;
    listElement.appendChild(item);
  }
  listElement.hidden = false;
}

function collectFilesFromInput(fileList, allowedExtensions, acceptAll = false) {
  const files = Array.from(fileList);
  if (acceptAll) {
    return files;
  }
  return files.filter((file) => allowedExtensions.has(fileExtension(file.name)));
}

async function loadImageFromFile(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read the image."));
      img.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canvasToJpegBlob(source, width, height, quality = 0.95) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.drawImage(source, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("JPEG encoding failed."))),
      MIME_JPEG,
      quality,
    );
  });
}

async function stripExif(file) {
  const bitmap = await loadImageFromFile(file);
  try {
    return await canvasToJpegBlob(bitmap, bitmap.width, bitmap.height);
  } finally {
    if (typeof bitmap.close === "function") {
      bitmap.close();
    }
  }
}

async function isHeicFile(file) {
  const extension = fileExtension(file.name);
  if (HEIC_EXTENSIONS.has(extension)) {
    return true;
  }
  if (typeof HeicTo !== "undefined" && typeof HeicTo.isHeic === "function") {
    return HeicTo.isHeic(file);
  }
  return false;
}

async function convertHeicToJpeg(file) {
  if (typeof HeicTo !== "function") {
    throw new Error("HEIC library unavailable.");
  }

  if (!(await isHeicFile(file))) {
    throw new Error(`Not a HEIC/HEIF file: ${file.name}`);
  }

  return HeicTo({
    blob: file,
    type: MIME_JPEG,
    quality: 0.95,
  });
}

async function processBatch(files, processor, outputSuffix, onProgress) {
  const results = [];

  for (let index = 0; index < files.length; index += 1) {
    onProgress(index + 1, files.length, files[index].name);
    const blob = await processor(files[index]);
    results.push({
      name: outputName(files[index].name, outputSuffix),
      blob,
    });
  }

  return results;
}

async function downloadResults(results, zipName) {
  if (results.length === 1) {
    downloadBlob(results[0].blob, results[0].name);
    return;
  }

  if (typeof JSZip === "undefined") {
    throw new Error("ZIP library unavailable.");
  }

  const zip = new JSZip();
  for (const result of results) {
    zip.file(result.name, result.blob);
  }
  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, zipName);
}

function wireDropzone(dropzone, input, onFiles) {
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
    if (event.dataTransfer?.files?.length) {
      onFiles(event.dataTransfer.files);
    }
  });

  input.addEventListener("change", () => {
    if (input.files?.length) {
      onFiles(input.files);
    }
  });
}

function setupPanel({
  dropzoneId,
  inputId,
  listId,
  statusId,
  downloadId,
  allowedExtensions,
  acceptAll = false,
  process,
  outputSuffix,
  zipName,
}) {
  const dropzone = document.getElementById(dropzoneId);
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  const status = document.getElementById(statusId);
  const download = document.getElementById(downloadId);
  let results = [];

  download.addEventListener("click", async () => {
    if (!results.length) {
      return;
    }
    try {
      await downloadResults(results, zipName);
    } catch (error) {
      setStatus(status, error.message || "Download failed.", "err");
    }
  });

  wireDropzone(dropzone, input, async (fileList) => {
    const files = collectFilesFromInput(fileList, allowedExtensions, acceptAll);
    download.hidden = true;
    results = [];
    input.value = "";

    if (!files.length) {
      setDropzoneLabel(dropzone, DEFAULT_DROPZONE_LABEL, false);
      renderFileList(list, []);
      setStatus(status, "No supported files selected.", "err");
      return;
    }

    setDropzoneLabel(dropzone, `${files.length} file${files.length > 1 ? "s" : ""} selected`, true);
    renderFileList(list, files);
    setStatus(status, "Processing…");

    try {
      results = await processBatch(files, process, outputSuffix, (current, total, name) => {
        setStatus(status, `Processing ${current}/${total}: ${name}`);
      });
      setStatus(status, `${results.length} file${results.length > 1 ? "s" : ""} ready.`, "ok");
      download.textContent = results.length > 1 ? "Download ZIP" : "Download";
      download.hidden = false;
    } catch (error) {
      setDropzoneLabel(dropzone, DEFAULT_DROPZONE_LABEL, false);
      renderFileList(list, []);
      setStatus(status, error.message || "Processing failed.", "err");
    }
  });
}

setupPanel({
  dropzoneId: "exif-dropzone",
  inputId: "exif-input",
  listId: "exif-files",
  statusId: "exif-status",
  downloadId: "exif-download",
  allowedExtensions: EXIF_EXTENSIONS,
  process: stripExif,
  outputSuffix: ".clean.jpg",
  zipName: "limpide-exif.zip",
});

setupPanel({
  dropzoneId: "heic-dropzone",
  inputId: "heic-input",
  listId: "heic-files",
  statusId: "heic-status",
  downloadId: "heic-download",
  allowedExtensions: HEIC_EXTENSIONS,
  acceptAll: true,
  process: convertHeicToJpeg,
  outputSuffix: ".jpg",
  zipName: "limpide-heic.zip",
});
