/**
 * Limpide — local browser processing only.
 * No fetch upload, no storage, no server-side handling of user files.
 */

const MIME_JPEG = "image/jpeg";
const HEIC_CDN = "https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/iife/heic-to.js";
const DEFAULT_DROPZONE_LABEL = "Drop files here or click to browse";
const VIEWER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);
const VIEWER_PRIORITY = [
  "Make",
  "Model",
  "LensModel",
  "Software",
  "DateTimeOriginal",
  "CreateDate",
  "ModifyDate",
  "ExposureTime",
  "FNumber",
  "ISO",
  "FocalLength",
  "ImageWidth",
  "ImageHeight",
  "Orientation",
];

const VIEWER_SKIP = new Set([
  "latitude",
  "longitude",
  "GPSLatitude",
  "GPSLongitude",
  "GPSAltitude",
  "GPSDateStamp",
  "GPSTimeStamp",
  "MakerNote",
  "UserComment",
  "thumbnail",
  "PreviewImage",
  "Images",
  "JFIFVersion",
  "ResolutionUnit",
  "XResolution",
  "YResolution",
  "ThumbnailWidth",
  "ThumbnailHeight",
  "ColorSpace",
  "PixelXDimension",
  "PixelYDimension",
  "ProfileVersion",
  "ProfileClass",
  "ColorSpaceData",
  "ProfileConnectionSpace",
  "ProfileDateTime",
  "ProfileFileSignature",
  "RenderingIntent",
  "ProfileDescription",
  "ProfileCopyright",
  "ProfileCreator",
  "ProfileCMMType",
  "DeviceManufacturer",
  "DeviceModel",
]);

const VIEWER_STRUCTURE_PREFIXES = ["Profile", "Interoperability", "ComponentsConfiguration", "JFIF"];
const VIEWER_LABELS = {
  Make: "Camera make",
  Model: "Camera model",
  DateTimeOriginal: "Date taken",
  CreateDate: "Created",
  ModifyDate: "Modified",
  ExposureTime: "Exposure",
  FNumber: "Aperture",
  ISO: "ISO",
  FocalLength: "Focal length",
  LensModel: "Lens",
  Software: "Software",
  ImageWidth: "Width",
  ImageHeight: "Height",
  Orientation: "Orientation",
};
const EXIF_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const HEIC_EXTENSIONS = new Set([".heic", ".heif"]);

const ERROR_MESSAGES = [
  ["Bibliothèque HEIC indisponible", "HEIC library failed to load. Please refresh the page."],
  ["HEIC library unavailable", "HEIC library failed to load. Please refresh the page."],
  ["ERR_LIBHEIF format not supported", "This HEIC file format is not supported."],
  ["Could not read the image", "Could not read the image file."],
  ["JPEG encoding failed", "JPEG encoding failed."],
  ["ZIP library unavailable", "ZIP library failed to load. Please refresh the page."],
  ["try using full build of exifr", "EXIF library failed to load. Please refresh the page."],
  ["Unknown file format", "Unsupported file format for EXIF viewing."],
];

let heicLibraryPromise = null;

function formatError(error) {
  const message = error?.message || String(error);
  for (const [needle, english] of ERROR_MESSAGES) {
    if (message.includes(needle)) {
      return english;
    }
  }
  return message;
}

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

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("HEIC library failed to load. Please refresh the page."));
    document.head.appendChild(script);
  });
}

