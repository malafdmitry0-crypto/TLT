#!/usr/bin/env python3
"""Автосинхронизация цифр в документации (test counts, endpoint'ы, env-vars).

Запуск:
    scripts/sync-docs.py          # обновить README.md и CLAUDE.MD на месте
    scripts/sync-docs.py --check  # только проверить, без записи (exit 1 если дрейф)

Синхронизирует содержимое блоков, помеченных комментариями:
    <!-- AUTO:test-counts -->
    ...строки подставляются автоматически...
    <!-- /AUTO -->

Поддерживаемые ключи блоков: `test-counts`, `env-vars`.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# Счётчики
# ---------------------------------------------------------------------------

def count_backend_tests() -> tuple[int, int]:
    """Возвращает (unit, integration) — количество тестов по pytest-сигнатурам."""
    unit = subprocess.check_output(
        ["grep", "-rhE", r"^(\s)*(async\s+)?def\s+test_",
         str(ROOT / "backend/app/tests/unit"), "--include=*.py"],
        text=True,
    ).count("\n")
    integration = subprocess.check_output(
        ["grep", "-rhE", r"^(\s)*(async\s+)?def\s+test_",
         str(ROOT / "backend/app/tests/integration"), "--include=*.py"],
        text=True,
    ).count("\n")
    return unit, integration


def count_frontend_tests() -> int:
    """Считает it()/test() в frontend/src/__tests__."""
    out = subprocess.check_output(
        ["grep", "-rhE", r"(^|\s)(it|test)\(",
         str(ROOT / "frontend/src/__tests__"),
         "--include=*.ts", "--include=*.tsx"],
        text=True,
    )
    return sum(1 for line in out.splitlines() if not line.lstrip().startswith("//"))


def count_e2e_tests() -> int:
    out = subprocess.check_output(
        ["grep", "-rhE", r"^\s*test(\.(only|skip|fixme|fail))?\(",
         str(ROOT / "e2e/tests"), "--include=*.ts"],
        text=True,
    )
    return len(out.splitlines())


# ---------------------------------------------------------------------------
# Генераторы блоков
# ---------------------------------------------------------------------------

def gen_test_counts() -> str:
    bu, bi = count_backend_tests()
    fe = count_frontend_tests()
    e2e = count_e2e_tests()
    return (
        f"**{bu + bi} backend** ({bu} unit + {bi} integration) ✅ · "
        f"**{fe} frontend vitest** ✅ · **{e2e} e2e Playwright** ✅"
    )


def gen_env_vars() -> str:
    """Читает ключи из .env.example и выводит компактный список."""
    env_file = ROOT / ".env.example"
    lines = []
    for raw in env_file.read_text().splitlines():
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            continue
        key = raw.split("=", 1)[0]
        lines.append(f"`{key}`")
    return "Переменные: " + ", ".join(lines)


GENERATORS = {
    "test-counts": gen_test_counts,
    "env-vars": gen_env_vars,
}


# ---------------------------------------------------------------------------
# Обработка файлов
# ---------------------------------------------------------------------------

BLOCK_RE = re.compile(
    r"(<!-- AUTO:([\w-]+) -->)(.*?)(<!-- /AUTO -->)",
    re.DOTALL,
)


def sync_file(path: Path, check_only: bool = False) -> bool:
    """True если файл изменился (или нуждается в изменении в режиме check)."""
    text = path.read_text()
    changed = False

    def repl(m: re.Match) -> str:
        nonlocal changed
        opener, key, _old_body, closer = m.group(1), m.group(2), m.group(3), m.group(4)
        gen = GENERATORS.get(key)
        if gen is None:
            return m.group(0)  # unknown key — оставляем как есть
        new_body = f"\n{gen()}\n"
        old_full = m.group(0)
        new_full = f"{opener}{new_body}{closer}"
        if old_full != new_full:
            changed = True
        return new_full

    new_text = BLOCK_RE.sub(repl, text)
    if changed and not check_only:
        path.write_text(new_text)
    return changed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="Только проверка (без записи)")
    args = ap.parse_args()

    targets = [ROOT / "README.md", ROOT / "CLAUDE.MD"]
    drift = [p for p in targets if sync_file(p, check_only=args.check)]

    if args.check and drift:
        print("Дрейф в:", ", ".join(str(p.relative_to(ROOT)) for p in drift),
              file=sys.stderr)
        print("Запустите: scripts/sync-docs.py", file=sys.stderr)
        return 1

    if drift:
        for p in drift:
            print(f"updated: {p.relative_to(ROOT)}")
    else:
        print("docs up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
