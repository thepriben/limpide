from io import BytesIO

from PIL import Image

from limpide.exif import strip_exif
from limpide.heic import convert_heic
from limpide.jpeg_clean import strip_jpeg_app_segments


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