async function ensureHeicLibrary() {
  if (typeof HeicTo === "function") {
    return HeicTo;
  }

  if (!heicLibraryPromise) {
    heicLibraryPromise = loadScript(HEIC_CDN).then(() => {
      if (typeof HeicTo !== "function") {
        throw new Error("HEIC library failed to load. Please refresh the page.");
      }
      return HeicTo;
    });
  }

  return heicLibraryPromise;
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
      img.onerror = () => reject(new Error("Could not read the image file."));
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

function concatUint8Arrays(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function stripJpegAppSegments(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("JPEG encoding failed.");
  }

  const chunks = [bytes.slice(0, 2)];
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      break;
    }

    const markerStart = offset;
    offset += 1;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9) {
      chunks.push(bytes.slice(markerStart, offset));
      break;
    }

    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      chunks.push(bytes.slice(markerStart, offset));
      continue;
    }

    if (marker === 0xda) {
      chunks.push(bytes.slice(markerStart));
      break;
    }

    if (offset + 1 >= bytes.length) {
      break;
    }

    const segmentLength = (bytes[offset] << 8) + bytes[offset + 1];
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > bytes.length) {
      break;
    }

    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!isApp && !isComment) {
      chunks.push(bytes.slice(markerStart, segmentEnd));
    }

    offset = segmentEnd;
  }

  return concatUint8Arrays(chunks);
}

async function stripExif(file) {
  const bitmap = await loadImageFromFile(file);
  try {
    const blob = await canvasToJpegBlob(bitmap, bitmap.width, bitmap.height);
    const buffer = await blob.arrayBuffer();
    const stripped = stripJpegAppSegments(new Uint8Array(buffer));
    return new Blob([stripped], { type: MIME_JPEG });
  } finally {
    if (typeof bitmap.close === "function") {
      bitmap.close();
    }
  }
}

async function isHeicFile(file, heicLibrary) {
  const extension = fileExtension(file.name);
  if (HEIC_EXTENSIONS.has(extension)) {
    return true;
  }
  if (heicLibrary?.isHeic) {
    return heicLibrary.isHeic(file);
  }
  return false;
}

async function convertHeicToJpeg(file) {
  const heicLibrary = await ensureHeicLibrary();

  if (!(await isHeicFile(file, heicLibrary))) {
    throw new Error(`Not a HEIC/HEIF file: ${file.name}`);
  }

  try {
    return await heicLibrary({
      blob: file,
      type: MIME_JPEG,
      quality: 0.95,
    });
  } catch (error) {
    throw new Error(formatError(error));
  }
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
    throw new Error("ZIP library failed to load. Please refresh the page.");
  }

  const zip = new JSZip();
  for (const result of results) {
    zip.file(result.name, result.blob);
  }
  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, zipName);
}

function formatMetadataValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    if (value > 0 && value < 1) {
      return `1/${Math.round(1 / value)}s`;
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
  }
  if (value instanceof Date) {
    return value.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatMetadataValue(item)).join(", ");
  }
  if (typeof value === "object") {
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      return "";
    }
    return JSON.stringify(value);
  }
  return String(value).trim();
}

function isDisplayableValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string" && !value.trim()) {
    return false;
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return false;
  }
  return true;
}

function getExifr() {
  return globalThis.exifr;
}

async function fileForExifReading(file) {
  const extension = fileExtension(file.name);
  const looksHeic = HEIC_EXTENSIONS.has(extension);

  if (!looksHeic && typeof HeicTo === "function" && typeof HeicTo.isHeic === "function") {
    try {
      if (await HeicTo.isHeic(file)) {
        const heicLibrary = await ensureHeicLibrary();
        return heicLibrary({ blob: file, type: MIME_JPEG, quality: 0.95 });
      }
    } catch {
      // Fall back to reading the original file.
    }
  }

  if (looksHeic) {
    const heicLibrary = await ensureHeicLibrary();
    return heicLibrary({ blob: file, type: MIME_JPEG, quality: 0.95 });
  }

  return file;
}

