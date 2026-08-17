/**
 * Limpide — local browser processing only.
 * No fetch upload, no storage, no server-side handling of user files.
 */

const MIME_JPEG = "image/jpeg";
const HEIC_CDN = "https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/iife/heic-to.js";
const EXIFREADER_CDN = "https://cdn.jsdelivr.net/npm/exifreader@4.36.2/dist/exif-reader.js";
const PIEXIF_CDN = "https://cdn.jsdelivr.net/npm/piexifjs@1.0.6/piexif.js";
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
  "Latitude",
  "Longitude",
  "Altitude",
  "GPSDateStamp",
  "GPSTimeStamp",
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
  Latitude: "Latitude",
  Longitude: "Longitude",
  Altitude: "Altitude",
  GPSDateStamp: "GPS date",
  GPSTimeStamp: "GPS time",
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
const ZIMMY_EXTENSIONS = new Set([".jpg", ".jpeg"]);
const EXIF_DATE_PATTERN = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

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
let exifReaderPromise = null;
let piexifPromise = null;

const PIEXIF_IFD_MAP = {
  Image: "0th",
  Exif: "Exif",
  GPS: "GPS",
};

const PIEXIF_SKIP_NAMES = new Set([
  "Exif IFD Pointer",
  "GPS Info IFD Pointer",
  "Interop IFD Pointer",
  "ComponentsConfiguration",
  "MakerNote",
  "UserComment",
]);

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

function loadScript(src, errorMessage) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(errorMessage));
    document.head.appendChild(script);
  });
}

