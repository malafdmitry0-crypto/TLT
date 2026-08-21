"""Command-line interface for database seeds."""

import argparse
import asyncio
import logging
from collections.abc import Sequence

from app.seeds.runner import (
    run_electrical_catalog_seed,
    run_seeds,
    run_specification_catalog_seed,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Seed HeatCalc data")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument(
        "--electrical-catalogs-only",
        action="store_true",
        help="register bundled electrical catalogs without demo projects",
    )
    modes.add_argument(
        "--specification-catalog-only",
        action="store_true",
        help="register the non-production Case 1 DEMO specification catalog",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    args = build_parser().parse_args(argv)
    if args.electrical_catalogs_only:
        asyncio.run(run_electrical_catalog_seed())
    elif args.specification_catalog_only:
        asyncio.run(run_specification_catalog_seed())
    else:
        asyncio.run(run_seeds())
