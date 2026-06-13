/**
 * Limpide — 100 % local processing.
 * No fetch, no storage, no network upload of user files.
 */

const MIME_JPEG = "image/jpeg";
const DEFAULT_DROPZONE_LABEL = "Drop a file or click to browse";

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = `status${kind ? ` ${kind}` : ""}`;
}

function setDropzoneLabel(dropzone, label, hasFile = false) {
  const text = dropzone.querySelector(".dropzone-label");
  if (text) {
    text.textContent = label;
  }
  dropzone.classList.toggle("has-file", hasFile);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function outputName(inputName, suffix) {
  const dot = inputName.lastIndexOf(".");
  const stem = dot === -1 ? inputName : inputName.slice(0, dot);
  return `${stem}${suffix}`;
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

async function convertHeicToJpeg(file) {
  if (typeof heic2any !== "function") {
    throw new Error("HEIC library unavailable.");
  }

  const result = await heic2any({
    blob: file,
    toType: MIME_JPEG,
    quality: 0.95,
  });

  return Array.isArray(result) ? result[0] : result;
}

function wireDropzone(dropzone, input, onFile) {
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
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      onFile(file);
    }
  });

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) {
      onFile(file);
    }
  });
}

function setupPanel({ dropzoneId, inputId, statusId, downloadId, process, outputSuffix, readyMessage }) {
  const dropzone = document.getElementById(dropzoneId);
  const input = document.getElementById(inputId);
  const status = document.getElementById(statusId);
  const download = document.getElementById(downloadId);
  let resultBlob = null;
  let resultName = `output${outputSuffix}`;

  download.addEventListener("click", () => {
    if (resultBlob) {
      downloadBlob(resultBlob, resultName);
    }
  });

  wireDropzone(dropzone, input, async (file) => {
    download.hidden = true;
    resultBlob = null;
    setDropzoneLabel(dropzone, file.name, true);
    setStatus(status, "Processing locally…");

    try {
      resultBlob = await process(file);
      resultName = outputName(file.name, outputSuffix);
      setStatus(status, readyMessage, "ok");
      download.hidden = false;
    } catch (error) {
      setDropzoneLabel(dropzone, DEFAULT_DROPZONE_LABEL, false);
      setStatus(status, error.message || "Processing failed.", "err");
    }
  });
}

setupPanel({
  dropzoneId: "exif-dropzone",
  inputId: "exif-input",
  statusId: "exif-status",
  downloadId: "exif-download",
  process: stripExif,
  outputSuffix: ".clean.jpg",
  readyMessage: "EXIF removed — ready to download.",
});

setupPanel({
  dropzoneId: "heic-dropzone",
  inputId: "heic-input",
  statusId: "heic-status",
  downloadId: "heic-download",
  process: convertHeicToJpeg,
  outputSuffix: ".jpg",
  readyMessage: "Converted — ready to download.",
});
