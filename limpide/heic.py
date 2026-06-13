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
    quality: int = 95,
) -> None:
    """Convert a HEIC/HEIF file to JPEG."""
    suffix = input_path.suffix.lower()
    if suffix not in SUPPORTED_HEIC_FORMATS:
        raise ValueError(
            f"Unsupported format for HEIC conversion: {suffix}. "
            f"Accepted formats: {', '.join(sorted(SUPPORTED_HEIC_FORMATS))}"
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(input_path) as image:
        image.load()
        exif_bytes = image.getexif().tobytes() or None
        converted = image
        if converted.mode in ("RGBA", "P", "LA"):
            converted = converted.convert("RGB")

        save_kwargs: dict[str, object] = {
            "format": "JPEG",
            "quality": quality,
            "subsampling": 0,
        }
        if exif_bytes:
            save_kwargs["exif"] = exif_bytes

        converted.save(output_path, **save_kwargs)
