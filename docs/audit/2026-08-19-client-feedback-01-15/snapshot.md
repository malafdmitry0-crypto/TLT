# Замечания 1–15 — исходный snapshot

**Статус:** AUDIT BASELINE, не ACTIVE-очередь.

**Зафиксировано:** 2026-08-19T18:53:31Z

**Проверенный commit:** `187cb9a` (`feat(reports): ATB-05 show ambient temperature bounds`)

**Среда:** Darwin 23.6.0 arm64; Node v23.5.0; Python 3.14.6.

**План:** [plan.md](./plan.md) · **исполняемые промпты:**
[prompts.md](./prompts.md)

Snapshot фиксирует состояние исходного дерева перед созданием execution
packet. Он не маршрутизирует работу и не меняет единственную ACTIVE
frontend-очередь в
[refactor-backlog.md](../../frontend/refactor-backlog.md).

## Итог классификации

| Статус | Количество | Пункты |
|---|---:|---|
| Исправлено; нужен только regression guard | 2 | 1, 7 |
| Частично исправлено | 1 | 5 |
| Не исправлено | 10 | 2, 3, 4, 6, 8, 9, 10, 11, 12, 15 |
| Нужна детерминированная диагностика | 1 | 13 |
| Уже выполняется отдельным пакетом | 1 | 14 |

Классификация относится к проверенному commit. Незакоммиченный WIP ниже
учитывается только как конфликт владения: его незавершённое поведение не
объявляется исправленным.

## Матрица пунктов

| № | Статус | Факт на snapshot | Маршрут |
|---:|---|---|---|
| 1 | Исправлено | `merge` пропускает повторный объект; `append` оставлен явным режимом создания копий | Финальный regression seal |
| 2 | Не исправлено | Формульно невалидная строка сохраняется с `is_valid=false`, входит в `created`; frontend не типизирует и не показывает `valid/invalid` | FB15-01A → FB15-01B |
| 3 | Не исправлено | Источник `climate` восстанавливается буквально; изменение только ячейки температуры не превращает значение в ручное | FB15-02 |
| 4 | Не исправлено | CSV-шаблон по-прежнему не покрывает семантический набор XLSX: грунт, полную многослойность, λ и диапазоны, покрытие | FB15-03A → FB15-03B |
| 5 | Частично | Для трубы есть содержательное сообщение о наружном радиусе; для резервуара наружу уходит `invalid_buried_height`, ранней form-проверки нет | FB15-04A → FB15-04B |
| 6 | Не исправлено | Формула различает ручную марку в `details`, но тексты ошибок всё ещё говорят про весь каталог | FB15-05 |
| 7 | Исправлено | Form name `burial_depth` сопоставлен каноническому id `pipe_centerline_depth`; обязательность и диапазон используют каноническое значение | Финальный regression seal |
| 8 | Не исправлено | Генератор имени читает только воздушную температуру, небезопасен на неполной форме и не синхронизирует имя в draft | FB15-06A → FB15-06B |
| 9 | Не исправлено | Backend рассчитывает объектный предел, но UI показывает лишь placeholder «По каталогу» без применённого числа | FB15-07A → FB15-07B |
| 10 | Не исправлено | Guest Help вызывает `navigate('/')` и подписывает действие «На главную» | FB15-08 |
| 11 | Не исправлено | `.admin-layout-logout` использует тот же белый token, что и заголовок на светлом фоне | FB15-09 |
| 12 | Не исправлено | `insulation_temperature_basis` видим в форме и остаётся доступной колонкой таблицы | FB15-10A → FB15-10B |
| 13 | Диагностика | Кодовый default гостя — 3 суток, но `.env`/production example содержат 20 минут, а compose не передаёт TTL; потеря draft за 5 минут не закреплена тестом | FB15-11A → FB15-11B |
| 14 | В работе | Отдельный пакет ATB уже имеет commits 00/01/02a/02b/02c/05; текущий WIP пересекает таблицу и interchange | FB15-00, затем существующие ATB prompts |
| 15 | Не исправлено | Для справочного материала λ выводится как `output`; backend запрещает manual properties рядом со справочным material | FB15-12A → FB15-12B → FB15-12C → FB15-12D |

## Ключевые доказательства

- Импорт и подсчёт невалидных строк:
  [`excel_import_service.py`](../../../backend/app/services/excel_import_service.py),
  [`objects.py`](../../../backend/app/api/v1/objects.py),
  [`ImportExcelButton.tsx`](../../../frontend/src/components/ImportExcelButton.tsx),
  [`projects.ts`](../../../frontend/src/api/projects.ts).
