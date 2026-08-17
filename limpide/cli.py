from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

from limpide.exif import SUPPORTED_EXIF_FORMATS, strip_exif
from limpide.heic import SUPPORTED_HEIC_FORMATS, convert_heic
from limpide.zimmy import SUPPORTED_ZIMMY_FORMATS, adjust_photo_dates, format_exif_datetime


def _default_output_path(input_path: Path, suffix: str) -> Path:
    return input_path.with_name(f"{input_path.stem}{suffix}")


def _collect_inputs(paths: list[Path], allowed_suffixes: set[str]) -> list[Path]:
    collected: list[Path] = []
    for path in paths:
        if path.is_dir():
            for child in sorted(path.iterdir()):
                if child.is_file() and child.suffix.lower() in allowed_suffixes:
                    collected.append(child)
            continue
        if path.suffix.lower() not in allowed_suffixes:
            raise ValueError(
                f"Unsupported file: {path} "
                f"(accepted formats: {', '.join(sorted(allowed_suffixes))})"
            )
        collected.append(path)

    if not collected:
        raise ValueError("No compatible files found.")
    return collected


def _run_strip_exif(args: argparse.Namespace) -> int:
    inputs = _collect_inputs(args.inputs, SUPPORTED_EXIF_FORMATS)
    output_dir = Path(args.output_dir) if args.output_dir else None

    for input_path in inputs:
        if output_dir:
            output_path = output_dir / input_path.name
        elif args.output and len(inputs) == 1:
            output_path = Path(args.output)
        else:
            output_path = _default_output_path(input_path, f".clean{input_path.suffix}")

        strip_exif(input_path, output_path, quality=args.quality)
        print(f"EXIF stripped: {input_path} -> {output_path}")

    return 0


def _run_convert_heic(args: argparse.Namespace) -> int:
    inputs = _collect_inputs(args.inputs, SUPPORTED_HEIC_FORMATS)
    output_dir = Path(args.output_dir) if args.output_dir else None

    for input_path in inputs:
        if output_dir:
            output_path = output_dir / f"{input_path.stem}.jpg"
        elif args.output and len(inputs) == 1:
            output_path = Path(args.output)
        else:
            output_path = _default_output_path(input_path, ".jpg")

        convert_heic(input_path, output_path, quality=args.quality)
        print(f"HEIC converted: {input_path} -> {output_path}")

    return 0


def _parse_iso_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            f"Invalid date {value!r}. Use YYYY-MM-DD."
        ) from error


def _run_zimmy_gpx(args: argparse.Namespace) -> int:
    if args.date is None and not args.shift:
        raise ValueError("Provide --date YYYY-MM-DD and/or a non-zero --shift.")

    inputs = _collect_inputs(args.inputs, SUPPORTED_ZIMMY_FORMATS)
    output_dir = Path(args.output_dir) if args.output_dir else None

    for input_path in inputs:
        if args.in_place:
            output_path = input_path
        elif output_dir:
            output_path = output_dir / input_path.name
        elif args.output and len(inputs) == 1:
            output_path = Path(args.output)
        else:
            output_path = _default_output_path(input_path, f".zimmy{input_path.suffix}")

        updated = adjust_photo_dates(
            input_path,
            output_path,
            new_date=args.date,
            shift_seconds=args.shift,
        )
        print(
            f"ZimmyGpx: {input_path} -> {output_path} "
            f"({format_exif_datetime(updated)})"
        )

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="limpide",
        description="Strip EXIF, convert HEIC, and shift photo dates — local CLI.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    strip_parser = subparsers.add_parser(
        "strip-exif",
        help="Remove EXIF metadata from an image.",
    )
    strip_parser.add_argument("inputs", nargs="+", type=Path, help="Files or directories.")
    strip_parser.add_argument("-o", "--output", help="Output file (single file only).")
    strip_parser.add_argument(
        "-d",
        "--output-dir",
        help="Output directory for batch processing.",
    )
    strip_parser.add_argument(
        "-q",
        "--quality",
        type=int,
        default=95,
        help="JPEG quality (1-100, default: 95).",
    )
    strip_parser.set_defaults(handler=_run_strip_exif)

    heic_parser = subparsers.add_parser(
        "convert-heic",
        help="Convert HEIC/HEIF to JPEG.",
    )
    heic_parser.add_argument("inputs", nargs="+", type=Path, help="Files or directories.")
    heic_parser.add_argument("-o", "--output", help="Output file (single file only).")
    heic_parser.add_argument(
        "-d",
        "--output-dir",
        help="Output directory for batch processing.",
    )
    heic_parser.add_argument(
        "-q",
        "--quality",
        type=int,
        default=95,
        help="JPEG quality (1-100, default: 95).",
    )
    heic_parser.set_defaults(handler=_run_convert_heic)

    zimmy_parser = subparsers.add_parser(
        "zimmy-gpx",
        help="Change or shift EXIF dates on a folder of JPEGs (no GPX file).",
    )
    zimmy_parser.add_argument("inputs", nargs="+", type=Path, help="Files or directories.")
    zimmy_parser.add_argument("-o", "--output", help="Output file (single file only).")
    zimmy_parser.add_argument(
        "-d",
        "--output-dir",
        help="Output directory for batch processing.",
    )
    zimmy_parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite the original files.",
    )
    zimmy_parser.add_argument(
        "--date",
        type=_parse_iso_date,
        help="Set the calendar date on every photo (YYYY-MM-DD). Times are kept.",
    )
    zimmy_parser.add_argument(
        "--shift",
        type=int,
        default=0,
        help="Add or subtract this many seconds on every photo (negative allowed).",
    )
    zimmy_parser.set_defaults(handler=_run_zimmy_gpx)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.handler(args)
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
