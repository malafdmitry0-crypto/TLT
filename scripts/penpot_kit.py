"""Конструктор кадров Penpot.

Кадр описывается декларативно (см. `penpot_screens.py`), а рисуется штатным
plugin API через MCP `execute_code`: каждый новый шейп — `clone()` эталона из
самого файла, поэтому стили не переизобретаются (правило R1), а геометрию
считает сам Penpot.
"""
import json
import os

import text_metrics

CONFIG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                     "..", "tools", "penpot", "penpot.local.json"),
                        encoding="utf-8"))

# --------------------------------------------------------------------------
# Эталон оформления — форма теплопотерь, файл `mockups/heatcalc-shared.css`.
# Одна таблица на оба носителя: Penpot-рантайм применяет её к клонам,
# HTML-рендер импортирует отсюда же. Разъехаться они не могут.
# --------------------------------------------------------------------------
TPL_STYLE = {
    # ТЕКСТ. Основной тон интерфейса — тёмно-синий #26364a; синий #2e86c1
    # оставлен только для действий-ссылок (роль "link"), как в продукте.
    "Text":       dict(kind="text", size=12,   weight=400, color="#26364a"),
    "mi":         dict(kind="text", size=13,   weight=600, color="#26364a"),  # пункт навигации
    "brand":      dict(kind="text", size=14,   weight=800, color="#162234"),
    "project":    dict(kind="text", size=11,   weight=400, color="#26364a"),
    "logo":       dict(kind="text", size=14,   weight=400, color="#1f1f1f"),
    # КНОПКИ И ЧИПЫ
    "hbtn":       dict(kind="box", fill="#ffffff", stroke="#d9d9d9", radius=6),
    "recalc-all": dict(kind="box", fill="#ffffff", stroke="#d9d9d9", radius=6),
    "next-btn":   dict(kind="box", fill="#1a5276", stroke="#1a5276", radius=6),
    "type-btn":   dict(kind="box", fill="#ffffff", stroke="#d9d9d9", radius=6),
    "mi-active":  dict(kind="box", fill="#eef4ff", stroke="#c9d9ff", radius=6),
    "mode-tag":   dict(kind="box", fill="#eaf6ea", stroke="#b7dbb0", radius=6),
    # ТАБЛИЦА — светло-голубые границы, как на экране теплопотерь
    "thead":      dict(kind="box", fill="#f4f7fa", stroke="#d1dce8", radius=0),
    "trow":       dict(kind="box", fill="#ffffff", stroke="#e0e7ef", radius=0),
    "trow-empty": dict(kind="box", fill="#ffffff", stroke="#edf1f5", radius=0),
    "div":        dict(kind="box", fill="#dce5ee", radius=0),
    "row-cb":     dict(kind="box", fill="#ffffff", stroke="#d9d9d9", radius=2),
}

# Смысловые начертания продукта.
ROLE_STYLE = {
    "section":     dict(size=13.5, weight=600, color="#26364a"),
    "muted":       dict(size=11,   weight=400, color="#7b8794"),
    "th":          dict(size=12,   weight=600, color="#26364a"),  # заголовок колонки
    "modal-title": dict(size=13,   weight=600, color="#26364a"),
    "link":        dict(size=12,   weight=400, color="#2e86c1"),  # действие-ссылка
    "disabled":    dict(size=12,   weight=400, color="#b6bcc4"),  # «Пол», «скоро»
    "field-label": dict(size=10.5, weight=600, color="#26364a"),  # подпись поля формы
    "panel-title": dict(size=10,   weight=700, color="#4b5563"),  # шапка панели формы
}
ON_PRIMARY_COLOR = "#ffffff"