- Источник температуры и spreadsheet schemas:
  [`excel_import_service.py`](../../../backend/app/services/excel_import_service.py),
  [`test_excel_import_helpers.py`](../../../backend/app/tests/unit/services/test_excel_import_helpers.py).
- Зависимые формульные ошибки:
  [`outcome_errors.py`](../../../backend/app/formulas/heat_loss/outcome_errors.py),
  [`test_heat_loss_structured_error_channel.py`](../../../backend/app/tests/unit/formulas/test_heat_loss_structured_error_channel.py).
- Ручная марка кабеля:
  [`self_regulating.py`](../../../backend/app/formulas/electrical/self_regulating.py),
  [`electrical_error_guidance.py`](../../../backend/app/services/electrical_error_guidance.py).
- Наименование подземных объектов:
  [`objectWizardNaming.ts`](../../../frontend/src/utils/objectWizardNaming.ts),
  [`useObjectWizardFormSync.ts`](../../../frontend/src/components/wizard/useObjectWizardFormSync.ts),
  [`ConfirmStep.tsx`](../../../frontend/src/components/wizard/steps/ConfirmStep.tsx).
- Применённый I доп:
  [`sections.py`](../../../backend/app/formulas/electrical/sections.py),
  [`ElecCalcIdopSettings.tsx`](../../../frontend/src/pages/electrical/ElecCalcIdopSettings.tsx).
- Малые UI-дефекты:
  [`GuestHelpPage.tsx`](../../../frontend/src/pages/help/GuestHelpPage.tsx),
  [`admin-layout.css`](../../../frontend/src/pages/admin/admin-layout.css).
- `tm` и λ изоляции:
  [`InsulationSettingsRow.tsx`](../../../frontend/src/components/wizard/InsulationSettingsRow.tsx),
  [`InsulationConductivityField.tsx`](../../../frontend/src/components/wizard/InsulationConductivityField.tsx),
  [`heatcalc-fields.default.json`](../../../frontend/src/config/heatcalc-fields.default.json).
- Сессии:
  [`config.py`](../../../backend/app/core/config.py),
  [`docker-compose.yml`](../../../docker-compose.yml),
  [`.env.production.example`](../../../.env.production.example).
- Пункт 14 имеет собственный пакет:
  [`answers/05-ambient-temperature-bounds/plan.md`](../../../answers/05-ambient-temperature-bounds/plan.md),
  [`answers/05-ambient-temperature-bounds/prompts.md`](../../../answers/05-ambient-temperature-bounds/prompts.md).

## Незакоммиченный WIP на старте

До создания этих документов `git status --short` показывал:

```text
 M backend/app/generated/heatcalc_field_contract.py
 M backend/app/services/excel_import_service.py
 M backend/app/tests/integration/api/test_import_excel.py
 M backend/app/tests/integration/api/test_project_io.py
 M backend/app/tests/unit/services/test_excel_import_helpers.py
 M backend/app/tests/unit/services/test_project_io_helpers.py
 M frontend/src/__tests__/integration/components/ObjectWizardDependencies.placement-visibility.test.tsx
 M frontend/src/__tests__/unit/pages/heatcalc/heatCalcColumnRenderers.test.tsx
 M frontend/src/__tests__/unit/utils/heatCalcTableColumns.test.ts
 M frontend/src/config/heatcalc-fields.default.json
 M frontend/src/pages/heatcalc/heatCalcColumnRenderers.tsx
 M frontend/src/types/calculationHeat.ts
 M frontend/src/utils/heatCalcTableColumnNormalizeModel.ts
```

Следствие: FB15-01A, FB15-02, FB15-03A/B, FB15-07A/B, FB15-10A/B и FB15-12*
нельзя начинать, пока текущий владелец не завершит или явно не передаст
пересекающийся WIP.

## Выполненные проверки

Выполнены только read-only проверки для подготовки плана:

```text
git status --short
git rev-parse --short HEAD
git log --oneline --decorate -20
git diff --stat
rg / sed / cat по перечисленным production- и test-файлам
```

Runtime tests, frontend proof, backend pytest, E2E и browser QA: **NOT RUN** —
задача этого запуска docs-only. Незапущенные проверки не считаются зелёными.

Для самого execution packet выполнено:

```text
scripts/codex-functional-audit.sh docs
  PASS (docs drift stage штатно сообщил, что project Markdown check отсутствует)

node --input-type=module -e <relative Markdown link checker> snapshot.md plan.md prompts.md
  PASS: All relative Markdown links resolve

diff <(rg ... plan.md | sort -u) <(rg ... prompts.md | sort -u)
  PASS: наборы FB15 slice ID совпадают

git diff --cached --check
  PASS
```
