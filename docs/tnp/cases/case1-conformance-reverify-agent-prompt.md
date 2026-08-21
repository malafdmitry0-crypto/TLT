# Задача: перепроверить соответствие продукта кейсу 1 / ТЗ и список «что не сделано»

**Версия:** 1.0
**Дата:** 2026-08-04
**Статус:** ACTIVE audit prompt (read-first; fix only if user asks)
**Автор снимка (подлежит перепроверке):** cutover-агент, HEAD ориентир `ca8805e` (+ E0–E9)

---

## Роль

Ты независимый reviewer/auditor. **Не доверяй** прошлым оценкам агента вслепую.
Твоя цель — **перепроверить факты по коду и документам**, скорректировать % и списки PASS/PARTIAL/FAIL, явно пометить NOT RUN.

## Репозиторий

- Корень: workspace path пользователя (например `/Users/dmalafey/Desktop/TLT`)
- Frontend: `frontend/` → сначала `frontend/AGENTS.md`
- Backend: `backend/`
- E2E: только `e2e/`
- Правила репо: корневой `Agents.md` / `AGENTS.md`

## Перед стартом (обязательно)

1. `git status --short` — не трогать чужой WIP (penpot scripts, untracked junk).
2. `git log --oneline -20` — зафиксировать HEAD (ожидаемый cutover: commits E0…E9, last product commit `ca8805e` или новее).
3. **Не коммитить и не пушить** без явной просьбы пользователя.
4. Документы под `/docs/` часто в **`.gitignore`** — они могут быть локально, но не в git. Всё равно **читай с диска**, если файл есть.

---

## Чем пользоваться (источники правды)

### Норматив

| Приоритет | Документ | Зачем |
|---|---|---|
| 1 | PDF кейса 1 Rev.4 «Расчёт спецификации для неавторизованных» | UX/сценарий §3–7 |
| 1 | [`guest-electrical-calculation-tz.md`](./guest-electrical-calculation-tz.md) | Норматив ЭР MVP (DEC, FE-*, BE-*) |
| 2 | [`guest-specification-calculation-algorithm.md`](./guest-specification-calculation-algorithm.md) | Spec algorithm |
| 2 | [`case1-frontend-user-stories.md`](./case1-frontend-user-stories.md) | US-ELEC / US-SPEC AC |

### Планы / аудиты (могут **устареть** — сверяй с HEAD)

| Документ | Осторожность |
|---|---|
| [`case1-electrical-be-fe-audit.md`](./case1-electrical-be-fe-audit.md) | Снимок **до** cutover FE (FE ~55–65%) — **устарел** |
| [`case1-backend-fe-readiness.md`](./case1-backend-fe-readiness.md) | Частично устарел (cable-options `[]`, Iдоп FE) |
| [`case1-section-checklists.md`](./case1-section-checklists.md) | Оценка ~70–75% от 03.08 — baseline, не SoT |
| [`case1-closure-slice-plan.md`](./case1-closure-slice-plan.md) | Slice 0–6; статусы слайсов могут лагать |
| [`electrical-mvp-cutover-agent-prompt.md`](./electrical-mvp-cutover-agent-prompt.md) | План E0–E9 + статус (docs gitignored) |
| [`electrical-slice6-polish-plan.md`](./electrical-slice6-polish-plan.md) | BE polish WP |
| [`case1-docs-verification.md`](./case1-docs-verification.md) | Errata по help/Iдоп/IO |
| [`case1-designer-brief.md`](./case1-designer-brief.md) + [`electrical-designer-residual-prompt.md`](./electrical-designer-residual-prompt.md) | Design residual |
| [`specification-designer-residual-prompt.md`](./specification-designer-residual-prompt.md) | Spec UI residual |

### Код (обязательно смотреть в HEAD, не в audit)

**Electrical FE**

- `frontend/src/pages/electrical/*` — workspace, assign, stale, Iдоп
- `frontend/src/api/electricalSettings.ts`, `useProjectElectricalSettings.ts`, `ElecCalcIdopSettings.tsx`
- `frontend/src/api/calculations.ts` (`getCableOptions`, `calcElectrical` + Idempotency-Key)
- `frontend/src/api/electricalBatchCalc.ts`
- `frontend/src/utils/calcStatus.ts`, `elecCalcStaleModel.ts`, `ElecCalcStaleBanner.tsx`
- `frontend/src/config/electrical-fields.default.json` — default_visible L*
- `frontend/src/pages/electrical/useElecCalcCableMarkOptions.tsx` + mark modal
- `frontend/src/domain/electrical/elecCalcLayoutModel.ts` — threads max
- Glide vs AntD DnD: `ElectricalUnifiedTableCard.tsx`, `electricalTableEngine`

**Electrical BE**