async function ensureHeicLibrary() {
  if (typeof HeicTo === "function") {
    return HeicTo;
  }

  if (!heicLibraryPromise) {
    heicLibraryPromise = loadScript(
      HEIC_CDN,
      "HEIC library failed to load. Please refresh the page.",
    ).then(() => {
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
    const jpegBlob = await heicLibrary({
      blob: file,
      type: MIME_JPEG,
      quality: 0.95,
    });
    return injectExifIntoConvertedJpeg(file, jpegBlob);
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

function getExifReader() {
  return globalThis.ExifReader;
}

function getPiexif() {
  return globalThis.piexif;
}

async function ensureExifReader() {
  const existing = getExifReader();
  if (existing?.load) {
    return existing;
  }

  if (!exifReaderPromise) {
    exifReaderPromise = loadScript(
      EXIFREADER_CDN,
      "EXIF fallback library failed to load. Please refresh the page.",
    ).then(() => {
      const library = getExifReader();
      if (!library?.load) {
        throw new Error("EXIF fallback library failed to load. Please refresh the page.");
      }
      return library;
    });
  }

  return exifReaderPromise;
}

async function ensurePiexif() {
  const existing = getPiexif();
  if (existing?.insert && existing?.dump) {
    return existing;
  }

  if (!piexifPromise) {
    piexifPromise = loadScript(
      PIEXIF_CDN,
      "EXIF injection library failed to load. Please refresh the page.",
    ).then(() => {
      const library = getPiexif();
      if (!library?.insert || !library?.dump) {
        throw new Error("EXIF injection library failed to load. Please refresh the page.");
      }
      return library;
    });
  }

  return piexifPromise;
}

function buildPiexifNameMap(piexif) {
  const nameMap = new Map();

  for (const [ifdKey, ifdName] of Object.entries(PIEXIF_IFD_MAP)) {
    for (const [id, meta] of Object.entries(piexif.TAGS[ifdKey] ?? {})) {
      nameMap.set(meta.name, { ifd: ifdName, id: Number(id) });
    }
  }

  return nameMap;
}

function buildPiexifFromExifReader(tags, piexif) {
  const nameMap = buildPiexifNameMap(piexif);
  const exifObj = { "0th": {}, Exif: {}, GPS: {}, "1st": {}, thumbnail: null };

  for (const [name, tag] of Object.entries(tags.exif ?? {})) {
    const mapping = nameMap.get(name);
    if (!mapping || PIEXIF_SKIP_NAMES.has(name)) {
      continue;
    }

    const value = tag?.value ?? tag?.description;
    if (value === undefined || value === null) {
      continue;
    }

    exifObj[mapping.ifd][mapping.id] = value;
  }

  const gps = tags.gps ?? null;
  if (gps?.Latitude !== undefined && gps?.Longitude !== undefined && !exifObj.GPS[2]) {
    exifObj.GPS[2] = piexif.GPSHelper.degToDmsRational(Math.abs(gps.Latitude));
    exifObj.GPS[1] = gps.Latitude >= 0 ? "N" : "S";
    exifObj.GPS[4] = piexif.GPSHelper.degToDmsRational(Math.abs(gps.Longitude));
    exifObj.GPS[3] = gps.Longitude >= 0 ? "E" : "W";

    if (gps.Altitude !== undefined) {
      exifObj.GPS[6] = [Math.round(Math.abs(gps.Altitude) * 100), 100];
      exifObj.GPS[5] = gps.Altitude >= 0 ? 0 : 1;
    }
  }

  const hasMetadata =
    Object.keys(exifObj["0th"]).length ||
    Object.keys(exifObj.Exif).length ||
    Object.keys(exifObj.GPS).length;

  return hasMetadata ? exifObj : null;
}

async function injectExifIntoConvertedJpeg(sourceFile, jpegBlob) {
  try {
    const [ExifReader, piexif] = await Promise.all([ensureExifReader(), ensurePiexif()]);
    const sourceBuffer = await sourceFile.arrayBuffer();
    const tags = ExifReader.load(sourceBuffer, { expanded: true });
    const exifObj = buildPiexifFromExifReader(tags, piexif);
    if (!exifObj) {
      return jpegBlob;
    }

    const jpegBuffer = await jpegBlob.arrayBuffer();
    const exifBytes = piexif.dump(exifObj);
    const jpegBinary = new Uint8Array(jpegBuffer);
    let binaryString = "";
    for (const byte of jpegBinary) {
      binaryString += String.fromCharCode(byte);
    }

    const withExifBinary = piexif.insert(exifBytes, binaryString);
    const output = new Uint8Array(withExifBinary.length);
    for (let index = 0; index < withExifBinary.length; index += 1) {
      output[index] = withExifBinary.charCodeAt(index);
    }

    return new Blob([output], { type: MIME_JPEG });
  } catch {
    return jpegBlob;
  }
}

function parseAltitude(value) {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === "string") {
    const match = value.match(/[-+]?\d*\.?\d+/);
    return match ? Number(match[0]) : undefined;
  }
  return undefined;
}

function formatViewerValue(key, value) {
  if (key === "Latitude" || key === "Longitude") {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isNaN(number)) {
      return number.toFixed(6);
    }
  }

  if (key === "Altitude") {
    const number = parseAltitude(value);
    if (number !== undefined && !Number.isNaN(number)) {
      return `${number.toFixed(1)} m`;
    }
  }

  return formatMetadataValue(value);
}

function enrichMetadataWithGps(metadata, gps) {
  const enriched = { ...metadata };

  const latitude =
    gps?.latitude ??
    gps?.Latitude ??
    metadata.latitude ??
    metadata.Latitude ??
    (typeof metadata.GPSLatitude === "number" ? metadata.GPSLatitude : undefined);

  const longitude =
    gps?.longitude ??
    gps?.Longitude ??
    metadata.longitude ??
    metadata.Longitude ??
    (typeof metadata.GPSLongitude === "number" ? metadata.GPSLongitude : undefined);

  const altitude =
    parseAltitude(gps?.altitude ?? gps?.Altitude) ??
    parseAltitude(metadata.GPSAltitude ?? metadata.Altitude);

  if (latitude !== undefined) {
    enriched.Latitude = latitude;
  }
  if (longitude !== undefined) {
    enriched.Longitude = longitude;
  }
  if (altitude !== undefined) {
    enriched.Altitude = altitude;
  }

  return enriched;
}

function shouldSkipViewerKey(key) {
  if (VIEWER_SKIP.has(key)) {
    return true;
  }
  return VIEWER_STRUCTURE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function metadataRowsFromObject(metadata, gps = null) {
  const rows = [];
  const usedLabels = new Set();
  const enriched = enrichMetadataWithGps(metadata ?? {}, gps);

  function addRow(key, value) {
    if (!isDisplayableValue(value) || shouldSkipViewerKey(key)) {
      return;
    }
    const formatted = formatViewerValue(key, value);
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

  for (const key of VIEWER_PRIORITY) {
    if (key in enriched) {
      addRow(key, enriched[key]);
    }
  }

  for (const [key, value] of Object.entries(enriched)) {
    if (VIEWER_PRIORITY.includes(key) || key.startsWith("_")) {
      continue;
    }
    addRow(key, value);
  }

  return rows;
}

function metadataFromExifReader(tags) {
  const metadata = {};

  if (tags.exif && typeof tags.exif === "object") {
    for (const [key, tag] of Object.entries(tags.exif)) {
      if (tag && typeof tag === "object") {
        metadata[key] = tag.description ?? tag.value ?? tag;
      } else {
        metadata[key] = tag;
      }
    }
  }

  if (tags.composite && typeof tags.composite === "object") {
    for (const [key, tag] of Object.entries(tags.composite)) {
      if (key in metadata) {
        continue;
      }
      metadata[key] = tag?.description ?? tag?.value ?? tag;
    }
  }

  if (metadata.ISOSpeedRatings !== undefined && metadata.ISO === undefined) {
    metadata.ISO = metadata.ISOSpeedRatings;
  }

  return {
    metadata,
    gps: tags.gps ?? null,
  };
}

async function readWithExifr(file) {
  const exifr = getExifr();
  if (!exifr?.parse) {
    throw new Error("EXIF library failed to load. Please refresh the page.");
  }

  const metadata = await exifr.parse(file, true);
  let gps = null;
  try {
    gps = await exifr.gps(file);
  } catch {
    // GPS not available for this file.
  }

  return {
    metadata,
    gps,
    rows: metadataRowsFromObject(metadata, gps),
  };
}

async function readWithExifReader(file) {
  const ExifReader = await ensureExifReader();
  const buffer = await file.arrayBuffer();
  const tags = ExifReader.load(buffer, { expanded: true });
  const { metadata, gps } = metadataFromExifReader(tags);

  return {
    metadata,
    gps,
    rows: metadataRowsFromObject(metadata, gps),
  };
}

function isHeicLikeFile(file) {
  return HEIC_EXTENSIONS.has(fileExtension(file.name));
}

async function readExifMetadata(file) {
  try {
    return await readWithExifr(file);
  } catch (error) {
    if (!isHeicLikeFile(file)) {
      throw error;
    }
  }

  return readWithExifReader(file);
}

function emptyMetadataMessage(result) {
  const metadataKeys =
    result?.metadata && typeof result.metadata === "object"
      ? Object.keys(result.metadata).filter((key) => !key.startsWith("_"))
      : [];

  if (metadataKeys.length) {
    return "No camera EXIF in this file. It may have been exported or cleaned. Try the original HEIC or raw photo.";
  }

  return "No EXIF metadata found.";
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
      const result = await readExifMetadata(file);
      if (!result.rows.length) {
        setStatus(status, emptyMetadataMessage(result), "ok");
        return;
      }
      renderMetadataTable(table, result.rows);
      setStatus(status, `${result.rows.length} field${result.rows.length > 1 ? "s" : ""} found.`, "ok");
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

function bufferToBinaryString(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return binary;
}

function binaryStringToBytes(binary) {
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

function asExifText(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (value instanceof Uint8Array) {
    return String.fromCharCode(...value).replace(/\0+$/, "").trim();
  }
  return String(value).replace(/\0+$/, "").trim();
}

function parseExifDate(value) {
  const match = asExifText(value).match(EXIF_DATE_PATTERN);
  if (!match) {
    return null;
  }
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
}

function formatExifDate(value) {
  const pad = (part) => String(part).padStart(2, "0");
  return [
    `${value.getFullYear()}:${pad(value.getMonth() + 1)}:${pad(value.getDate())}`,
    `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`,
  ].join(" ");
}

function formatDisplayDate(value) {
  if (!value) {
    return "No EXIF date";
  }
  return formatExifDate(value).replace(/:/g, (char, index) => (index < 10 ? "-" : char));
}

function applyDateAdjustments(value, newDate, shiftSeconds) {
  const year = newDate ? newDate.getFullYear() : value.getFullYear();
  const month = newDate ? newDate.getMonth() : value.getMonth();
  const day = newDate ? newDate.getDate() : value.getDate();
  const utc = Date.UTC(
    year,
    month,
    day,
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
  ) + shiftSeconds * 1000;
  const shifted = new Date(utc);
  return new Date(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    shifted.getUTCHours(),
    shifted.getUTCMinutes(),
    shifted.getUTCSeconds(),
  );
}

function parseDateInput(value) {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function readDirectoryEntries(reader) {
  return new Promise((resolve, reject) => {
    const entries = [];

    function readBatch() {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readBatch();
      }, reject);
    }

    readBatch();
  });
}

function entryToFile(entry) {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function collectFromEntry(entry, files) {
  if (entry.isFile) {
    if (!entry.name.startsWith(".")) {
      files.push(await entryToFile(entry));
    }
    return;
  }
  if (!entry.isDirectory) {
    return;
  }

  const children = await readDirectoryEntries(entry.createReader());
  for (const child of children) {
    await collectFromEntry(child, files);
  }
}

async function collectDroppedFiles(dataTransfer) {
  const items = dataTransfer?.items;
  if (!items?.length) {
    return Array.from(dataTransfer?.files ?? []);
  }

  const entries = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      entries.push(entry);
    }
  }
  if (!entries.length) {
    return Array.from(dataTransfer.files ?? []);
  }

  const files = [];
  for (const entry of entries) {
    await collectFromEntry(entry, files);
  }
  return files;
}

function firstPhotoDate(dates, fallback) {
  return dates.dateTimeOriginal || dates.dateTimeDigitized || dates.dateTime || fallback;
}

function readZimmyDates(exifObj) {
  return {
    dateTime: parseExifDate(exifObj["0th"]?.[piexif.ImageIFD.DateTime]),
    dateTimeOriginal: parseExifDate(exifObj.Exif?.[piexif.ExifIFD.DateTimeOriginal]),
    dateTimeDigitized: parseExifDate(exifObj.Exif?.[piexif.ExifIFD.DateTimeDigitized]),
  };
}

function writeZimmyDates(exifObj, dates, fallback, newDate, shiftSeconds) {
  const tags = [
    ["0th", piexif.ImageIFD.DateTime, dates.dateTime],
    ["Exif", piexif.ExifIFD.DateTimeOriginal, dates.dateTimeOriginal],
    ["Exif", piexif.ExifIFD.DateTimeDigitized, dates.dateTimeDigitized],
  ];

  let wrote = false;
  let primary = null;

  for (const [ifdName, tag, current] of tags) {
    if (!current) {
      continue;
    }
    const updated = applyDateAdjustments(current, newDate, shiftSeconds);
    exifObj[ifdName] = exifObj[ifdName] || {};
    exifObj[ifdName][tag] = formatExifDate(updated);
    wrote = true;
    if (!primary) {
      primary = updated;
    }
  }

  if (!wrote) {
    primary = applyDateAdjustments(fallback, newDate, shiftSeconds);
    const stamp = formatExifDate(primary);
    exifObj["0th"] = exifObj["0th"] || {};
    exifObj.Exif = exifObj.Exif || {};
    exifObj["0th"][piexif.ImageIFD.DateTime] = stamp;
    exifObj.Exif[piexif.ExifIFD.DateTimeOriginal] = stamp;
    exifObj.Exif[piexif.ExifIFD.DateTimeDigitized] = stamp;
  }

  return primary;
}

function previewZimmyItem(item, newDate, shiftSeconds) {
  const source = firstPhotoDate(item.dates, item.fallback);
  return applyDateAdjustments(source, newDate, shiftSeconds);
}

async function loadZimmyItem(file, piexif) {
  const buffer = await file.arrayBuffer();
  const exifObj = piexif.load(bufferToBinaryString(buffer));
  const dates = readZimmyDates(exifObj);
  const fallback = new Date(file.lastModified);
  return {
    file,
    buffer,
    dates,
    fallback,
    current: firstPhotoDate(dates, fallback),
  };
}

function setupZimmyGpx() {
  const dropzone = document.getElementById("zimmy-dropzone");
  const input = document.getElementById("zimmy-input");
  const folderInput = document.getElementById("zimmy-folder");
  const folderButton = document.getElementById("zimmy-folder-btn");
  const controls = document.getElementById("zimmy-controls");
  const dateInput = document.getElementById("zimmy-date");
  const secondsInput = document.getElementById("zimmy-seconds");
  const minusButton = document.getElementById("zimmy-minus");
  const plusButton = document.getElementById("zimmy-plus");
  const resetButton = document.getElementById("zimmy-reset");
  const offset = document.getElementById("zimmy-offset");
  const tableWrap = document.getElementById("zimmy-table-wrap");
  const rows = document.getElementById("zimmy-rows");
  const status = document.getElementById("zimmy-status");
  const download = document.getElementById("zimmy-download");

  let items = [];
  let shiftSeconds = 0;

  function selectedDate() {
    return parseDateInput(dateInput.value);
  }

  function shiftStep() {
    const value = Number(secondsInput.value);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  }

  function renderPreview() {
    const newDate = selectedDate();
    rows.innerHTML = "";

    for (const item of items) {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      const currentCell = document.createElement("td");
      const nextCell = document.createElement("td");
      nameCell.textContent = item.file.name;
      currentCell.textContent = formatDisplayDate(item.current);
      nextCell.textContent = formatDisplayDate(previewZimmyItem(item, newDate, shiftSeconds));
      row.append(nameCell, currentCell, nextCell);
      rows.appendChild(row);
    }

    tableWrap.hidden = !items.length;
    const dateLabel = newDate ? dateInput.value : "original dates";
    const sign = shiftSeconds > 0 ? "+" : "";
    offset.textContent = `${items.length} photo${items.length > 1 ? "s" : ""} · ${dateLabel} · ${sign}${shiftSeconds} s`;
    offset.hidden = !items.length;
    controls.hidden = !items.length;
    download.hidden = !items.length;
    download.textContent = items.length > 1 ? "Download ZIP" : "Download";
  }

  function resetAdjustments() {
    shiftSeconds = 0;
    dateInput.value = "";
    renderPreview();
  }

  async function loadFiles(fileList) {
    const files = collectFilesFromInput(fileList, ZIMMY_EXTENSIONS)
      .filter((file) => !file.name.startsWith("."))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

    items = [];
    input.value = "";
    folderInput.value = "";
    download.hidden = true;
    resetAdjustments();

    if (!files.length) {
      setDropzoneLabel(dropzone, "Drop a folder or photos here, or click to browse", false);
      renderPreview();
      setStatus(status, "No JPEG files selected.", "err");
      return;
    }

    setDropzoneLabel(
      dropzone,
      `${files.length} photo${files.length > 1 ? "s" : ""} selected`,
      true,
    );
    setStatus(status, "Reading dates…");

    try {
      const piexif = await ensurePiexif();
      const loaded = [];
      for (let index = 0; index < files.length; index += 1) {
        setStatus(status, `Reading ${index + 1}/${files.length}: ${files[index].name}`);
        loaded.push(await loadZimmyItem(files[index], piexif));
      }
      items = loaded;
      renderPreview();
      setStatus(status, `${items.length} photo${items.length > 1 ? "s" : ""} ready.`, "ok");
    } catch (error) {
      items = [];
      setDropzoneLabel(dropzone, "Drop a folder or photos here, or click to browse", false);
      renderPreview();
      setStatus(status, formatError(error), "err");
    }
  }

  folderButton.addEventListener("click", () => {
    folderInput.click();
  });

  dateInput.addEventListener("change", renderPreview);
  minusButton.addEventListener("click", () => {
    const step = shiftStep();
    if (!step) {
      setStatus(status, "Enter a positive number of seconds.", "err");
      return;
    }
    shiftSeconds -= step;
    renderPreview();
    setStatus(status, `Shifted all photos by −${step} s.`, "ok");
  });
  plusButton.addEventListener("click", () => {
    const step = shiftStep();
    if (!step) {
      setStatus(status, "Enter a positive number of seconds.", "err");
      return;
    }
    shiftSeconds += step;
    renderPreview();
    setStatus(status, `Shifted all photos by +${step} s.`, "ok");
  });
  resetButton.addEventListener("click", () => {
    resetAdjustments();
    setStatus(status, "Date and shift reset.", "ok");
  });

  download.addEventListener("click", async () => {
    if (!items.length) {
      return;
    }
    const newDate = selectedDate();
    if (!newDate && !shiftSeconds) {
      setStatus(status, "Set a date or shift the photos first.", "err");
      return;
    }

    try {
      const piexif = await ensurePiexif();
      const results = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setStatus(status, `Writing ${index + 1}/${items.length}: ${item.file.name}`);
        const binary = bufferToBinaryString(item.buffer);
        const exifObj = piexif.load(binary);
        writeZimmyDates(exifObj, item.dates, item.fallback, newDate, shiftSeconds);
        const updated = piexif.insert(piexif.dump(exifObj), binary);
        results.push({
          name: item.file.name,
          blob: new Blob([binaryStringToBytes(updated)], { type: MIME_JPEG }),
        });
      }
      await downloadResults(results, "zimmypgx.zip");
      setStatus(status, `${results.length} photo${results.length > 1 ? "s" : ""} ready.`, "ok");
    } catch (error) {
      setStatus(status, formatError(error), "err");
    }
  });

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });
  dropzone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
    try {
      await loadFiles(await collectDroppedFiles(event.dataTransfer));
    } catch (error) {
      setStatus(status, formatError(error), "err");
    }
  });
  input.addEventListener("change", () => {
    if (input.files?.length) {
      loadFiles(input.files);
    }
  });
  folderInput.addEventListener("change", () => {
    if (folderInput.files?.length) {
      loadFiles(folderInput.files);
    }
  });
}

async function init() {
  setupExifViewer();
  setupZimmyGpx();

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
