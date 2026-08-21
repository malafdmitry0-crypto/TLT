#!/usr/bin/env python3
"""HTML-версия кадров кейса 1 — из того же источника, что и Penpot.

    python3 scripts/render_html.py

Кадры берутся из `penpot_screens.build_all()`, поэтому HTML и Penpot не могут
разъехаться: правка в screens меняет оба. Стили шаблонов сняты с реальных
шейпов файла «Формы TLT» (см. TPL ниже) — визуальный язык не переизобретается.

Результат: mockups/html/index.html + по файлу на кадр + all.html
"""
import hashlib
import html
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import penpot_screens as S  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "mockups", "html")

# Стили — из общего модуля: ровно те же значения применяет Penpot-рантайм.
from penpot_kit import ROLE_STYLE as ROLES, TPL_STYLE as TPL  # noqa: E402


CSS = """/* Кадры кейса 1 — additive-слой поверх heatcalc-shared.css (R1: базовый файл не тронут).
   Значения цветов, скруглений и шрифтов сняты с шейпов Penpot «Формы TLT». */
body { margin: 0; background: #eef2f7; }
.page { padding: 24px; }
.frame-title {
  font: 600 13px/1.3 -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  color: #26364a; margin: 26px 0 6px; display: flex; gap: 10px; align-items: baseline;
}
.frame-title .size { font-weight: 400; color: #7b8794; font-size: 12px; }
.frame {
  position: relative; background: #fff; overflow: hidden;
  border: 1px solid #cfd8e3; box-shadow: 0 1px 3px rgba(20,30,50,.08);
}
.frame > * { position: absolute; box-sizing: border-box; }
.t {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  line-height: 1.2; white-space: nowrap; overflow: visible;
}
.b { box-sizing: border-box; }
.t.t-wrap { white-space: normal; line-height: 1.35 !important; }
.panel-slot { background: #fff; border: 1px solid #e7e9ec; border-radius: 8px; overflow: hidden; }
.panel-slot { border-color: #e3e9f0; }
.panel-slot .panel-title {
  padding: 9px 12px; font: 700 11px/1.2 -apple-system, Arial, sans-serif;
  letter-spacing: .4px; color: #26364a; border-bottom: 1px solid #eef2f7;
  background: #fbfcfe;
}
.panel-slot .fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 16px; padding: 12px; }
.panel-slot.narrow .fields { grid-template-columns: repeat(2, 1fr); gap: 8px 12px; }
.panel-slot.narrow .f { grid-template-columns: 86px 1fr; gap: 6px; }
.panel-slot.narrow .f label { font-size: 10.5px; }
.panel-slot.narrow .f .ctl { font-size: 11px; }
.panel-slot .f { display: grid; grid-template-columns: 104px 1fr; gap: 8px; align-items: center; }
.panel-slot .f label { font: 600 11px/1.25 -apple-system, Arial, sans-serif; color: #26364a; }
/* поле ввода: значение слева, единица отдельной ячейкой справа —
   обязательные поля с кремовой заливкой и оранжевой полосой (как в продукте) */
.panel-slot .f .ctl {
  height: 30px; display: flex; align-items: stretch;
  border: 1px solid #e3e9f0; border-radius: 6px; overflow: hidden; background: #fff;
  font: 400 11.5px/1 -apple-system, Arial, sans-serif; color: #26364a;
}
.panel-slot .f .ctl .v { flex: 1; display: flex; align-items: center; padding: 0 8px; }
.panel-slot .f .ctl.filled .v { background: #fffdf6; border-left: 3px solid #d48806; }
.panel-slot .f .ctl .u {
  display: flex; align-items: center; padding: 0 8px; color: #26364a;
  border-left: 1px solid #e3e9f0; background: #fff; font-size: 11px;
}
/* Навигация по набору */
.nav-index { font: 400 13px/1.5 -apple-system, Arial, sans-serif; color: #26364a; }
.nav-index h1 { font-size: 20px; margin: 0 0 4px; }
.nav-index h2 { font-size: 14px; margin: 22px 0 8px; color: #1a5276; }
.nav-index a { color: #1a5276; }
.nav-index .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 10px; }
.nav-index .card {
  background: #fff; border: 1px solid #cfd8e3; border-radius: 8px; padding: 10px 12px;
}
.nav-index .card .meta { color: #7b8794; font-size: 12px; }
.nav-index .card .note { color: #55606d; font-size: 11.5px; margin-top: 4px; }
"""

def esc(s):
    return html.escape(str(s), quote=True)