- `backend/app/services/calculation_service.py` — TT path, assignment version gate
- `backend/app/formulas/electrical/tt_cable_options.py`, `tt_final_gate.py`
- `backend/app/services/electrical_query_service.py` — STATUS_OPTIONS, `_electrical_status`
- `backend/app/api/v1/calculations.py` — cable-options, batch `electrical_variant_id`, Idempotency-Key
- `backend/app/api/v1/electrical_settings.py`
- `backend/app/services/project_io_service.py` — `_legacy_assignment_projection`, soft-stale import
- `backend/app/formulas/electrical/sections.py` — Iдоп fail-closed

**Specification**

- `frontend/src/components/specification/SpecTable.tsx` — `bomSectionOf` (известный баг?)
- Spec page model: settings modal close on selection/confirm
- BE generate/selection — уже engineering-closed; residual = owner catalog + FE polish

**Guest / help**

- `GuestHelpPage` — лимиты 3d/500 vs 30d/50
- `ProjectMenu` — guest vs employee

**Тесты (прогонять точечно, не full DoD без запроса)**

- FE unit: electrical stale/options/columns
- BE: `test_tt_cable_options`, `test_electrical_query_status`, `test_legacy_import_soft_stale`, `test_tt_final_gate`, acceptance/assignment
- E2E: `e2e/` only if user asks / environment up

---

## Что предыдущий агент **нашёл / заявил** (подлежит перепроверке)

### A. Сделано (cutover E0–E9, commits примерно)

| Slice | Commit (ориентир) | Заявлено |
|---|---|---|
| E0 | `5e72a50` | TT assign, threads 1..3, supply_voltage 230, batch defaults TT |
| E1 | `8c1a1fc` | Samreg-only UI, summary MVP, U 230 RO |
| E2 | `54ecb58` | Iдоп settings UI + API client |
| E3 | `e89e5ad` | Stale banner, row-stale, bulk recalc; Glide DnD deferred |
| E4 | `2348779` | §9.15 final ready gate |
| E5 | `8246c6d` | GET cable-options → TT list |
| E6 | `b2ba00e` | status `stale` ≠ `not_calculated` |
| E7 | `67b9b9d` + L* в `ca8805e` | Manual mark from BE; L* default columns |
| E8 | `ca8805e` | expected_assignment_version 409; Idempotency-Key surface; batch UUID query |
| E9 | `ca8805e` | import legacy soft-stale; TLT archived note |

**Заявленные оценки (экспертные, не score):**

- Инженерный guest path: **~88–92%**
- ТЗ ЭР MVP: **~90–93%**
- Кейс 1 product/UX: **~78–84%**
- Release «100% кейс 1»: **~75–80%** (не ready)
- §6 ЭР: **~88–92%** (было ~68–72% до cutover)
- Spec engineering: **~90–95%**; UX polish ниже
- FE ЭР MVP chrome: **~85–90%** (было ~55–65%)

### B. Заявлено «не сделано» — P0

1. SpecTable `bomSectionOf` / секции Трубы-Бочки
2. Кнопка «Исправить» unassigned → ЭР
3. Empty sections honesty
4. Settings modal не закрывать при selection/confirm
5. Preflight human summary
6. FE limit 5 ER in select-all
7. GuestHelpPage copy (3d/500/…)
8. File project labels/help
9–11. Design residual D-ELEC / D-SPEC / D-CHROME

### C. Заявлено «не сделано» — P1

12. Glide DnD
13. Inline edit vs modal (PDF §6.16)
14. Per-row Пересчитать
15. Full idempotency store (skip formula)
16. FE always sends expected_assignment_version
17. Unified «Требуется корректировка» label
18. Sizing modal on cable-options
19. Column density vs PDF §6.14
20. BE still allows resistive assign API
21. Residual threads le=100 on dead schemas
22–26. Spec polish (tab badges, kind alerts, provenance, selection copy, owner catalog)

### D. P2 / NFR

27–34. Browser matrix (**desktop only** 1000/1280/1440), load NFR, session recovery, purge cables_tlt file, e2e legacy cable_type, dead CSS, report polish, non-MVP systems

**Hard rule — mobile out of scope (2026-08-04, permanent):**
Мобильной версии **нет**. Viewport `390×844`, tablet, CSS &lt;1000 px = **N/A**, не FAIL,
не release blocker, **не снижает %** закрытости ТЗ.
Норматив: `docs/frontend/viewport-policy.md` §0, `case1-designer-brief.md` §2.1.
Не включать mobile FAIL в Top gaps / NOT READY без нового product decision.

### E. Документы

- Designer prompt: [`electrical-designer-residual-prompt.md`](./electrical-designer-residual-prompt.md) (**gitignored**, локально)
- Cutover status docs often gitignored under `/docs/`

