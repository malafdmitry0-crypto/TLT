#!/usr/bin/env python3
"""Convert Visio VSDX flowcharts into Markdown, Mermaid and JSON.

The TNP algorithm PDFs are visual exports, but the repository also contains
their source .vsdx files. VSDX is a ZIP package with Visio XML, so we can parse
shapes and connector edges directly instead of guessing from a rendered image.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs" / "tnp" / "algorithms"
GENERATED = DOCS / "generated"
VISIO_NS = {"v": "http://schemas.microsoft.com/office/visio/2012/main"}
VISIO = "{http://schemas.microsoft.com/office/visio/2012/main}"


@dataclass(frozen=True)
class Shape:
    id: str
    kind: str
    text: str
    x: float | None
    y: float | None
    width: float | None
    height: float | None
    is_connector: bool


@dataclass(frozen=True)
class Edge:
    connector_id: str
    source: str
    target: str
    label: str
    inferred: bool = False


@dataclass(frozen=True)
class AlgorithmSpec:
    slug: str
    title: str
    source_vsdx: str
    source_pdf: str
    output_md: str
    thumbnail: str
    interpretation: list[str]
    qa_notes: list[str]
    manual_targets: dict[str, str]


SPECS: list[AlgorithmSpec] = [
    AlgorithmSpec(
        slug="climate",
        title="Алгоритм: климат и коэффициент запаса",
        source_vsdx="Алгоритмы/алгоритм климат.vsdx",
        source_pdf="Алгоритмы/алгоритм климат.pdf",
        output_md="climate.md",
        thumbnail="../assets/pdf-thumbnails/алгоритм климат.pdf.png",
        interpretation=[
            "Для трубопровода алгоритм выбирает расчетную температуру и коэффициент запаса по диаметру.",
            "Если `T0`/`T1` не заданы, они берутся из климатической базы по параметру `A`.",
            "По схеме: для `D >= 100` используется `K = 1,1`, `T = T1`; для меньших диаметров используется ветка `K = 1,12`, `T = T0`.",
            "Для не-труб используется минимальная температура наиболее холодной пятидневки с обеспеченностью `0,92`; итоговый коэффициент `K = 1,1`.",
        ],
        qa_notes=[
            "Порог `D = 100` должен быть явно зафиксирован в миллиметрах.",
            "Нужны boundary cases для `D = 99, 100, 101` и для отсутствующих значений `T0`, `T1`, `T`.",
            "В QA-agent правило закреплено как deterministic oracle `tlt_climate_safety_factor`.",
        ],
        manual_targets={},
    ),
    AlgorithmSpec(
        slug="winding",
        title="Алгоритм: максимальный коэффициент навива",
        source_vsdx="Алгоритмы/алгоритм навив.vsdx",
        source_pdf="Алгоритмы/алгоритм навив.pdf",
        output_md="winding.md",
        thumbnail="../assets/pdf-thumbnails/алгоритм навив.pdf.png",
        interpretation=[
            "Алгоритм определяет максимальный коэффициент навива `Kn` по диаметру трубопровода `D`.",
            "В схеме заданы интервалы: `D < 57`, `D = 57`, `57 < D < 75`, `75 < D < 89`, `89 < D < 108`, `D > 108`.",
            "Результаты веток: `1`, `1,1`, `1,2`, `1,3`, `1,4`, `1,5` соответственно.",
            "Для QA принято консервативное заполнение граничных точек: `57 < D <= 75`, `75 < D <= 89`, `89 < D <= 108`.",
        ],
        qa_notes=[
            "В схеме нет явных веток для `D = 75`, `D = 89`, `D = 108`; QA-agent нормализует их в нижний соседний диапазон как более консервативный максимум навива.",
            "В QA-agent правило закреплено как deterministic oracle `tlt_max_winding_coefficient`.",
        ],
        manual_targets={},
    ),
    AlgorithmSpec(
        slug="self-regulating-pipe-selection",
        title="Алгоритм: выбор саморегулирующегося кабеля для трубопровода",
        source_vsdx="Алгоритмы/Алгоритм Самрег.трубы.vsdx",
        source_pdf="Алгоритмы/Алгоритм Самрег. трубы.pdf",
        output_md="self-regulating-pipe-selection.md",
        thumbnail="../assets/pdf-thumbnails/Алгоритм Самрег. трубы.pdf.png",
        interpretation=[
            "Алгоритм выбирает серию `ТТН`, `ТТВ` или `ТТХ` по температурам продукта и пропарки.",
            "Для выбранной серии перебираются номиналы кабеля и считается `Pi.ном(T3) = Q(i,1) * T3 + Q(i,2)`.",
            "Подходящим считается кабель, у которого `Pi(T3) >= Pоб`.",
            "Суффикс марки зависит от агрессивности продукта: `СТ` для агрессивного продукта, иначе `СР`.",
            "Количество ниток считается как округление вверх `Pоб / Pi.ном(T3)`.",
        ],
        qa_notes=[
            "Температурные пределы трактуются как включительные паспортные максимумы: `<=65`, `<=85`, `<=120`, `<=210`, `<=150`, `<=250`.",
            "Нужно зафиксировать единицы `Pоб`: Вт/м или суммарная мощность. Для выбора кабеля корректнее удельная требуемая мощность.",
        ],
        manual_targets={
            # These six connectors terminate on shared vertical lines in Visio,
            # not directly on a shape. The target below is the downstream block
            # reached by that shared line in the rendered flowchart.
            "60": "30",
            "70": "104",
            "116": "110",
            "119": "122",
            "140": "134",
            "143": "146",
        },
    ),
    AlgorithmSpec(
        slug="resistive-selection",
        title="Алгоритм: подбор резистивного кабеля",
        source_vsdx="Алгоритмы/Алгоритм подбора резистив.vsdx",
        source_pdf="Алгоритмы/Алгоритм подбора резистив.pdf",
        output_md="resistive-selection.md",
        thumbnail="../assets/pdf-thumbnails/Алгоритм подбора резистив.pdf.png",
        interpretation=[
            "Алгоритм загружает параметры выбранной кабельной линейки `Q(i,j)` и сортирует их по сопротивлению `Q(i,1)` по убыванию.",
            "Далее рассчитываются длины нагревательных секций `L1`, `L2`, мощность секции `p2` и максимально допустимая мощность `p3`.",
            "Кабель выбирается при выполнении ограничений по теплопотерям, допустимой мощности, напряжению и схеме соединения.",
            "Схема содержит отдельные ветки для `U = 220`, `U = 380`, `N = 2`, `N = 3` и количества схем `M`.",
        ],
        qa_notes=[
            "Нужны deterministic cases для каждой схемы соединения, уже реализованной в backend.",
            "Отдельно проверить near-threshold подбор: выбранное сечение/сопротивление должно быть минимально достаточным, а не просто первым подходящим.",
        ],
        manual_targets={},
    ),
]


def clean_text(value: str) -> str:
    value = value.replace("\u00a0", " ")
    value = re.sub(r"[ \t\r\f\v]+", " ", value)
    value = re.sub(r" *\n *", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def parse_float(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def shape_text(shape: ET.Element) -> str:
    parts: list[str] = []
    for text_node in shape.findall(f"{VISIO}Text"):
        parts.extend(text_node.itertext())
    return clean_text("".join(parts))


def shape_cells(shape: ET.Element) -> dict[str, str]:
    cells: dict[str, str] = {}
    for cell in shape.findall(f"{VISIO}Cell"):
        name = cell.attrib.get("N")
        value = cell.attrib.get("V")
        if name and value is not None:
            cells[name] = value
    return cells


def shape_kind(shape: ET.Element) -> str:
    name = shape.attrib.get("NameU") or shape.attrib.get("Name") or ""
    name = re.sub(r"\.\d+$", "", name)
    return clean_text(name) or "Shape"


def is_connector(kind: str, cells: dict[str, str]) -> bool:
    return "connector" in kind.lower() or {"BeginX", "BeginY", "EndX", "EndY"}.issubset(cells)


def parse_vsdx(path: Path, manual_targets: dict[str, str]) -> tuple[list[Shape], list[Edge], list[str]]:
    warnings: list[str] = []
    with ZipFile(path) as package:
        page = ET.fromstring(package.read("visio/pages/page1.xml"))

    shapes_by_id: dict[str, Shape] = {}
    for raw in page.findall(".//v:Shape", VISIO_NS):
        shape_id = raw.attrib.get("ID")
        if not shape_id:
            continue
        cells = shape_cells(raw)
        kind = shape_kind(raw)
        parsed = Shape(
            id=shape_id,
            kind=kind,
            text=shape_text(raw),
            x=parse_float(cells.get("PinX")),
            y=parse_float(cells.get("PinY")),
            width=parse_float(cells.get("Width")),
            height=parse_float(cells.get("Height")),
            is_connector=is_connector(kind, cells),
        )
        shapes_by_id[shape_id] = parsed

    connector_parts: dict[str, dict[str, str]] = {}
    for connect in page.findall(".//v:Connect", VISIO_NS):
        from_sheet = connect.attrib.get("FromSheet")
        from_cell = connect.attrib.get("FromCell", "")
        to_sheet = connect.attrib.get("ToSheet")
        if not from_sheet or not to_sheet:
            continue
        if from_cell.startswith("Begin"):
            connector_parts.setdefault(from_sheet, {})["begin"] = to_sheet
        elif from_cell.startswith("End"):
            connector_parts.setdefault(from_sheet, {})["end"] = to_sheet

    edges: list[Edge] = []
    for connector_id, parts in sorted(connector_parts.items(), key=lambda item: int(item[0])):
        source = parts.get("begin")
        target = parts.get("end")
        connector = shapes_by_id.get(connector_id)
        inferred = False
        if source and not target and connector_id in manual_targets:
            target = manual_targets[connector_id]
            inferred = True
        if not source or not target:
            warnings.append(f"Connector {connector_id} skipped: missing begin/end endpoint")
            continue
        if source not in shapes_by_id or target not in shapes_by_id:
            warnings.append(f"Connector {connector_id} skipped: endpoint shape not found")
            continue
        label = connector.text if connector else ""
        edges.append(
            Edge(
                connector_id=connector_id,
                source=source,
                target=target,
                label=label,
                inferred=inferred,
            )
        )

    shapes = sorted(
        shapes_by_id.values(),
        key=lambda s: (-(s.y or 0.0), s.x or 0.0, int(s.id)),
    )
    return shapes, edges, warnings


def mermaid_escape(text: str, limit: int = 96) -> str:
    text = clean_text(text).replace('"', "'")
    text = text.replace("\n", "<br/>")
    if len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return text


def markdown_escape(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", "<br>")


def mermaid_node(shape: Shape) -> str:
    node_id = f"S{shape.id}"
    label = mermaid_escape(shape.text or shape.kind)
    kind = shape.kind.lower()
    if "decision" in kind:
        return f'  {node_id}{{"{label}"}}'
    if "start/end" in kind or "terminator" in kind:
        return f'  {node_id}(["{label}"])'
    if "database" in kind:
        return f'  {node_id}[("{label}")]'
    if "data" in kind:
        return f'  {node_id}[/"{label}"/]'
    return f'  {node_id}["{label}"]'


def render_mermaid(shapes: list[Shape], edges: list[Edge]) -> str:
    node_ids = {shape.id for shape in shapes if not shape.is_connector and shape.text}
    lines = ["flowchart TD"]
    for shape in shapes:
        if shape.id in node_ids:
            lines.append(mermaid_node(shape))
    for edge in edges:
        if edge.source not in node_ids or edge.target not in node_ids:
            continue
        label = mermaid_escape(edge.label, limit=32)
        if label:
            lines.append(f"  S{edge.source} -->|{label}| S{edge.target}")
        else:
            lines.append(f"  S{edge.source} --> S{edge.target}")
    return "\n".join(lines) + "\n"


def short_text(shapes_by_id: dict[str, Shape], shape_id: str) -> str:
    shape = shapes_by_id.get(shape_id)
    if not shape:
        return shape_id
    text = clean_text(shape.text or shape.kind).replace("\n", " / ")
    return text if len(text) <= 90 else text[:87].rstrip() + "..."


def render_markdown(spec: AlgorithmSpec, shapes: list[Shape], edges: list[Edge], warnings: list[str]) -> str:
    shapes_by_id = {shape.id: shape for shape in shapes}
    non_connector_shapes = [shape for shape in shapes if not shape.is_connector and shape.text]

    lines: list[str] = [
        f"# {spec.title}",
        "",
        f"Источник VSDX: `{spec.source_vsdx}`",
        f"Источник PDF: `{spec.source_pdf}`",
        "",
        f"![Схема]({spec.thumbnail})",
        "",
        "## Машинно извлеченная схема",
        "",
        f"- Узлов с текстом: `{len(non_connector_shapes)}`.",
        f"- Переходов Begin→End: `{len(edges)}`.",
        f"- JSON: [`generated/{spec.slug}.json`](generated/{spec.slug}.json).",
        f"- Mermaid: [`generated/{spec.slug}.mmd`](generated/{spec.slug}.mmd).",
        "",
        "```mermaid",
        render_mermaid(shapes, edges).rstrip(),
        "```",
        "",
        "## Узлы",
        "",
        "| ID | Тип | Текст |",
        "|---|---|---|",
    ]
    for shape in non_connector_shapes:
        lines.append(
            f"| S{shape.id} | {markdown_escape(shape.kind)} | {markdown_escape(shape.text)} |"
        )

    lines += [
        "",
        "## Переходы",
        "",
        "| # | Откуда | Условие/подпись | Куда | Connector |",
        "|---|---|---|---|---|",
    ]
    for idx, edge in enumerate(edges, start=1):
        lines.append(
            "| "
            + " | ".join(
                [
                    str(idx),
                    f"S{edge.source}: {markdown_escape(short_text(shapes_by_id, edge.source))}",
                    markdown_escape(edge.label),
                    f"S{edge.target}: {markdown_escape(short_text(shapes_by_id, edge.target))}",
                    f"S{edge.connector_id}" + ("; inferred target" if edge.inferred else ""),
                ]
            )
            + " |"
        )

    lines += ["", "## Интерпретация для реализации", ""]
    for item in spec.interpretation:
        lines.append(f"- {item}")
    lines += ["", "## QA-заметки", ""]
    for item in spec.qa_notes:
        lines.append(f"- {item}")
    if warnings:
        lines += ["", "## Предупреждения конвертации", ""]
        for warning in warnings:
            lines.append(f"- {warning}")
    return "\n".join(lines).rstrip() + "\n"


def write_algorithm(spec: AlgorithmSpec) -> None:
    source = ROOT / spec.source_vsdx
    shapes, edges, warnings = parse_vsdx(source, spec.manual_targets)
    GENERATED.mkdir(parents=True, exist_ok=True)

    json_payload: dict[str, Any] = {
        "sourceVsdx": spec.source_vsdx,
        "sourcePdf": spec.source_pdf,
        "title": spec.title,
        "shapes": [asdict(shape) for shape in shapes],
        "edges": [asdict(edge) for edge in edges],
        "warnings": warnings,
    }
    (GENERATED / f"{spec.slug}.json").write_text(
        json.dumps(json_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (GENERATED / f"{spec.slug}.mmd").write_text(render_mermaid(shapes, edges), encoding="utf-8")
    (DOCS / spec.output_md).write_text(render_markdown(spec, shapes, edges, warnings), encoding="utf-8")


def main() -> None:
    for spec in SPECS:
        write_algorithm(spec)


if __name__ == "__main__":
    main()
