from __future__ import annotations

from pathlib import Path

from PIL import Image

SUPPORTED_EXIF_FORMATS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}


def strip_exif(input_path: Path, output_path: Path, *, quality: int = 95) -> None:
    """Réencode une image sans conserver les métadonnées EXIF."""
    suffix = input_path.suffix.lower()
    if suffix not in SUPPORTED_EXIF_FORMATS:
        raise ValueError(
            f"Format non pris en charge pour l'effacement EXIF : {suffix}. "
            f"Formats acceptés : {', '.join(sorted(SUPPORTED_EXIF_FORMATS))}"
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(input_path) as image:
        image.load()
        cleaned = Image.new(image.mode, image.size)
        cleaned.paste(image)

        save_kwargs: dict = {}
        output_format = _output_format(input_path, output_path)
        if output_format == "JPEG":
            if cleaned.mode in ("RGBA", "P", "LA"):
                cleaned = cleaned.convert("RGB")
            save_kwargs["quality"] = quality
            save_kwargs["subsampling"] = 0

        cleaned.save(output_path, format=output_format, **save_kwargs)


def _output_format(input_path: Path, output_path: Path) -> str:
    suffix = output_path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "JPEG"
    if suffix == ".png":
        return "PNG"
    if suffix == ".webp":
        return "WEBP"
    if suffix in {".tif", ".tiff"}:
        return "TIFF"

    source_suffix = input_path.suffix.lower()
    if source_suffix in {".jpg", ".jpeg"}:
        return "JPEG"
    if source_suffix == ".png":
        return "PNG"
    if source_suffix == ".webp":
        return "WEBP"
    if source_suffix in {".tif", ".tiff"}:
        return "TIFF"
    return "JPEG"
