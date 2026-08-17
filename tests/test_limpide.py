from datetime import date, datetime
from io import BytesIO

import piexif
from PIL import Image

from limpide.cli import main
from limpide.exif import strip_exif
from limpide.heic import convert_heic
from limpide.jpeg_clean import strip_jpeg_app_segments
from limpide.zimmy import adjust_photo_dates, read_photo_datetime


def _jpeg_with_exif(path) -> None:
    image = Image.new("RGB", (8, 8), color=(120, 40, 200))
    exif = image.getexif()
    exif[271] = "TestCamera"
    image.save(path, format="JPEG", exif=exif.tobytes())


def test_strip_exif_removes_metadata(tmp_path):
    source = tmp_path / "with-exif.jpg"
    target = tmp_path / "clean.jpg"
    _jpeg_with_exif(source)

    strip_exif(source, target)

    with Image.open(target) as cleaned:
        assert not cleaned.getexif()


def test_strip_jpeg_app_segments_removes_app_markers():
    image = Image.new("RGB", (8, 8), color=(10, 20, 30))
    buffer = BytesIO()
    image.save(buffer, format="JPEG", exif=image.getexif().tobytes())

    stripped = strip_jpeg_app_segments(buffer.getvalue())

    assert stripped.startswith(b"\xff\xd8")
    assert b"Exif" not in stripped
    assert b"ICC_PROFILE" not in stripped


def test_convert_heic_to_jpeg(tmp_path):
    source = tmp_path / "sample.heic"
    target = tmp_path / "sample.jpg"

    image = Image.new("RGB", (12, 12), color=(10, 20, 30))
    buffer = BytesIO()
    image.save(buffer, format="HEIF")
    source.write_bytes(buffer.getvalue())

    convert_heic(source, target)

    with Image.open(target) as converted:
        assert converted.format == "JPEG"
        assert converted.size == (12, 12)


def test_convert_heic_preserves_exif(tmp_path):
    source = tmp_path / "with-exif.heic"
    target = tmp_path / "converted.jpg"

    image = Image.new("RGB", (12, 12), color=(10, 20, 30))
    exif = image.getexif()
    exif[271] = "TestCamera"
    exif[272] = "TestModel"
    buffer = BytesIO()
    image.save(buffer, format="HEIF", exif=exif.tobytes())
    source.write_bytes(buffer.getvalue())

    convert_heic(source, target)

    with Image.open(target) as converted:
        saved_exif = converted.getexif()
        assert saved_exif.get(271) == "TestCamera"
        assert saved_exif.get(272) == "TestModel"


def _jpeg_with_dates(path, stamp: str = "2024:01:01 12:00:00") -> None:
    image = Image.new("RGB", (8, 8), color=(80, 90, 100))
    exif_bytes = piexif.dump(
        {
            "0th": {piexif.ImageIFD.DateTime: stamp},
            "Exif": {
                piexif.ExifIFD.DateTimeOriginal: stamp,
                piexif.ExifIFD.DateTimeDigitized: stamp,
            },
        }
    )
    image.save(path, format="JPEG", exif=exif_bytes)


def test_zimmy_shifts_exif_dates(tmp_path):
    source = tmp_path / "walk.jpg"
    target = tmp_path / "walk.zimmy.jpg"
    _jpeg_with_dates(source)

    updated = adjust_photo_dates(source, target, shift_seconds=90)

    assert updated == datetime(2024, 1, 1, 12, 1, 30)
    assert read_photo_datetime(target) == datetime(2024, 1, 1, 12, 1, 30)
    assert read_photo_datetime(source) == datetime(2024, 1, 1, 12, 0, 0)


def test_zimmy_sets_date_and_keeps_time(tmp_path):
    source = tmp_path / "walk.jpg"
    target = tmp_path / "walk.zimmy.jpg"
    _jpeg_with_dates(source, "2023:05:10 14:32:01")

    updated = adjust_photo_dates(source, target, new_date=date(2024, 8, 16))

    assert updated == datetime(2024, 8, 16, 14, 32, 1)
    assert read_photo_datetime(target) == datetime(2024, 8, 16, 14, 32, 1)


def test_zimmy_sets_date_then_shifts(tmp_path):
    source = tmp_path / "walk.jpg"
    target = tmp_path / "walk.zimmy.jpg"
    _jpeg_with_dates(source, "2023:05:10 14:32:01")

    updated = adjust_photo_dates(
        source,
        target,
        new_date=date(2024, 8, 16),
        shift_seconds=-12,
    )

    assert updated == datetime(2024, 8, 16, 14, 31, 49)


def test_zimmy_cli_shifts_directory(tmp_path):
    folder = tmp_path / "roll"
    output = tmp_path / "out"
    folder.mkdir()
    _jpeg_with_dates(folder / "a.jpg", "2024:06:12 10:00:00")
    _jpeg_with_dates(folder / "b.jpg", "2024:06:12 10:00:15")

    assert main(["zimmy-gpx", str(folder), "--shift", "45", "-d", str(output)]) == 0

    assert read_photo_datetime(output / "a.jpg") == datetime(2024, 6, 12, 10, 0, 45)
    assert read_photo_datetime(output / "b.jpg") == datetime(2024, 6, 12, 10, 1, 0)


def test_zimmy_writes_dates_when_missing(tmp_path):
    source = tmp_path / "plain.jpg"
    target = tmp_path / "plain.zimmy.jpg"
    Image.new("RGB", (8, 8), color=(1, 2, 3)).save(source, format="JPEG")

    updated = adjust_photo_dates(
        source,
        target,
        shift_seconds=30,
        fallback=datetime(2024, 1, 1, 8, 0, 0),
    )

    assert updated == datetime(2024, 1, 1, 8, 0, 30)
    assert read_photo_datetime(target) == datetime(2024, 1, 1, 8, 0, 30)
