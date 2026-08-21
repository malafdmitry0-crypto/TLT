#!/usr/bin/env python3
"""Проверка кадров: наложения подписей и выход за край.

Текст в кадрах позиционируется абсолютно, поэтому две подписи в одной строке
могут наехать друг на друга. Скрипт ищет такие пары по фактическим ширинам
(те же метрики, что и у раскладки) и печатает их.

    python3 scripts/check_overlaps.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import penpot_screens as S            # noqa: E402
from penpot_kit import ROLE_STYLE, TPL_STYLE  # noqa: E402
import text_metrics                    # noqa: E402


def text_ops(frame):
    out = []
    for op in frame.ops:
        if not op.get("text"):
            continue
        sp = TPL_STYLE.get(op["tpl"], {})
        if sp.get("kind") != "text":
            continue
        role = ROLE_STYLE.get(op.get("role") or "", {})
        w = text_metrics.width(op["text"], role.get("size", sp["size"]),
                               role.get("weight", sp["weight"]))
        h = op["h"] or 15
        if op.get("wrap"):                       # перенос: высота по числу строк
            n = max(1, -(-w // max(int(op["w"]), 1)))
            h, w = n * 16, op["w"]
        out.append((op["x"], op["y"], w, h, op["text"], op.get("only"),
                    op.get("layer", 0)))
    return out


def main():
    overlaps, overflow = [], []
    for f in S.build_all():
        ops = text_ops(f)
        for i in range(len(ops)):
            x1, y1, w1, h1, t1, o1, l1 = ops[i]
            if x1 + w1 > f.w + 1 and f.w != 1000:
                overflow.append((f.name, t1, round(x1 + w1 - f.w)))
            for j in range(i + 1, len(ops)):
                x2, y2, w2, h2, t2, o2, l2 = ops[j]
                if l1 != l2:                    # модалка поверх экрана — не наложение
                    continue
                if o1 and o2 and o1 != o2:      # разные носители — не пересекаются
                    continue
                if x1 < x2 + w2 and x2 < x1 + w1 and y1 < y2 + h2 and y2 < y1 + h1:
                    overlaps.append((f.name, t1, t2,
                                     round(min(x1 + w1, x2 + w2) - max(x1, x2))))
    for name, a, b, px in sorted(overlaps, key=lambda r: -r[3]):
        print(f"  наложение +{px}px  «{a[:38]}» × «{b[:38]}»   [{name}]")
    for name, t, px in sorted(overflow, key=lambda r: -r[2]):
        print(f"  за краем  +{px}px  «{t[:46]}»   [{name}]")
    print(f"\nналожений: {len(overlaps)}, выходов за край: {len(overflow)}")
    return 1 if overlaps or overflow else 0


if __name__ == "__main__":
    sys.exit(main())
