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
        converted = image
        if converted.mode in ("RGBA", "P", "LA"):
            converted = converted.convert("RGB")

        converted.save(
            output_path,
            format="JPEG",
            quality=quality,
            subsampling=0,
        )
