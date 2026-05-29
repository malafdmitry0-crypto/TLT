# Prompt: постепенная миграция form controls на React Aria Components

Нужно постепенно перевести поля ввода приложения на собственный слой form controls
поверх `react-aria-components`, не переписывая всю форму за один раз и не ломая
существующие бизнес-контракты.

## Зачем

Текущие формы построены в основном на Ant Design controls. Для плотных
инженерных форм SC-03/SC-04 это даёт несколько проблем:

- много visual overrides вокруг AntD DOM-структуры;
- сложно единообразно подсвечивать ошибки у конкретных полей;
- трудно контролировать keyboard/focus поведение;
- разные controls ведут себя по-разному в компактной форме;
- связь таблица -> форма -> draft/errors становится хрупкой при миграции на
  canvas/grid engines.

Нужен отдельный внутренний слой controls, который:

- сохраняет текущую модель данных и AntD `Form.Item` orchestration на первом
  этапе;
- даёт компактный визуальный стиль приложения;
- использует accessibility/keyboard primitives из React Aria Components;
- позволяет постепенно заменять `Input`, `InputNumber`, `Select`, `ComboBox`,
  checkbox/toggle без большого одномоментного риска.

## Библиотека

Использовать `react-aria-components`.

Причины:

- headless/styled-by-us подход, без навязанной темы;
- качественная keyboard/accessibility модель;
- есть базовые primitives: `TextField`, `NumberField`, `Select`, `ComboBox`,
  `FieldError`, `Checkbox`, `Switch`;
- можно оставить текущий внешний вид и плотность формы;
- можно интегрировать с текущими draft/errors без смены backend/API.

## Главный контракт

Миграция controls не должна менять бизнес-поведение.

Сохранить:

- выбор строки в таблице открывает правильную строку в форме;
- редактирование формы обновляет draft и таблицу;
- ошибки расчёта/валидации подсвечиваются у нужных полей;
- скрытые зависимые поля не занимают место;
- единицы измерения не меняются;
- сохранение остаётся явным, без autosave;
- backend/API не меняются.

## Подход

### Этап 1. Инфраструктура

Создать внутренние компоненты:

- `TltTextField`;
- `TltNumberField`;
- `TltSelect`;
- `TltComboBox`;
- `TltCheckbox` / `TltSwitch` при необходимости;
- общий CSS для compact engineering form.

Компоненты должны принимать минимальный стабильный API:

```ts
value
onChange
onBlur
disabled
readOnly
required
invalid/error
placeholder
unit
data-testid
aria-label
```

Не тащить наружу DOM-детали React Aria или AntD.

### Этап 2. Совместимость с AntD Form

На первом этапе не удалять AntD `Form.Item`.

`Form.Item` продолжает отвечать за:

- layout;
- validation rules;
- `ant-form-item-has-error`;
- связь с существующим `form.getFieldsValue`;
- текущие tests/helpers.

Новые controls должны уметь работать как controlled child AntD `Form.Item`:

```tsx
<Form.Item name="outer_diameter_mm" rules={...}>
  <TltNumberField unit="мм" />
</Form.Item>
```

### Этап 3. Числовые поля

Начать с числовых полей, потому что они чаще всего встречаются в SC-03:

- геометрия трубы/резервуара;
- температуры;
- коэффициенты;
- толщины изоляции;
- локальные элементы.

Сначала переключить существующую обёртку `UnitInputNumber` на `TltNumberField`,
сохранив старый API и `data-testid`.

### Этап 4. Текстовые поля

Затем мигрировать:

- `name`;
- текстовые поля проектов/модалок;
- технические короткие поля.

### Этап 5. Select и ComboBox

Отдельным шагом мигрировать:

- простые enum-select;
- справочные поля;
- searchable reference picker.

Для справочников нельзя потерять:

- поиск;
- clear;
- loading/error state;
- disabled state;
- required/error highlight;
- связь с hidden source fields.

### Этап 6. Ошибки

Ошибки показывать у поля визуально, без добавления длинного неструктурного
текста внутрь формы.

Правильная модель:

- поле с ошибкой получает красную рамку/фон;
- label может подсвечиваться;
- краткая inline-подсказка допускается только если она не ломает layout;
- полная причина должна быть доступна через tooltip/title/aria-description или
  существующий error banner.

### Этап 7. Проверки

Минимум для каждого шага:

- unit/component tests для нового control;
- integration test, что `Form.Item` получает значение и ошибку;
- focused ObjectWizard tests на обязательные поля;
- build/typecheck;
- UI proof для SC-03 формы на рабочем viewport.

## Ограничения

- Не менять backend.
- Не менять формат API.
- Не менять единицы измерения.
- Не удалять текущий draft/save/error flow.
- Не делать autosave.
- Не переписывать всю форму одним PR.
- Не ломать Excel/Glide таблицы.
- Не менять продуктовый контракт ради зелёных тестов.

## Definition of Done для первого этапа

- `react-aria-components` добавлен как dependency.
- Есть внутренний слой form controls.
- Хотя бы один реальный путь формы SC-03 использует новый control.
- Существующие `data-testid` и AntD `Form.Item` validation продолжают работать.
- Focus/keyboard ввод не хуже текущего.
- Ошибки по-прежнему подсвечивают конкретное поле.
- Focused frontend tests проходят.

