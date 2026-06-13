from __future__ import annotations


def strip_jpeg_app_segments(data: bytes) -> bytes:
    """Remove APP and COM markers from a JPEG, keeping image data intact."""
    if len(data) < 2 or data[0] != 0xFF or data[1] != 0xD8:
        raise ValueError("Not a JPEG file.")

    chunks = [data[:2]]
    offset = 2

    while offset < len(data):
        if data[offset] != 0xFF:
            break

        marker_start = offset
        offset += 1
        marker = data[offset]
        offset += 1

        if marker == 0xD9:
            chunks.append(data[marker_start:offset])
            break

        if marker in {0xD0, 0xD1, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7} or marker == 0x01:
            chunks.append(data[marker_start:offset])
            continue

        if marker == 0xDA:
            chunks.append(data[marker_start:])
            break

        if offset + 1 >= len(data):
            break

        segment_length = (data[offset] << 8) + data[offset + 1]
        segment_end = offset + segment_length
        if segment_length < 2 or segment_end > len(data):
            break

        is_app = 0xE0 <= marker <= 0xEF
        is_comment = marker == 0xFE
        if not is_app and not is_comment:
            chunks.append(data[marker_start:segment_end])

        offset = segment_end

    return b"".join(chunks)