async function readExifMetadata(file) {
  const exifr = getExifr();
  if (!exifr?.parse) {
    throw new Error("EXIF library failed to load. Please refresh the page.");
  }

  const source = await fileForExifReading(file);
  const metadata = await exifr.parse(source, true);
  const rows = [];
  const usedLabels = new Set();

  function shouldSkipKey(key) {
    if (VIEWER_SKIP.has(key)) {
      return true;
    }
    return VIEWER_STRUCTURE_PREFIXES.some((prefix) => key.startsWith(prefix));
  }

  function addRow(key, value) {
    if (!isDisplayableValue(value) || shouldSkipKey(key)) {
      return;
    }
    const formatted = formatMetadataValue(value);
    if (!formatted) {
      return;
    }
    const label = VIEWER_LABELS[key] || key;
    if (usedLabels.has(label)) {
      return;
    }
    usedLabels.add(label);
    rows.push([label, formatted]);
  }

  if (metadata && typeof metadata === "object") {
    for (const key of VIEWER_PRIORITY) {
      if (key in metadata) {
        addRow(key, metadata[key]);
      }
    }

    for (const [key, value] of Object.entries(metadata)) {
      if (VIEWER_PRIORITY.includes(key) || key.startsWith("_")) {
        continue;
      }
      addRow(key, value);
    }
  }

  try {
    const gps = await exifr.gps(source);
    if (gps?.latitude !== undefined && gps?.longitude !== undefined) {
      addRow("Latitude", gps.latitude);
      addRow("Longitude", gps.longitude);
    }
  } catch {
    // GPS not available for this file.
  }

  return rows;
}

function renderMetadataTable(tableElement, rows) {
  tableElement.innerHTML = "";
  if (!rows.length) {
    tableElement.hidden = true;
    return;
  }

  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    tableElement.appendChild(term);
    tableElement.appendChild(detail);
  }
  tableElement.hidden = false;
}

function setupExifViewer() {
  const dropzone = document.getElementById("view-dropzone");
  const input = document.getElementById("view-input");
  const status = document.getElementById("view-status");
  const table = document.getElementById("view-meta");

  wireDropzone(dropzone, input, async (fileList) => {
    const files = Array.from(fileList);
    input.value = "";
    table.hidden = true;
    table.innerHTML = "";

    if (!files.length) {
      setDropzoneLabel(dropzone, "Drop a file here or click to browse", false);
      setStatus(status, "No file selected.", "err");
      return;
    }

    const file = files[0];
    const extension = fileExtension(file.name);
    if (!VIEWER_EXTENSIONS.has(extension) && !file.type.startsWith("image/")) {
      setDropzoneLabel(dropzone, "Drop a file here or click to browse", false);
      setStatus(status, "Unsupported file type.", "err");
      return;
    }
    setDropzoneLabel(dropzone, file.name, true);
    setStatus(status, "Reading metadata…");

    try {
      const rows = await readExifMetadata(file);
      if (!rows.length) {
        setStatus(status, "No EXIF metadata found.", "ok");
        return;
      }
      renderMetadataTable(table, rows);
      setStatus(status, `${rows.length} field${rows.length > 1 ? "s" : ""} found.`, "ok");
    } catch (error) {
      setDropzoneLabel(dropzone, "Drop a file here or click to browse", false);
      setStatus(status, formatError(error), "err");
    }
  });
}

function wireDropzone(dropzone, input, onFiles) {
  dropzone.addEventListener("dragover", (event) => {
    if (dropzone.classList.contains("disabled")) {
      return;
    }
    event.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (event) => {
    if (dropzone.classList.contains("disabled")) {
      return;
    }
    event.preventDefault();
    dropzone.classList.remove("dragover");
    if (event.dataTransfer?.files?.length) {
      onFiles(event.dataTransfer.files);
    }
  });

  input.addEventListener("change", () => {
    if (dropzone.classList.contains("disabled")) {
      return;
    }
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
      setStatus(status, formatError(error), "err");
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
      setStatus(status, formatError(error), "err");
    }
  });
}

async function init() {
  setupExifViewer();

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

  const heicStatus = document.getElementById("heic-status");
  try {
    await ensureHeicLibrary();
  } catch (error) {
    const dropzone = document.getElementById("heic-dropzone");
    const input = document.getElementById("heic-input");
    dropzone.classList.add("disabled");
    input.disabled = true;
    setStatus(heicStatus, formatError(error), "err");
  }
}

init();
