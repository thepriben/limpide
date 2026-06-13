/**
 * Limpide — traitement 100 % local.
 * Aucun fetch, aucun stockage, aucun envoi réseau des fichiers utilisateur.
 */

const MIME_JPEG = "image/jpeg";

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = `status${kind ? ` ${kind}` : ""}`;
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
      img.onerror = () => reject(new Error("Impossible de lire l'image."));
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
      (blob) => (blob ? resolve(blob) : reject(new Error("Échec de l'encodage JPEG."))),
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
    throw new Error("Bibliothèque HEIC indisponible.");
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

function setupExifPanel() {
  const status = document.getElementById("exif-status");
  const download = document.getElementById("exif-download");
  let resultBlob = null;
  let resultName = "image-clean.jpg";

  download.addEventListener("click", () => {
    if (resultBlob) {
      downloadBlob(resultBlob, resultName);
    }
  });

  wireDropzone(
    document.getElementById("exif-dropzone"),
    document.getElementById("exif-input"),
    async (file) => {
      download.hidden = true;
      resultBlob = null;
      setStatus(status, "Traitement local en cours…");

      try {
        resultBlob = await stripExif(file);
        resultName = outputName(file.name, ".clean.jpg");
        setStatus(status, "EXIF retirés — prêt à télécharger.", "ok");
        download.hidden = false;
      } catch (error) {
        setStatus(status, error.message || "Erreur lors du traitement.", "err");
      }
    },
  );
}

function setupHeicPanel() {
  const status = document.getElementById("heic-status");
  const download = document.getElementById("heic-download");
  let resultBlob = null;
  let resultName = "image.jpg";

  download.addEventListener("click", () => {
    if (resultBlob) {
      downloadBlob(resultBlob, resultName);
    }
  });

  wireDropzone(
    document.getElementById("heic-dropzone"),
    document.getElementById("heic-input"),
    async (file) => {
      download.hidden = true;
      resultBlob = null;
      setStatus(status, "Conversion locale en cours…");

      try {
        resultBlob = await convertHeicToJpeg(file);
        resultName = outputName(file.name, ".jpg");
        setStatus(status, "Conversion terminée — prêt à télécharger.", "ok");
        download.hidden = false;
      } catch (error) {
        setStatus(status, error.message || "Erreur lors de la conversion.", "err");
      }
    },
  );
}

setupExifPanel();
setupHeicPanel();
