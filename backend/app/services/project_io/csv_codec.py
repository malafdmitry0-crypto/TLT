"""Low-level codec for sectioned project CSV files."""

from __future__ import annotations

import csv
import io
from collections import defaultdict
from collections.abc import Iterable
from typing import Any, Protocol

from app.services.project_io.contracts import DELIMITER, ProjectImportError, Sections
from app.services.spreadsheet_safety import safe_spreadsheet_cell


class CsvWriter(Protocol):
    def writerow(self, row: Iterable[Any], /) -> Any: ...


def safe_csv_cell(value: Any) -> Any:
    return safe_spreadsheet_cell(value)


def write_row(writer: CsvWriter, row: list[Any]) -> None:
    writer.writerow([safe_csv_cell(value) for value in row])


def write_section(writer: CsvWriter, name: str) -> None:
    write_row(writer, ["[SECTION]", name])


def create_writer() -> tuple[io.StringIO, CsvWriter]:
    buffer = io.StringIO()
    return buffer, csv.writer(buffer, delimiter=DELIMITER, quoting=csv.QUOTE_MINIMAL)


def encode_buffer(buffer: io.StringIO) -> bytes:
    return ("\ufeff" + buffer.getvalue()).encode("utf-8")


def decode_csv(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ProjectImportError("Не удалось определить кодировку файла")


def detect_delimiter(text: str) -> str:
    """Use the section marker before falling back to csv.Sniffer."""
    for line in text.splitlines():
        stripped = line.lstrip("\ufeff").strip()
        if stripped.upper().startswith("[SECTION]"):
            if len(stripped) > len("[SECTION]"):
                candidate = stripped[len("[SECTION]")]
                if candidate in ";,\t|":
                    return candidate
            break
    try:
        return csv.Sniffer().sniff(text[:4096], delimiters=";,\t").delimiter
    except csv.Error:
        return DELIMITER


def parse_sections(raw: bytes) -> Sections:
    text = decode_csv(raw)
    reader = csv.reader(io.StringIO(text), delimiter=detect_delimiter(text))
    sections: dict[str, list[list[str]]] = defaultdict(list)
    current: str | None = None
    for row in reader:
        if not row or all(not cell.strip() for cell in row):
            continue
        if row[0].strip().upper() == "[SECTION]" and len(row) >= 2:
            current = row[1].strip().lower()
            continue
        if current is not None:
            sections[current].append(list(row))
    return dict(sections)


def rows_to_dicts(rows: list[list[str]]) -> list[dict[str, str]]:
    if not rows:
        return []
    header = [cell.strip() for cell in rows[0]]
    result: list[dict[str, str]] = []
    for row in rows[1:]:
        padded = row + [""] * (len(header) - len(row))
        result.append({header[index]: padded[index] for index in range(len(header))})
    return result
