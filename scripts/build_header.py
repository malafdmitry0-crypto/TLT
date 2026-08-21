"""Собирает гостевую шапку (D-CHROME) из шаблонных шейпов оригинальной «Шапки приложения».

Геометрию Penpot принимает только в add-obj (mod-obj с plain-map selrect отклоняется),
поэтому кадр строится заново, а не правится.
"""
import copy
import sys
import uuid

from penpot import Penpot, ROOT
from pclone import set_text

SRC = "Шапка приложения"


def rect_of(x, y, w, h):
    return {"x": x, "y": y, "width": w, "height": h,
            "x1": x, "y1": y, "x2": x + w, "y2": y + h}


def place(obj, x, y, w, h=None):
    h = h if h is not None else (obj.get("selrect") or {}).get("height") or obj.get("height") or 0
    obj.update({"x": x, "y": y, "width": w, "height": h,
                "selrect": rect_of(x, y, w, h),
                "points": [{"x": x, "y": y}, {"x": x + w, "y": y},
                           {"x": x + w, "y": y + h}, {"x": x, "y": y + h}]})
    obj.pop("positionData", None)   # пересчитается редактором
    return obj


def build(p, name, y0, width, compact=False):
    objs = p.objects()
    src = p.frame(SRC)
    tpl = {}
    for cid in src["shapes"]:
        o = objs.get(cid)
        if not o:
            continue
        tpl.setdefault(o.get("name"), o)

    H = (src.get("selrect") or {}).get("height") or 28
    frame_id = str(uuid.uuid4())
    frame = copy.deepcopy(src)
    for k in ("componentId", "componentFile", "componentRoot", "shapeRef",
              "mainInstance", "touched"):
        frame.pop(k, None)
    frame.update({"id": frame_id, "name": name, "parentId": ROOT,
                  "frameId": ROOT, "shapes": []})
    place(frame, 0, y0, width, H)
    changes = [{"type": "add-obj", "id": frame_id, "pageId": p.page_id,
                "frameId": ROOT, "parentId": ROOT, "obj": frame}]

    def add(tpl_name, x, w, text=None, h=None, y=None):
        base = tpl.get(tpl_name)
        if base is None:
            raise SystemExit(f"нет шаблона {tpl_name!r}")
        o = copy.deepcopy(base)
        for k in ("componentId", "componentFile", "componentRoot", "shapeRef",
                  "mainInstance", "touched", "shapes"):
            o.pop(k, None)
        nid = str(uuid.uuid4())
        oy = y0 + ((base["y"] - src["y"]) if y is None else y)
        o.update({"id": nid, "parentId": frame_id, "frameId": frame_id})
        place(o, x, oy, w, h)
        if text is not None and o["type"] == "text":
            o["content"] = set_text(o, text)
        changes.append({"type": "add-obj", "id": nid, "pageId": p.page_id,
                        "frameId": frame_id, "parentId": frame_id, "obj": o})
        return nid

    # ---------- левая часть ----------
    add("logo", 10, 15, "🔥")
    add("brand", 28, 64, "HeatCalc")

    nav = ([("Исходные данные", 108), ("Электротех. расчёт", 122), ("Спецификация", 92)]
           if compact else
           [("Исходные данные", 124), ("⚡  Электротех. расчёт", 150), ("☰  Спецификация", 112)])
    x = 104
    for i, (label, w) in enumerate(nav):
        if i == 0:
            add("mi-active", x, w + 16)
        add("mi", x + 8, w, label)
        x += w + (16 if i == 0 else 0) + 20

    # ---------- правая часть ----------
    if compact:
        plan = [("👤 Гость", 66), ("⬆ Открыть файл", 104),
                ("⬇ Сохранить файл", 112), ("?", 26)]
    else:
        plan = [("👤 Режим: гость", 112), ("⬆ Открыть проект из файла", 158),
                ("⬇ Сохранить проект в файл", 162), ("? Инструкция", 82), ("⏻ Выход", 60)]

    total = sum(w for _, w in plan) + 8 * (len(plan) - 1)
    x = width - 10 - total
    if x < nav_end(nav, compact):
        print(f"  !! правая часть налезает на навигацию: свободно "
              f"{width - 10 - nav_end(nav, compact)}, нужно {total}")
    for i, (label, w) in enumerate(plan):
        if i == 0:
            add("project", x, w, label)
        else:
            add("hbtn", x, w)
            add("Text", x + 7, w - 14, label)
        x += w + 8
    return changes, frame_id


def nav_end(nav, compact):
    x = 104
    for i, (_, w) in enumerate(nav):
        x += w + (16 if i == 0 else 0) + 20
    return x


if __name__ == "__main__":
    p = Penpot().reload()
    # снести прошлые попытки
    drop = [o["id"] for o in p.objects().values()
            if str(o.get("name", "")).startswith("Шапка — гость")]
    if drop:
        p.apply([p.delete(i) for i in drop])
        p.reload()
        print("удалено прошлых кадров:", len(drop))

    ch1, f1 = build(p, "Шапка — гость 1440 (D-CHROME/A)", 7200, 1440)
    print("A: операций", len(ch1), "→ revn", p.apply(ch1))
    p.reload()
    ch2, f2 = build(p, "Шапка — гость 1000 (D-CHROME/C)", 7280, 1000, compact=True)
    print("C: операций", len(ch2), "→ revn", p.apply(ch2))
