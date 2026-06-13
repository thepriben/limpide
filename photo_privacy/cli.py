from __future__ import annotations

import argparse
import sys
from pathlib import Path

from photo_privacy.exif import SUPPORTED_EXIF_FORMATS, strip_exif
from photo_privacy.heic import SUPPORTED_HEIC_FORMATS, convert_heic


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
                f"Fichier ignoré ou non pris en charge : {path} "
                f"(formats acceptés : {', '.join(sorted(allowed_suffixes))})"
            )
        collected.append(path)

    if not collected:
        raise ValueError("Aucun fichier compatible trouvé.")
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
        print(f"EXIF supprimé : {input_path} -> {output_path}")

    return 0


def _run_convert_heic(args: argparse.Namespace) -> int:
    inputs = _collect_inputs(args.inputs, SUPPORTED_HEIC_FORMATS)
    output_dir = Path(args.output_dir) if args.output_dir else None
    output_suffix = ".jpg" if args.format == "jpeg" else ".png"

    for input_path in inputs:
        if output_dir:
            output_path = output_dir / f"{input_path.stem}{output_suffix}"
        elif args.output and len(inputs) == 1:
            output_path = Path(args.output)
        else:
            output_path = _default_output_path(input_path, output_suffix)

        convert_heic(
            input_path,
            output_path,
            output_format=args.format.upper(),
            quality=args.quality,
        )
        print(f"HEIC converti : {input_path} -> {output_path}")

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="photo-privacy",
        description="Suppression EXIF et conversion HEIC pour protéger la vie privée.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    strip_parser = subparsers.add_parser(
        "strip-exif",
        help="Supprime les métadonnées EXIF d'une image.",
    )
    strip_parser.add_argument("inputs", nargs="+", type=Path, help="Fichiers ou dossiers.")
    strip_parser.add_argument("-o", "--output", help="Fichier de sortie (un seul fichier).")
    strip_parser.add_argument(
        "-d",
        "--output-dir",
        help="Dossier de sortie pour un traitement par lot.",
    )
    strip_parser.add_argument(
        "-q",
        "--quality",
        type=int,
        default=95,
        help="Qualité JPEG (1-100, défaut : 95).",
    )
    strip_parser.set_defaults(handler=_run_strip_exif)

    heic_parser = subparsers.add_parser(
        "convert-heic",
        help="Convertit HEIC/HEIF vers JPEG ou PNG.",
    )
    heic_parser.add_argument("inputs", nargs="+", type=Path, help="Fichiers ou dossiers.")
    heic_parser.add_argument("-o", "--output", help="Fichier de sortie (un seul fichier).")
    heic_parser.add_argument(
        "-d",
        "--output-dir",
        help="Dossier de sortie pour un traitement par lot.",
    )
    heic_parser.add_argument(
        "-f",
        "--format",
        choices=["jpeg", "png"],
        default="jpeg",
        help="Format de sortie (défaut : jpeg).",
    )
    heic_parser.add_argument(
        "-q",
        "--quality",
        type=int,
        default=95,
        help="Qualité JPEG (1-100, défaut : 95).",
    )
    heic_parser.set_defaults(handler=_run_convert_heic)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.handler(args)
    except ValueError as error:
        print(f"Erreur : {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