def render_op(op):
    tpl = op["tpl"]
    x, y = op["x"], op["y"]          # координаты ops — локальные для кадра
    w, h = op["w"], op["h"]
    style = [f"left:{x}px", f"top:{y}px", f"width:{w}px"]
    if op.get("opacity") is not None:
        style.append(f"opacity:{op['opacity']}")

    spec = TPL.get(tpl, dict(kind="box", fill="#ffffff", stroke="#d9d9d9", radius=3))

    if spec["kind"] == "text":
        role = ROLES.get(op.get("role") or "", {})
        size = role.get("size", spec["size"])
        weight = role.get("weight", spec["weight"])
        color = op.get("fill") or role.get("color") or spec["color"]
        if op.get("on_primary"):
            color = "#ffffff"
        style += [f"font-size:{size}px", f"font-weight:{weight}", f"color:{color}"]
        if h:
            style.append(f"line-height:{h}px")
        cls = "t t-wrap" if op.get("wrap") else "t"
        attrs = f' data-layer="{op.get("layer", 0)}"'
        if op.get("in_table"):
            attrs += ' data-table="1"'
        return (f'<div class="{cls}"{attrs} style="{";".join(style)}">'
                f'{esc(op.get("text") or "")}</div>')

    style.append(f"height:{h or 20}px")
    style.append(f"background:{op.get('fill') or spec.get('fill', '#fff')}")
    if spec.get("stroke"):
        style.append(f"border:1px solid {spec['stroke']}")
    if spec.get("shadow"):
        style.append(f"box-shadow:{spec['shadow']}")
    style.append(f"border-radius:{spec.get('radius', 0)}px")
    return f'<div class="b" style="{";".join(style)}"></div>'


def render_frame(f):
    body = "\n".join(render_op(o) for o in f.ops if o.get("only") != "penpot")
    return (f'<div class="frame" style="width:{f.w}px;height:{f.h}px">\n{body}\n</div>')


def slug(name):
    tr = {"а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z",
          "и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r",
          "с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"c","ч":"ch","ш":"sh","щ":"sch",
          "ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"}
    s = "".join(tr.get(ch, tr.get(ch.lower(), ch)) if ch.lower() in tr else ch
                for ch in name.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return re.sub(r"-+", "-", s)


PAGE = """<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<title>{title}</title>
<link rel="stylesheet" href="{prefix}../heatcalc-shared.css?v={ver}">
<link rel="stylesheet" href="{prefix}frames.css?v={ver}">
</head><body><div class="page">
{body}
</div></body></html>
"""


def main():
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "frames.css"), "w", encoding="utf-8") as fh:
        fh.write(CSS)
    ver = hashlib.md5(CSS.encode("utf-8")).hexdigest()[:8]

    frames = S.build_all()
    group_of = {}
    for key in S.ORDER:
        for fr in S.SCREENS[key](0):
            group_of[fr.name] = key

    titles = {"chrome": "Гостевая шапка", "elec": "Электротехнический расчёт",
              "spec": "Спецификация", "heat": "Исходные данные",
              "misc": "Главная, справка, сессия, отчёт"}

    all_body, cards = [], {}
    for f in frames:
        note = next((o["text"] for o in reversed(f.ops)
                     if o.get("text") and o["text"].startswith("D-")), "")
        head = (f'<div class="frame-title">{esc(f.name)}'
                f'<span class="size">{f.w}×{f.h}</span></div>')
        block = head + render_frame(f)
        all_body.append(block)

        fn = slug(f.name) + ".html"
        with open(os.path.join(OUT, fn), "w", encoding="utf-8") as fh:
            fh.write(PAGE.format(title=esc(f.name), prefix="", body=block, ver=ver))
        cards.setdefault(group_of.get(f.name, "?"), []).append((fn, f, note))

    with open(os.path.join(OUT, "all.html"), "w", encoding="utf-8") as fh:
        fh.write(PAGE.format(title="Все кадры кейса 1", prefix="",
                             body="\n".join(all_body), ver=ver))

    idx = ['<div class="nav-index">',
           "<h1>Макеты кейса 1 — гостевой путь HeatCalc</h1>",
           f"<p>{len(frames)} кадров. Собраны из того же источника, что и Penpot "
           "«Формы TLT» (<code>scripts/penpot_screens.py</code>), поэтому HTML и Penpot "
           "не расходятся. <a href='all.html'>Открыть все одной страницей</a>.</p>"]
    for key in S.ORDER:
        if key not in cards:
            continue
        idx.append(f"<h2>{titles.get(key, key)} — {len(cards[key])}</h2><div class='grid'>")
        for fn, f, note in cards[key]:
            idx.append(f"<div class='card'><a href='{fn}'>{esc(f.name)}</a>"
                       f"<div class='meta'>{f.w}×{f.h}</div>"
                       f"<div class='note'>{esc(note)}</div></div>")
        idx.append("</div>")
    idx.append("</div>")
    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(PAGE.format(title="Макеты кейса 1", prefix="", body="\n".join(idx), ver=ver))

    print(f"кадров: {len(frames)} → {os.path.relpath(OUT, ROOT)}/")
    print(f"  index.html  — оглавление")
    print(f"  all.html    — всё одной страницей")


if __name__ == "__main__":
    main()
