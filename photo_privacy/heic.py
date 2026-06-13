from __future__ import annotations

from pathlib import Path

import pillow_heif
from PIL import Image

pillow_heif.register_heif_opener()

SUPPORTED_HEIC_FORMATS = {".heic", ".heif"}


def convert_heic(
    input_path: Path,
    output_path: Path,
    *,
    output_format: str = "JPEG",
    quality: int = 95,
) -> None:
    """Convertit un fichier HEIC/HEIF vers JPEG ou PNG."""
    suffix = input_path.suffix.lower()
    if suffix not in SUPPORTED_HEIC_FORMATS:
        raise ValueError(
            f"Format non pris en charge pour la conversion HEIC : {suffix}. "
            f"Formats acceptés : {', '.join(sorted(SUPPORTED_HEIC_FORMATS))}"
        )

    normalized_format = output_format.upper()
    if normalized_format not in {"JPEG", "PNG"}:
        raise ValueError("Le format de sortie doit être JPEG ou PNG.")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(input_path) as image:
        image.load()
        converted = image
        if normalized_format == "JPEG" and converted.mode in ("RGBA", "P", "LA"):
            converted = converted.convert("RGB")

        save_kwargs: dict = {"format": normalized_format}
        if normalized_format == "JPEG":
            save_kwargs["quality"] = quality
            save_kwargs["subsampling"] = 0

        converted.save(output_path, **save_kwargs)