### F. Что агент **не** заявлял зелёным

- Full browser proof 1000/1280/1440 для cutover UI
- Full DoD `test:agent-dod:dual-safe`
- Production authority spec catalog (seed-debt)

---

## Что сделать тебе (методика перепроверки)

### Шаг 1 — Inventory HEAD

- Подтверди commits E0–E9 на ветке / наличие ключевых файлов.
- Отметь: ahead of origin? untracked penpot noise ignore.

### Шаг 2 — Electrical ТЗ / §6 matrix

Построй таблицу:

| ID требования | Источник (PDF/ТЗ) | BE | FE | Evidence (file:line / test) | PASS / PARTIAL / FAIL / NOT RUN |

Минимум покрыть:

- ER ≤5, rename, delete
- Unassigned / assign Samreg only
- Auto calc after assign → `self_regulating_tt`
- Threads 1..3
- Voltage 230 RO
- Iдоп UI + fail-closed without Iдоп
- Summary Samreg+Total only
- Stale banner + status `stale` in query
- cable-options non-empty for ready pipe
- Manual mark from options (base model, no suffix)
- L* columns default_visible
- §9.15 ready gate
- DnD / keyboard assign
- expected_assignment_version 409
- Import legacy soft-stale

**Для каждого PASS** — докажи grep/read/test.
**Для PARTIAL/FAIL** — точный file:line.

### Шаг 3 — Spec §7

Проверь:

- Engineering path (generate, selection F5, stale fingerprint) — still closed?
- `bomSectionOf` bug — still present?
- «Исправить» button — still missing?
- Settings modal close on diagnostics — still?
- Catalog seed-debt vs owner

### Шаг 4 — Guest §3–4

- Help texts actual content
- Guest menu items
- File import/export labels

### Шаг 5 — Proof (минимум, risk-based)

Запусти **только** focused tests, связанные с заявленным:

```bash
# Backend (docker compose exec backend, если так принято в репо)
pytest app/tests/unit/formulas/test_tt_cable_options.py \
  app/tests/unit/services/test_electrical_query_status.py \
  app/tests/unit/services/test_legacy_import_soft_stale.py \
  app/tests/unit/services/test_electrical_assignment_version_gate.py \
  -v --no-cov

# Frontend
cd frontend && npx vitest run --project unit \
  src/__tests__/unit/pages/electrical/elecCalcStaleModel.test.ts \
  src/__tests__/unit/pages/electrical/ElecCalcStaleBanner.test.tsx \
  src/__tests__/unit/pages/electrical/elecCalcCableOptionsModel.test.ts \
  src/__tests__/unit/utils/electricalTableColumns.test.ts
```

Интеграцию/e2e — только если окружение живо; иначе **NOT RUN**.

### Шаг 6 — Пересобери deliverables

1. **Исправленный список «что не сделано»** (P0/P1/P2) — убрать ложные FAIL, добавить пропущенные.
2. **Обновлённые %** с методологической оговоркой (expert estimate).
3. **Таблица «заявлено vs факт»** (минимум 15 пунктов cutover).
4. **Top-10 gaps** для следующей работы.
5. **Confidence:** high/med/low по блокам + что не гонялось.

---

## Правила честности

- Незапущенная проверка = **NOT RUN**, не green.
- Audit docs от 03–04.08 **до cutover** не цитировать как current truth без re-grep.
- Не раздувать scope: tank full UI / resistive full product — out of MVP.
- Не править код, если задача только audit — **только анализ**, если user не просил fix.
- Если найдёшь регрессию cutover — опиши severity + file:line.

---

## Формат ответа пользователю

1. HEAD + что прогнано
2. Вердикт одной фразой
3. Матрица PASS/PARTIAL/FAIL (сжатая)
4. **Заявлено vs факт** (где предыдущий агент ошибся)
5. **Актуальный список «не сделано»** (P0→P2)
6. Рекомендуемый следующий slice

Язык ответа: **русский, коротко и по делу**.

---

## Режимы запуска (опционально, в конце user query)

Только audit:

> Сейчас только audit, без правок кода и без commit.

После audit — fix:

> После audit — почини только P0, найденные FAIL.

---

## Связанные локальные артефакты (могут быть gitignored)

| Файл | Содержание |
|---|---|
| Этот файл | Промпт перепроверки |
| [`electrical-mvp-cutover-agent-prompt.md`](./electrical-mvp-cutover-agent-prompt.md) | Слайсы E0–E9 + статус |
| [`electrical-designer-residual-prompt.md`](./electrical-designer-residual-prompt.md) | Задание дизайнеру D-ELEC |
| [`case1-electrical-be-fe-audit.md`](./case1-electrical-be-fe-audit.md) | Старый аудит (до cutover FE) |

*Конец промпта.*
