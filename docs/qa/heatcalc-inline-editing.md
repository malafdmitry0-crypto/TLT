# HeatCalc: inline-редактирование и валидация ячеек

**Проверено по коду:** 2026-07-19

**Статус:** текущий frontend-контракт; UI-proof в рамках этой документационной
очистки не перезапускался.

## Пользовательский контракт

- Обычный режим таблицы не редактирует ячейки. Настройки
  `Редактировать ячейки в таблице` нет, а старый persisted
  `inlineEditingEnabled` игнорируется.
- Редактирование ячеек включается только в коммерческом `Excel-режиме` и не
  применяется к scope `Все`.
- Commit ячейки создаёт локальный draft; сетевого автосохранения нет. Один или
  несколько draft-рядов сохраняются явной кнопкой `Сохранить` либо
  сбрасываются явным действием.
- Новые Excel-строки создаются локально и получают backend ID только после
  успешного save. При смене проекта drafts, локальные строки, активная ячейка и
  selection сбрасываются.
- При наличии выбранных dirty-строк save/discard действует на них; иначе — на
  все dirty-строки.
- Валидные строки могут сохраниться при смешанном batch. Невалидные и строки с
  backend-ошибкой остаются draft; пользователь получает сообщение о частичном
  результате.
- Сохранение обновляет heat-object query/summary и зависимую спецификацию.
  Электрорасчёт не запускается и остаётся отдельным явным действием.

Точка включения: `frontend/src/pages/HeatCalcPage.tsx` задаёт
`tableCellEditingEnabled = excelModeEnabled`.

## Единый путь данных и правил

`frontend/src/utils/heatCalcInlineEdit.ts` хранит draft в form units вместе с
`baseVersion`, исходными form values, dirty fields, errors и saving state.
Преобразование в backend params выполняется только перед save через те же
`pipe/tank` converters, что используются мастером объекта.

Метаданные полей берутся из `frontend/src/domain/heatCalcFields.ts` и реестра
полей. Нормализация, dependency graph, видимость и validation идут через
`frontend/src/domain/heatCalcFieldRules.ts`. Таблица не должна иметь отдельные
диапазоны или единицы.

Прямо в ячейке доступны только поля, сопоставленные с table column в общем
реестре. Dependency-driving поля, для которых нет такого mapping (в частности
`placement`, `shape`, `insulation_material`, `pipe_dn`), редактируются через
полную форму. Изменения формы выбранной Excel-строки используют тот же draft и
могут обновлять зависимые/скрытые поля.

## Валидация и визуальные состояния

- Ошибка commit хранится по canonical field ID вместе с введённым значением;
  editor остаётся активным до исправления.
- Перед save вся целевая строка повторно валидируется. Невалидная строка не
  отправляется в `createObject`/`updateObject`.
- Ошибки невидимых, computed или уже исправленных полей не должны оставаться
  stale blocker; requiredness проверяется в контексте актуального dependency
  graph.
- Неизменённая editable-ячейка, dirty-ячейка и error-ячейка различимы. Error
  имеет приоритет над dirty; используется `aria-invalid` и доступный текст
  ошибки. Активный editor ограничен шириной ячейки.
- Excel grid не имитирует отдельный input chrome в каждой неактивной ячейке;
  control монтируется только для активной ячейки.

## Реализация и focused evidence

| Слой | Файлы |
|---|---|
| Field contract | `frontend/src/domain/heatCalcFields.ts`, `heatCalcFieldRules.ts` |
| Draft/units/validation | `frontend/src/utils/heatCalcInlineEdit.ts` |
| State and save | `frontend/src/pages/heatcalc/useHeatCalcInlineDraftModel.ts`, `useHeatCalcDraftSaveModel.ts` |
| Grid mapping | `frontend/src/pages/heatcalc/useHeatCalcGridModel.ts` |
| Cell UI | `frontend/src/components/heatcalc/EditableTableCell.tsx`, `frontend/src/styles.css` |

Focused tests:

- `frontend/src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx`;
- `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcInlineDraftModel.test.tsx`;
- `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcGridModel.test.tsx`;
- `frontend/src/__tests__/unit/utils/heatCalcInlineEdit.test.ts`;
- `frontend/src/__tests__/unit/utils/heatCalcFieldRules.test.ts`;
- `frontend/src/__tests__/unit/components/EditableTableCell.test.tsx`.

Минимальная повторная проверка после изменения контракта:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run test:run -- \
  src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx \
  src/__tests__/unit/pages/heatcalc/useHeatCalcInlineDraftModel.test.tsx \
  src/__tests__/unit/pages/heatcalc/useHeatCalcGridModel.test.tsx \
  src/__tests__/unit/utils/heatCalcInlineEdit.test.ts \
  src/__tests__/unit/utils/heatCalcFieldRules.test.ts \
  src/__tests__/unit/components/EditableTableCell.test.tsx
```

Для UI/layout-изменения дополнительно обязательны before/after screenshots и
программная проверка clipping, overflow, overlap, readability и horizontal
scroll на целевых viewport.