class FrameBuilder:
    """Накапливает операции кадра. Координаты внутри кадра — локальные."""

    def __init__(self, name, x, y, w, h):
        self.name = name
        self.x, self.y, self.w, self.h = x, y, w, h
        self.ops = []
        self.layer = 0      # 0 — экран, 1 — модалка/панель поверх него
        self.in_table = False
        self.last_table = None

    def put(self, tpl, x, y, w, h=None, text=None, fill=None, opacity=None,
            role=None, on_primary=None, only=None):
        """role / on_primary — подсказки начертания.
        only="penpot" | "html" — элемент нужен лишь одному носителю: базисы
        разные (в Penpot панель-клон несёт своё содержимое, в HTML панель
        отрисовывается заново)."""
        self.ops.append({"tpl": tpl, "x": x, "y": y, "w": w, "h": h,
                         "text": text, "fill": fill, "opacity": opacity,
                         "role": role, "on_primary": on_primary, "only": only,
                         "layer": self.layer, "in_table": self.in_table})
        return self

    def text_width(self, text, tpl="Text", role=None):
        sp = TPL_STYLE.get(tpl, {})
        if sp.get("kind") != "text":
            return 0
        r = ROLE_STYLE.get(role or "", {})
        return text_metrics.width(text, r.get("size", sp["size"]),
                                  r.get("weight", sp["weight"]))

    def label(self, x, y, w, text, tpl="Text", h=15, role=None, on_primary=None,
              fit=True, only=None):
        """fit=True — ширина не меньше фактической (подпись не переносится).
        fit=False — ширина фиксирована, длинный текст переносится: так ведут
        себя тела алертов и модалок."""
        # Penpot отклоняет пустой characters — пустая строка это просто отступ
        if text is None or str(text).strip() == "":
            return self
        if fit:
            w = max(w, self.text_width(text, tpl, role) + 2)
        op = self.put(tpl, x, y, w, h, text, role=role, on_primary=on_primary,
                      only=only)
        if not fit:
            self.ops[-1]["wrap"] = True
        return op

    def label_row(self, x, y, text, tpl="Text", role=None):
        """Подпись в строке; возвращает правый край — для цепочки без наложений."""
        w = self.text_width(text, tpl, role) + 2
        self.label(x, y, w, text, tpl=tpl, role=role)
        return x + w

    def section(self, x, y, w, text):
        """Заголовок раздела — начертание .section-head формы теплопотерь."""
        return self.label(x, y, w, text, role="section", h=18)

    def button(self, x, y, w, text, tpl="hbtn", h=22, pad=7):
        w = max(w, self.text_width(text) + 2 * pad + 2)
        self.put(tpl, x, y, w, h)
        self.label(x + pad, y + 4, w - 2 * pad, text,
                   on_primary=(tpl == "next-btn"))
        return x + w + 8

    def chip(self, x, y, w, text, tpl="type-btn", h=22, pad=10):
        w = max(w, self.text_width(text) + 2 * pad + 2)
        self.put(tpl, x, y, w, h)
        self.label(x + pad, y + 4, w - 2 * pad, text)
        return x + w + 14

    def fit_columns(self, cols, rows, pad=14):
        """Ширина колонки — не меньше её содержимого: заголовка и всех значений.
        Иначе соседние подписи наезжают друг на друга."""
        out = []
        for i, (title, cw) in enumerate(cols):
            need = self.text_width(title, role="th") if title else 0
            for r in rows:
                if i < len(r) and r[i] not in (None, ""):
                    need = max(need, self.text_width(str(r[i])))
            out.append((title, max(cw, need + pad)))
        return out

    def table(self, x, y, w, cols, rows, row_h=26, head_h=28, empty_rows=0,
              autofit=True):
        """cols: [(заголовок, ширина)]; rows: [[значения…]]."""
        if autofit:
            cols = self.fit_columns(cols, rows)
            w = max(w, sum(cw for _, cw in cols))
        self.in_table = True
        self.last_table = {"x": x, "y": y, "w": w, "cols": cols,
                           "row_h": row_h, "head_h": head_h}
        self.put("thead", x, y, w, head_h)
        cx = x
        for title, cw in cols:
            if title:
                self.label(cx + 8, y + 7, max(cw - 16, 20), title, role="th")
            cx += cw
            if cx < x + w:
                self.put("div", cx, y, 1, head_h)
        ry = y + head_h
        for row in rows:
            self.put("trow", x, ry, w, row_h)
            cx = x
            for (_, cw), val in zip(cols, row):
                if val not in (None, ""):
                    self.label(cx + 8, ry + 6, max(cw - 16, 20), str(val))
                cx += cw
            ry += row_h
        for _ in range(empty_rows):
            self.put("trow-empty", x, ry, w, row_h)
            ry += row_h
        self.in_table = False
        return ry

    # --- диагностики: три визуальных языка по diagnostics[].kind ---
    TONES = {"info": "#eef4fc", "warn": "#fff8e6",
             "danger": "#fdf0f0", "success": "#f4fbf5"}

    def lines_needed(self, text, avail_w, tpl="Text", role=None):
        """Сколько строк займёт текст в заданной ширине (перенос по словам)."""
        if avail_w <= 0:
            return 1
        sp = TPL_STYLE.get(tpl, {})
        r = ROLE_STYLE.get(role or "", {})
        return text_metrics.lines(text, int(avail_w),
                                  r.get("size", sp.get("size", 13.5)),
                                  r.get("weight", sp.get("weight", 400)))

    def alert(self, x, y, w, text, kind="info", actions=(), h=26):
        """kind: info | warn | danger | success. actions: [(подпись, ширина)].
        Высота растёт под текст: иначе длинный баннер уезжает под таблицу."""
        used = sum(aw for _, aw in actions) + 8 * len(actions)
        avail = w - 20 - used
        h = max(h, self.lines_needed(text, avail) * 16 + 10)
        self.put("mode-tag", x, y, w, h, fill=self.TONES[kind])
        self.label(x + 10, y + 6, avail, text, fit=False)
        ax = x + w - 8 - used
        for label, aw in actions:
            self.button(ax, y + 2, aw, label)
            ax += aw + 8
        return y + h + 8

    def overlay(self, w, h):
        self.put("trow", 0, 0, w, h, fill="#1f2329", opacity=0.45)
        return self

    def modal(self, cx, y, w, h, title, lines=(), buttons=(), frame_w=None,
              frame_h=None):
        """Модальное окно поверх кадра: затемнение + карточка + кнопки."""
        self.layer = 1
        if frame_w and frame_h:
            self.overlay(frame_w, frame_h)
        x = cx - w // 2
        self.put("trow", x, y, w, h, fill="#ffffff")
        self.put("thead", x, y, w, 34)
        self.label(x + 14, y + 10, w - 28, title, role="modal-title")
        ly = y + 48
        for line in lines:
            self.label(x + 14, ly, w - 28, line, fit=False)
            ly += 20 * self.lines_needed(line, w - 28)
        bx = x + w - 14
        for label, bw, tpl in reversed(buttons):
            bx -= bw
            self.put(tpl, bx, y + h - 34, bw, 24)
            self.label(bx + 8, y + h - 30, bw - 16, label,
                       on_primary=(tpl == "next-btn"))
            bx -= 8
        self.layer = 0
        return y + h

    def note(self, x, y, w, text):
        """Аннотация на кадре: state id / trigger / CTA map / viewport."""
        self.put("trow", x, y, w, 20, fill="#f7f8fa")
        self.label(x + 8, y + 4, w - 16, text, role="muted", fit=False)
        return y + 24

    CTL_H = 36        # высота поля ввода — как в продукте

    def form_panel(self, x, y, w, title, blocks, row_h=None, pad=12,
                   table_spec=None):
        """Панель формы из блоков однородных полей.

        blocks: [(fields, ncols, label_w)], где fields = [(подпись, значение,
        ед., обязательное)]. Внутри блока все колонки одной ширины, поэтому
        в одном ряду элементы одинакового размера — это правило раскладки.
        Блок без единиц измерения рисуется без ячейки единицы: тогда контролы
        ряда не выглядят разной ширины.
        """
        # высота ряда — по самой длинной подписи блока: названия берутся из
        # приложения целиком и переносятся на 2–3 строки
        block_rh = []
        for blk in blocks:
            fields, label_w = blk[0], blk[2]
            lines = max(self.lines_needed(it[0], label_w, role="field-label")
                        for it in fields)
            # ряд не ниже, чем нужно полю и подписи: поле выше, зазор меньше
            block_rh.append(max(row_h or (self.CTL_H + 4), lines * 13 + 8))
        rows_total = sum(-(-len(b[0]) // b[1]) * rh
                         for b, rh in zip(blocks, block_rh))
        # таблица слоёв изоляции живёт внутри панели, под полями
        tbl_h = (28 + 26 * len(table_spec[2]) + 10) if table_spec else 0
        h = 26 + pad + rows_total + (len(blocks) - 1) * 2 + tbl_h + pad - 8
        self.put("thead", x, y, w, 26)
        self.label(x + pad, y + 8, w - 2 * pad, title, role="panel-title")
        self.put("trow", x, y + 26, w, h - 26, fill="#ffffff")

        by = y + 26 + pad
        for blk, row_h in zip(blocks, block_rh):
            fields, ncols, label_w = blk[0], blk[1], blk[2]
            opts = blk[3] if len(blk) > 3 else {}
            # единицу можно показать серым суффиксом внутри поля (как в панели
            # выбора кабеля) вместо отдельной ячейки с разделителем
            suffix = opts.get("unit_suffix", False)
            max_ctl = opts.get("ctl_w")      # короткому значению широкое поле не нужно
            # тип контрола берётся из конфига фронта: select → шеврон,
            # reference (справочник) → лупа, number/text → простое поле
            kinds = opts.get("kinds") or {}
            has_unit = any(it[2] for it in fields) and not suffix
            unit_w = (max([self.text_width(it[2]) for it in fields if it[2]]) + 20
                      if has_unit else 0)
            # суффикс тоже занимает место: значение не должно на него наезжать
            suffix_w = (max([self.text_width(it[2]) for it in fields if it[2]]) + 14
                        if suffix and any(it[2] for it in fields) else 0)
            col_w = (w - 2 * pad - (ncols - 1) * pad) // ncols
            for i, item in enumerate(fields):
                lab, val, unit, req = item[:4]
                placeholder = item[4] if len(item) > 4 else False
                col, row = i % ncols, i // ncols
                fx = x + pad + col * (col_w + pad)
                fy = by + row * row_h
                self.label(fx, fy + 6, label_w, lab, fit=False, role="field-label")
                cx = fx + label_w + 6
                cw = col_w - label_w - 6
                if max_ctl:
                    cw = min(cw, max_ctl)
                self.put("hbtn", cx, fy, cw, self.CTL_H,
                         fill="#fffdf6" if req else "#ffffff")
                if req:                   # обязательное поле — оранжевая полоса
                    self.put("div", cx, fy, 3, self.CTL_H, fill="#d48806")
                kind = kinds.get(lab, "text")
                mark = {"select": "▾", "reference": "⌕"}.get(kind, "")
                mark_w = 16 if mark else 0
                vy = fy + (self.CTL_H - 15) // 2
                self.label(cx + 10, vy, cw - unit_w - suffix_w - mark_w - 16,
                           str(val), fit=False,
                           role="disabled" if placeholder else None)
                if mark:
                    self.label(cx + cw - unit_w - suffix_w - mark_w - 2, vy,
                               mark_w, mark, role="disabled", fit=False)
                if has_unit:
                    self.put("div", cx + cw - unit_w, fy, 1, self.CTL_H)
                    if unit:
                        self.label(cx + cw - unit_w + 9, vy, unit_w - 12,
                                   unit, fit=False)
                elif suffix and unit:
                    uw = self.text_width(unit) + 2
                    self.label(cx + cw - uw - 10, vy, uw, unit,
                               role="disabled", fit=False)
            by += (-(-len(fields) // ncols)) * row_h + 2
        if table_spec:
            _, cols, rows = table_spec
            self.table(x + pad, by + 2, w - 2 * pad, cols, rows, autofit=False)
        return y + h

    def finish(self, annotate=None, pad=12, note_h=20):
        """Подгоняет высоту кадра под содержимое и ставит аннотацию внизу.
        Без этого у кадров остаются разные пустые поля — визуальный мусор."""
        bottom = max((o["y"] + (o["h"] or 0) for o in self.ops), default=0)
        self.h = int(bottom + pad + (note_h + pad if annotate else 0))
        if annotate:
            self.note(16, self.h - note_h - pad // 2, self.w - 32, annotate)
        return self

    def as_dict(self):
        return {"name": self.name, "x": self.x, "y": self.y,
                "w": self.w, "h": self.h, "ops": self.ops}


RUNTIME_JS = r"""
const SPEC = __SPEC__;
const STYLE = __STYLE__;
const ROLES = __ROLES__;
const page = penpot.currentPage;
const cache = {};

// Приводим клон к эталону формы теплопотерь (heatcalc-shared.css).
function applyStyle(c, op) {
  const sp = STYLE[op.tpl];
  if (!sp) return;
  if (sp.kind === 'text' && c.type === 'text') {
    const role = (op.role && ROLES[op.role]) || {};
    c.fontSize = String(role.size !== undefined ? role.size : sp.size);
    c.fontWeight = String(role.weight !== undefined ? role.weight : sp.weight);
    const color = op.on_primary ? '#ffffff'
                : (op.fill || role.color || sp.color);
    c.fills = [{ fillColor: color, fillOpacity: 1 }];
    return;
  }
  if (sp.kind === 'box') {
    c.fills = [{ fillColor: op.fill || sp.fill, fillOpacity: 1 }];
    if (sp.stroke) {
      try {
        c.strokes = [{ strokeColor: sp.stroke, strokeOpacity: 1,
                       strokeWidth: 1, strokeStyle: 'solid',
                       strokeAlignment: 'inner' }];
      } catch (e) { /* шейп без обводки */ }
    } else {
      try { c.strokes = []; } catch (e) {}
    }
    if (sp.radius !== undefined) {
      try { c.borderRadius = sp.radius; } catch (e) {}
    }
  }
}

function tpl(name) {
  if (!(name in cache)) {
    const found = page.findShapes({ name: name }) || [];
    cache[name] = found.length ? found[0] : null;
  }
  return cache[name];
}

// идемпотентность: сносим прежние версии кадров с теми же именами
const wanted = {};
SPEC.frames.forEach(f => { wanted[f.name] = true; });
(SPEC.drop || []).forEach(n => { wanted[n] = true; });
Object.keys(wanted).forEach(name => {
  (page.findShapes({ name: name }) || []).forEach(s => { try { s.remove(); } catch (e) {} });
});

const missing = {};
let made = 0;

SPEC.frames.forEach(f => {
  const board = penpot.createBoard();
  board.name = f.name;
  board.x = f.x; board.y = f.y;
  board.resize(f.w, f.h);
  f.ops.forEach(op => {
    if (op.only === 'html') return;      // элемент только для HTML-носителя
    const t = tpl(op.tpl);
    if (!t) { missing[op.tpl] = true; return; }
    const c = t.clone();
    board.appendChild(c);
    c.x = f.x + op.x;
    c.y = f.y + op.y;
    if (op.w) c.resize(op.w, op.h || c.height);
    if (op.text !== null && op.text !== undefined && c.type === 'text') {
      c.characters = String(op.text);
    }
    applyStyle(c, op);
    if (op.opacity !== null && op.opacity !== undefined) c.opacity = op.opacity;
    made++;
  });
});

return { frames: SPEC.frames.length, shapes: made, missingTemplates: Object.keys(missing) };
"""


def render_js(frames, drop=()):
    spec = {"frames": [f.as_dict() for f in frames], "drop": list(drop)}
    return (RUNTIME_JS
            .replace("__SPEC__", json.dumps(spec, ensure_ascii=False))
            .replace("__STYLE__", json.dumps(TPL_STYLE, ensure_ascii=False))
            .replace("__ROLES__", json.dumps(ROLE_STYLE, ensure_ascii=False)))
