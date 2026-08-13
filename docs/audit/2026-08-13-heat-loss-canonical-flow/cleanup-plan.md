# Heat-loss cleanup — актуальная очередь

**Статус:** ACTIVE
**Дата:** 2026-08-13
**HEAD при актуализации:** `ac7af10` (`fix(heat-loss-core): validate profiles and prepared inputs`)
**Сверхседает:** черновик cleanup-plan до ревью C0–C6
**Промпты:** `cleanup-prompts.md`
**Динамика:** только `snapshot.md` на текущем HEAD, не числа из `03f6ef3` / `d67936c`

Эти файлы — рабочая очередь. Их нужно держать в Git (`git add -f`), потому что
`/docs/` в `.gitignore`. Не копировать очередь во второй файл.

## Вердикт

- C1 и C3 почти готовы.
- C2 допустим после усиленного поиска потребителей и proof.
- C4 нельзя выполнять как «зови calculate_* из *_formula.py». Нужен один kernel.
- C5 допустим, но контракт ошибок задаётся здесь, не агентом.
- C0 не писать заново: актуализировать baseline и контракты `ac7af10`.
- C6a (решение о legacy API) — до C4. C6b (экспорт/README) — после C4.

## Решение C6a (принято в этом плане)

**Legacy API сохраняется.** `evaluate_pipe`, `evaluate_resolved_air_tank`,
`evaluate_resolved_buried_tank` остаются публичными.

После C4 они обязаны быть тонкими адаптерами единого execution kernel.
Нельзя держать две копии orchestration в `*_formula.py` и `*_evaluation.py`.

`run_pipe_formula` / `run_tank_formula` — библиотечный validate+run. Backend
идёт в `assemble_*` + `evaluate_prepared_*`. Менять состав `__all__` (добавить
новые имена или выкинуть старые) — только C6b, после зелёного C4.

## Фронт / бэк

Frontend не импортирует пакет. Он зависит от HTTP/JSONB и путей ошибок.

| Контракт | Где | Правило cleanup |
|---|---|---|
| `POST /calc/heat-loss`, batch | `frontend/src/api/calculations.ts` | не менять |
| Ключи result | `FormulaCalcResult`, HeatCalc, electrical | не менять имена и семантику «до K» |
| `is_valid` / `results` / `validation_errors` | `heatLossCalcStatus` | import invalid: `false` / `null` |
| Hot-side overlay | `heatCalcPageUtils.ts` regex | не менять литерал ValueError |
| Подсветка полей формы | `objectWizardValidationModel.ts` | главный mapping C5: `field`, `fields`, путь `insulation_layers.N.material` |
| Wizard tests | `ObjectWizardDependencies.validation-highlight.test.tsx` | входят в C5 |

C1–C4 и C6 frontend не меняют. `agent:scope --changed` там **NOT RUN**.
C5 включает wizard model + highlight tests. Hot-side regex трогать только если
меняется сам литерал (по умолчанию не меняется).

## Очередь

| # | Слайс | Суть |
|---|---|---|
| **C0** | Актуализировать snapshot на `ac7af10` | Не дублировать facade JSON / hot-side / K / lookup |
| **C1** | Удалить мёртвый `common.py` | Искать импорты AST, не docstring |
| **C2** | Убрать шимы `app.formulas.heat_loss.core` | Поиск по всему репо + import/wheel smoke |
| **C3** | Снять весь `_COMPAT` с фасадов | Весь список, не два импорта |
| **C6a** | Уже решено здесь | Docs-only, если этот файл ещё не в Git |
| **C4** | Единый execution kernel | Prepared и legacy зовут одно ядро |
| **C5** | Каталог только в application preparation | Контракт ошибок ниже |
| **C6b** | README + `__all__` без удаления legacy имён | После C4 |
| **CF** | Финальная регрессия | Suite IDs vs **новый** C0 snapshot |

Полный backend suite: после C4, после C5, в CF. Не после C1–C3.

## Контракт C5 (зафиксирован)

1. `InsulationLayer` — типы, структура, manual-layer правила, **без каталога**.
2. Родительские Pydantic pipe/tank — **без каталога**.
3. Application preparation один раз резолвит reference material → law + интервал.
4. Ошибки resolver структурированы, путь `insulation_layers.{i}.material` (и соседние поля слоя).
5. Тот же путь: create, update, import, recalculate, admin preview.
6. Невалидный импорт: `is_valid=false`, `results=null`.
7. Форма подсвечивает слой и поле через `objectWizardValidationModel` (`fields` /
   `field` / путь `insulation_layers.N.*`).

Старое snapshot-решение «`InsulationLayer.model_validate()` обязан ходить в
каталог» объявляется устаревшим этим планом.

## Инварианты `ac7af10`, которые C4 обязан сохранить

- `validate_heat_loss_formula_profile` на сборке prepared.
- Типизированные environment-ветки (pipe/tank formula environment), без второй
  расходящейся копии скаляров.
- `FormulaOutcome`: либо result, либо report, никогда оба.
- Late-bound проверка K в `assemble_*` (0 доходит до диапазона, не в
  `resolve_safety_factor`).
- Backend не повторяет полный `validate_*_contract` после Pydantic.

## Запрещено

Формулы и порядок арифметики; ranges; округление pipe≠tank; ключи JSON
результатов; hot-side литерал; API/query/units/UUID; UX; схема БД; унификация
pipe/tank; «починка» пустых толщин air-pipe domain-check; Help про admin-K
заодно.

## NEXT

**C0.**
