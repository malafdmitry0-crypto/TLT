"""CLI routing contracts for database seeds."""

import pytest

from app.seeds.cli import build_parser


def test_seed_cli_modes_are_mutually_exclusive():
    parser = build_parser()

    with pytest.raises(SystemExit):
        parser.parse_args(["--electrical-catalogs-only", "--specification-catalog-only"])


def test_seed_cli_defaults_to_full_run():
    args = build_parser().parse_args([])

    assert args.electrical_catalogs_only is False
    assert args.specification_catalog_only is False
