"""Генерация HTML-предпросмотра и PDF-отчёта."""

from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_env = Environment(
    loader=FileSystemLoader(_TEMPLATES_DIR),
    autoescape=select_autoescape(["html", "xml"]),
)


def render_html(context: dict[str, Any]) -> str:
    template = _env.get_template("report.html")
    return template.render(**context)


def generate_pdf(context: dict[str, Any]) -> bytes:
    """PDF из HTML через WeasyPrint."""
    from weasyprint import HTML  # импорт lazy — тяжёлые бинарные зависимости

    html_str = render_html(context)
    return HTML(string=html_str).write_pdf() or b""
