# Case 1 — пересчёт закрытости ТЗ (desktop-only)

**Дата:** 2026-08-04
**Код ориентир:** `01bcdf4` (после `ca8805e` + SPEC-P0-a/b + GUEST-COPY)
**Базовый audit:** [`snapshot.md`](./snapshot.md), [`browser-e2e/report.md`](./browser-e2e/report.md)
**Платформа (норматив, раз и навсегда):**
[`../../frontend/viewport-policy.md`](../../frontend/viewport-policy.md) §0 — **мобильной версии нет**.

## Правило пересчёта

| Включать в % | Не включать (N/A) |
|---|---|
| Desktop browser proof: `1000×768`, `1280×800`, `1440×900` / `1440×1000` | `390×844`, tablet, любой CSS viewport &lt;1000 px |
| FE/BE functional gaps, lint/build, isolation tests | «Mobile home overflow», «mobile heat clipped» |
| AC-FE, NFR load, desktop layout | Touch / burger / mobile CSS debt |

Mobile FAIL в исходном browser-агенте **не снижает** feature % и **не** является release blocker.

---

## Что снято с штрафа (было в RED browser)

| Finding (snapshot / browser report) | Было | Стало |
|---|---|---|
| Home 390 overflow +85 px | FAIL / P0 UX | **N/A** |
| Guest heat 390 clipped controls | FAIL / P0 UX | **N/A** |
| Playwright layout mobile 390 | 1 failed | **N/A** (desktop leg PASS) |
| Guest help 390 copy | FAIL copy | **N/A geometry**; copy later fixed on desktop (`01bcdf4`) |

---

## Домены (пересчёт)

Веса — приёмка кейса 1 «гость → тепло → ЭР → спецификация», только desktop.

| Домен | Вес | `ca8805e` audit (с mobile-штрафом) | **Desktop-only + post-P0** |
|---|---:|---:|---:|
| §6 Electrical MVP | 28% | 86–90% | **86–90%** (без изменений) |
| §7 Spec engineering | 15% | 88–92% | **88–92%** (write-isolation still open) |
| §7 Spec UX / PDF | 18% | 60–68% | **78–85%** (SPEC-P0-a/b) |
| §4 Guest / projects / IO | 12% | 78–84% | **86–92%** (help fixed; no mobile) |
| §5 Heat / objects | 15% | 80–85% | **85–90%** (desktop heat PASS; mobile N/A) |
| §3 NFR + DoD gates | 12% | 45–55% | **52–62%** (mobile out; lint/build/isolation remain) |

### Взвешенный mid-point

```
feature ≈ 0.28×88 + 0.15×90 + 0.18×81 + 0.12×89 + 0.15×87 + 0.12×57
        ≈ 24.6 + 13.5 + 14.6 + 10.7 + 13.1 + 6.8
        ≈ 83.3%
```

| Вопрос | Оценка | Решение |
|---|---:|---|
| **A. Feature / ТЗ-полнота (desktop)** | **82–86%** (mid **~83%**) | Ядро сильное |
| **B. Release claim «кейс 1 сдан»** | **76–80%** (mid **~78%**) | **NOT READY** |

Release ниже feature из‑за **in-scope** RED: FE lint/TS/build (на audit HEAD), BE write-isolation (3 tests), E2E pipe fixture drift, elec critical path not proven, session recovery PARTIAL, object Iдоп / Glide DnD / sync idempotency PARTIAL. **Не** из‑за mobile.

---

## Сравнение с предыдущими цифрами

| Источник | Feature | Release |
|---|---:|---:|
| Checklist 2026-08-03 | ~70–75% | — |
| Snapshot 2026-08-04 (до desktop-only errata, с mobile) | ~74–78% | 65–72% |
| Пересчёт post-P0 **с** mobile-штрафом (чат) | ~80–84% | ~70–76% |
| **Этот файл: desktop-only + post-P0** | **~82–86%** | **~76–80%** |

Дельта desktop-only к post-P0 с mobile: **feature +2…3 п.п.**, **release +4…6 п.п.**
(сняты ложные mobile blockers; DoD floor чуть выше).

---

## In-scope gaps (не mobile)

### P0 / release

1. FE lint + typecheck + production build green
2. Spec write-isolation (READY+BLOCKED / savepoint / fingerprint)
3. Desktop browser matrix populated states + AC proof (1000/1280/1440)
4. E2E harness `insulation_layers` → elec critical path PASS

*(SPEC section mapping, «Исправить», catalog debt-prod ban, guest help — закрыты post-audit на `01bcdf4`.)*

### P1

- Object-level Iдоп, Glide DnD, FE calculate version/idempotency
- Session recovery query cleanup
- Spec kind-tones / provenance polish
- Summary strict counts

### N/A (не backlog кейса 1)

- Любые mobile/tablet раскладки и fixes
- Phone Playwright scenarios как acceptance

---

## Вердикт

**Мобилка не считается.**
**Закрытость ТЗ (feature, desktop): ~83%.**
**Release-ready: ~78% — NOT READY** до green DoD/isolation/desktop critical path.

При смене platform decision (появление mobile) — **обязательно** править `viewport-policy.md` §0 и пересчитывать snapshot; до тех пор mobile FAIL в отчётах = ошибка аудитора, не продукта.
