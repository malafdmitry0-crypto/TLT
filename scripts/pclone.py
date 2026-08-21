"""Глубокое копирование фреймов Penpot + правка текста/геометрии."""
import copy
import uuid

from penpot import ROOT


def _shift(obj, dx, dy):
    for key in ("x", "y"):
        pass
    if "x" in obj and obj["x"] is not None:
        obj["x"] += dx
    if "y" in obj and obj["y"] is not None:
        obj["y"] += dy
    sel = obj.get("selrect")
    if sel:
        for k in ("x", "x1", "x2"):
            if sel.get(k) is not None:
                sel[k] += dx
        for k in ("y", "y1", "y2"):
            if sel.get(k) is not None:
                sel[k] += dy
    pts = obj.get("points")
    if pts:
        for pt in pts:
            pt["x"] += dx
            pt["y"] += dy
    return obj


def clone_frame(p, src_name, new_name, dx=0, dy=0):
    """Возвращает (changes, new_frame_id, id_map). Копия кладётся в корень страницы."""
    objs = p.objects()
    src = p.frame(src_name)
    id_map = {}

    def walk(node_id):
        id_map[node_id] = str(uuid.uuid4())
        for c in objs[node_id].get("shapes", []) or []:
            if c in objs:
                walk(c)

    walk(src["id"])

    changes = []

    def emit(node_id, parent_id, frame_id):
        o = copy.deepcopy(objs[node_id])
        new_id = id_map[node_id]
        o["id"] = new_id
        o["parentId"] = parent_id
        o["frameId"] = frame_id
        if o.get("type") in ("frame", "group", "bool"):
            o["shapes"] = []          # детей допишет add-obj
        else:
            o.pop("shapes", None)
        # компонентные ссылки не переносим — копия должна быть автономной
        for k in ("componentId", "componentFile", "componentRoot", "shapeRef",
                  "mainInstance", "touched"):
            o.pop(k, None)
        _shift(o, dx, dy)
        if node_id == src["id"]:
            o["name"] = new_name
        changes.append({"type": "add-obj", "id": new_id, "pageId": p.page_id,
                        "frameId": frame_id, "parentId": parent_id, "obj": o})
        kids = objs[node_id].get("shapes", []) or []
        child_frame = new_id if o.get("type") == "frame" else frame_id
        for c in kids:
            if c in objs:
                emit(c, new_id, child_frame)

    emit(src["id"], ROOT, ROOT)
    return changes, id_map[src["id"]], id_map


def set_text(obj, value):
    """Меняет текст во всех листьях text-объекта (сохраняя стиль первого листа)."""
    content = obj.get("content") or {}
    leaves = []

    def walk(node):
        for ch in node.get("children", []) or []:
            if "text" in ch:
                leaves.append(ch)
            else:
                walk(ch)

    walk(content)
    if not leaves:
        return None
    leaves[0]["text"] = value
    for extra in leaves[1:]:
        extra["text"] = ""
    return content
