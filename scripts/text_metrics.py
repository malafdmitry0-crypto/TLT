"""Ширины текста для раскладки кадров.

Кэш `scripts/text-widths.json` строится живым браузером тем же шрифтовым стеком,
что и `heatcalc-shared.css`, — поэтому подписи не переносятся ни в Penpot, ни в
HTML. Без кэша берётся грубая оценка: кадры соберутся, но ширины будут
приблизительными.

    python3 scripts/text_metrics.py     # пересобрать кэш
"""
import json
import os
import subprocess

DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_PATH = os.path.join(DIR, "text-widths.json")

try:
    with open(CACHE_PATH, encoding="utf-8") as _fh:
        _CACHE = json.load(_fh)
except (OSError, ValueError):
    _CACHE = {}

_MISSES = set()


def key(text, size, weight, width=None):
    return f"{size}|{weight}|{width or 0}|{text}"


def width(text, size=13.5, weight=400):
    """Ширина строки в пикселях."""
    if not text:
        return 0
    k = key(text, size, weight)
    rec = _CACHE.get(k)
    if isinstance(rec, dict):
        return rec["w"]
    if isinstance(rec, int):
        return rec
    _MISSES.add(k)
    # запасная оценка: кириллица в этом стеке ≈ 0.55 кегля на символ
    return int(len(str(text)) * size * 0.55) + 2


def lines(text, box_w, size=13.5, weight=400):
    """Сколько строк займёт текст в блоке заданной ширины (перенос по словам)."""
    if not text or not box_w:
        return 1
    rec = _CACHE.get(key(text, size, weight, int(box_w)))
    if isinstance(rec, dict):
        return rec["lines"]
    _MISSES.add(key(text, size, weight, int(box_w)))
    return max(1, -(-width(text, size, weight) // int(box_w)))


def misses():
    return sorted(_MISSES)


def rebuild(pairs):
    """pairs: [(text, size, weight, width|None)] → пересобрать кэш через браузер."""
    norm = [(p + (None,))[:4] for p in pairs]
    uniq = {key(t, s, w, bw): (t, s, w, bw) for t, s, w, bw in norm}
    items = [{"text": t, "size": s, "weight": w, "width": bw}
             for t, s, w, bw in uniq.values()]
    out = subprocess.run(["node", os.path.join(DIR, "measure_text.mjs")],
                         input=json.dumps(items), capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(out.stderr[:400])
    cache = dict(zip(uniq.keys(), json.loads(out.stdout)))
    with open(CACHE_PATH, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=0, sort_keys=True)
    return len(cache)


if __name__ == "__main__":
    import sys
    sys.path.insert(0, DIR)
    import penpot_screens as S
    from penpot_kit import ROLE_STYLE, TPL_STYLE

    pairs = []
    for f in S.build_all():
        for op in f.ops:
            if not op.get("text"):
                continue
            sp = TPL_STYLE.get(op["tpl"], {})
            if sp.get("kind") != "text":
                continue
            role = ROLE_STYLE.get(op.get("role") or "", {})
            size = role.get("size", sp["size"])
            weight = role.get("weight", sp["weight"])
            pairs.append((op["text"], size, weight))
            if op.get("wrap"):        # переносимый текст — ещё и число строк
                pairs.append((op["text"], size, weight, int(op["w"])))
    print(f"строк измерено: {rebuild(pairs)} → {os.path.relpath(CACHE_PATH, DIR)}")
