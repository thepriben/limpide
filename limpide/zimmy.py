from __future__ import annotations

from datetime import date, datetime, timedelta
from io import BytesIO
from pathlib import Path

import piexif

SUPPORTED_ZIMMY_FORMATS = {".jpg", ".jpeg"}
EXIF_DATE_FORMAT = "%Y:%m:%d %H:%M:%S"

_DATE_TAGS = (
    ("0th", piexif.ImageIFD.DateTime),
    ("Exif", piexif.ExifIFD.DateTimeOriginal),
    ("Exif", piexif.ExifIFD.DateTimeDigitized),
)


def parse_exif_datetime(value: object) -> datetime | None:
    text = _as_text(value).strip()
    if not text:
        return None
    try:
        return datetime.strptime(text, EXIF_DATE_FORMAT)
    except ValueError:
        return None


def format_exif_datetime(value: datetime) -> str:
    return value.strftime(EXIF_DATE_FORMAT)


def apply_datetime_adjustments(
    value: datetime,
    *,
    new_date: date | None = None,
    shift_seconds: int = 0,
) -> datetime:
    adjusted = value
    if new_date is not None:
        adjusted = adjusted.replace(
            year=new_date.year,
            month=new_date.month,
            day=new_date.day,
        )
    if shift_seconds:
        adjusted = adjusted + timedelta(seconds=shift_seconds)
    return adjusted


def read_photo_datetime(input_path: Path) -> datetime | None:
    """Return DateTimeOriginal, then DateTimeDigitized, then DateTime."""
    exif_dict = piexif.load(input_path.read_bytes())
    return _first_datetime(exif_dict)


def adjust_photo_dates(
    input_path: Path,
    output_path: Path,
    *,
    new_date: date | None = None,
    shift_seconds: int = 0,
    fallback: datetime | None = None,
) -> datetime:
    """Rewrite EXIF dates without re-encoding the JPEG."""
    suffix = input_path.suffix.lower()
    if suffix not in SUPPORTED_ZIMMY_FORMATS:
        raise ValueError(
            f"Unsupported format for ZimmyGpx: {suffix}. "
            f"Accepted formats: {', '.join(sorted(SUPPORTED_ZIMMY_FORMATS))}"
        )
    if new_date is None and not shift_seconds:
        raise ValueError("Provide a date and/or a non-zero second shift.")

    jpeg_bytes = input_path.read_bytes()
    exif_dict = piexif.load(jpeg_bytes)
    source = _first_datetime(exif_dict) or fallback or datetime.fromtimestamp(
        input_path.stat().st_mtime
    )
    updated = _rewrite_exif_dates(
        exif_dict,
        source,
        new_date=new_date,
        shift_seconds=shift_seconds,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    buffer = BytesIO()
    piexif.insert(piexif.dump(exif_dict), jpeg_bytes, buffer)
    output_path.write_bytes(buffer.getvalue())
    return updated


def _as_text(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode("ascii", errors="replace").rstrip("\x00")
    return str(value)


def _first_datetime(exif_dict: dict) -> datetime | None:
    for ifd_name, tag in (
        ("Exif", piexif.ExifIFD.DateTimeOriginal),
        ("Exif", piexif.ExifIFD.DateTimeDigitized),
        ("0th", piexif.ImageIFD.DateTime),
    ):
        parsed = parse_exif_datetime(exif_dict.get(ifd_name, {}).get(tag))
        if parsed:
            return parsed
    return None


def _rewrite_exif_dates(
    exif_dict: dict,
    fallback: datetime,
    *,
    new_date: date | None,
    shift_seconds: int,
) -> datetime:
    wrote = False
    primary: datetime | None = None

    for ifd_name, tag in _DATE_TAGS:
        ifd = exif_dict.setdefault(ifd_name, {})
        current = parse_exif_datetime(ifd.get(tag))
        if current is None:
            continue
        updated = apply_datetime_adjustments(
            current,
            new_date=new_date,
            shift_seconds=shift_seconds,
        )
        ifd[tag] = format_exif_datetime(updated)
        wrote = True
        if primary is None:
            primary = updated

    if not wrote:
        primary = apply_datetime_adjustments(
            fallback,
            new_date=new_date,
            shift_seconds=shift_seconds,
        )
        stamp = format_exif_datetime(primary)
        exif_dict.setdefault("0th", {})[piexif.ImageIFD.DateTime] = stamp
        exif_dict.setdefault("Exif", {})[piexif.ExifIFD.DateTimeOriginal] = stamp
        exif_dict.setdefault("Exif", {})[piexif.ExifIFD.DateTimeDigitized] = stamp

    return primary or fallback
