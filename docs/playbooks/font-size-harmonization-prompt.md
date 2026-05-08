# Prompt: Font Size Harmonization For HeatCalc UI

## Цель

Согласовать размеры шрифта в интерфейсе HeatCalc так, чтобы приложение выглядело
как единый инженерный инструмент, а не набор локальных правок с разными
`font-size`, `line-height` и весами.

Задача не про смену визуального стиля и не про "сделать крупнее". Нужно
выстроить понятную типографическую шкалу для рабочих экранов: таблиц, toolbar,
inline-form, вкладок, счётчиков, статусов и compact controls.

## Контекст

HeatCalc — плотное рабочее приложение. Основной пользователь читает таблицы,
числа, единицы измерения, параметры объектов и ошибки расчёта. Поэтому
типографика должна решать три задачи:

1. Быстрое сканирование строк и колонок.
2. Предсказуемая визуальная иерархия без декоративных размеров.
3. Стабильный layout при длинных русских названиях, числах, статусах и
   disabled-состояниях.

## Главный Принцип

В интерфейсе должна быть ограниченная шкала размеров. Каждый размер обязан иметь
роль. Если размер нельзя объяснить ролью, его нужно заменить ближайшим токеном
из шкалы.

## Область Работы

Основные файлы:

- `frontend/src/styles.css`
- `frontend/src/main.tsx`
- `frontend/src/pages/HeatCalcPage.tsx`
- `frontend/src/pages/ElecCalcPage.tsx`, если там используется тот же toolbar
- `frontend/src/components/wizard/ObjectWizard.tsx`
- `frontend/src/components/ImportExcelButton.tsx`
- `frontend/src/components/ExportObjectsButton.tsx`

Дополнительные проверки:

- `frontend/src/__tests__/**`
- `frontend/scripts/seed-guest-all-variants.mjs`
- e2e/visual smoke, если есть стабильный сценарий с screenshot.

## Что Нужно Сделать

### 1. Провести Аудит Размеров

Сначала собрать все размеры шрифта и связанные свойства:

- `font-size`
- `line-height`
- `font-weight`
- `letter-spacing`
- `font-family`
- inline styles вида `style={{ fontSize: ... }}`
- Ant Design theme token overrides в `frontend/src/main.tsx`
- классы таблиц, toolbar, tabs, captions, tags, inline-form.

Команды для аудита:

```bash
rg -n "font-size|fontSize|line-height|fontWeight|font-weight|letter-spacing|font-family" frontend/src
rg -n "contentFontSize|fontSize|controlHeight|BUTTON_SCALE" frontend/src/main.tsx
```

Результат аудита должен ответить:

- какие размеры реально используются;
- какие размеры дублируют друг друга;
- какие размеры выглядят случайными (`8.4px`, `11.2px`, разрозненные inline);
- какие размеры нужны для плотных таблиц;
- какие размеры нужны для toolbar;
- где text слишком мелкий для чтения;
- где text слишком крупный для своего контейнера.

### 2. Ввести Типографическую Шкалу

Рекомендуемая шкала для текущего UI:

| Token | Размер | Роль |
|---|---:|---|
| `--font-size-caption` | `11px` | служебные подписи, compact hints, вторичные labels |
| `--font-size-table` | `12px` | таблицы, compact tags, плотные значения |
| `--font-size-control` | `12px` | toolbar buttons, segmented, compact selects |
| `--font-size-body` | `13px` | основной текст рабочих панелей |
| `--font-size-title` | `14px` | заголовки групп, inline-form caption title |
| `--font-size-page-title` | `16px` | page-level заголовки, если они есть |

Важно:

- не использовать размеры меньше `11px` для читаемого текста;
- `10px` и меньше допустимы только для декоративных/иконных микрометок, если
  они не несут критической информации;
- не использовать `15px`, `17px`, `18px+` в рабочих таблицах и toolbar без
  явного обоснования;
- не масштабировать шрифт через viewport units;
- не использовать отрицательный `letter-spacing`.

### 3. Вынести Размеры В CSS Variables

Добавить или расширить блок `:root`:

```css
:root {
  --font-size-caption: 11px;
  --font-size-table: 12px;
  --font-size-control: 12px;
  --font-size-body: 13px;
  --font-size-title: 14px;
  --font-size-page-title: 16px;
  --line-height-compact: 1.15;
  --line-height-body: 1.35;
}
```

После этого заменить локальные значения на variables там, где это не ухудшает
читаемость:

```css
.calc-spreadsheet .ant-table {
  font-size: var(--font-size-table);
  line-height: var(--line-height-compact);
}
```

### 4. Убрать Случайные Inline Font Sizes

Inline `fontSize` допустим только если:

- компонент Ant Design невозможно стабильно настроить через класс;
- значение связано с конкретным внешним ограничением;
- рядом есть короткий комментарий или имя класса было бы хуже.

В остальных случаях:

- вынести в CSS class;
- использовать token;
- сгруппировать repeated inline styles.

Особенно проверить:

- labels в `tabs-row-srs`;
- controls электрорасчёта;
- import/export compact buttons;
- inline-form captions;
- table tags and selects.

### 5. Согласовать Ant Design Theme Tokens

В `frontend/src/main.tsx` сейчас есть overrides для Button. Нужно проверить, не
создают ли они конфликт с CSS.

Требования:

- Button `contentFontSize` и CSS `.actionbar-srs .ant-btn` не должны спорить;
- `controlHeight`, `controlHeightSM`, `paddingInline` должны соответствовать
  выбранной плотности;
- если используется `BUTTON_SCALE`, его роль должна быть понятна;
- не делать локальные `height/font-size` для каждой кнопки, если можно решить
  theme token или общим классом.

### 6. Таблицы

Таблица — главный потребитель типографики.

Правила:

- body cells: `--font-size-table`;
- header cells: `--font-size-table`, вес `600`;
- line-height compact, но не меньше `1.15`;
- padding строк не должен зависеть от текста;
- числовые колонки должны использовать `font-variant-numeric: tabular-nums`;
- status tags внутри таблиц должны не увеличивать высоту строки;
- select/input внутри строк должны совпадать по размеру с table text;
- ошибка строки не должна менять размер текста.

Проверить таблицы:

- исходные данные трубопроводов;
- исходные данные резервуаров;
- результаты расчёта;
- таблицы электротехнического расчёта, если используют общие стили.

### 7. Toolbar И Actionbar

Toolbar должен быть компактным и ровным.

Правила:

- buttons, segmented, tags, compact links должны использовать
  `--font-size-control` или `--font-size-caption`;
- все кнопки в одной группе должны иметь одинаковую высоту;
- icon-only buttons должны иметь одинаковую ширину и не зависеть от font-size;
- текстовые кнопки не должны переносить текст;
- disabled text должен быть читаемым, но визуально слабее;
- tooltip text не должен диктовать размер самой кнопки;
- счётчики должны использовать `tabular-nums`.

Проверить:

- `+` / добавить;
- сохранить;
- отменить;
- удалить;
- импорт/экспорт;
- счётчики объектов;
- выбранные строки;
- кнопка запуска электрорасчёта.

### 8. Inline-Form

Inline-form должен быть плотным, но не микроскопическим.

Правила:

- caption title: `--font-size-title` или осознанно `--font-size-body`, если
  высота панели критична;
- mode badge: `--font-size-caption`;
- labels полей: `--font-size-caption` или `--font-size-control`;
- values and inputs: не меньше `--font-size-control`;
- help text/tooltip не заменяет читаемый label;
- названия полей не должны выглядеть как случайная смесь `11px`, `12px`,
  `13px`.

Если текущая высота inline-form требует очень мелкий caption, сначала проверить:

- можно ли уменьшить padding;
- можно ли сократить текст;
- можно ли использовать ellipsis;
- можно ли перестроить группы.

Не снижать шрифт ниже читаемого порога ради сохранения высоты.

### 9. Вес Шрифта

Рекомендуемые веса:

- `400`: обычные значения;
- `500`: labels, активные tabs, активные segmented states;
- `600`: заголовки таблиц, заголовки групп, ключевые счётчики;
- `700+`: не использовать в плотном рабочем UI без сильной причины.

Правила:

- не компенсировать плохой контраст жирным шрифтом;
- не делать все labels жирными;
- не использовать жирный для каждого числового значения;
- активное состояние должно читаться через сочетание веса, цвета и фона.

### 10. Цвет И Контраст Текста

Типографика связана с контрастом.

Правила:

- основной текст: достаточно тёмный для чтения;
- secondary text: слабее, но не бледно-серый;
- disabled text: заметно disabled, но readable;
- errors: не только цвет, но и tag/icon/row state;
- links `.xlsx`, `.csv`: выглядят как secondary actions, но остаются читаемыми.

## Не Делать

- Не менять backend, БД, API и формулы.
- Не подключать новый web-font без отдельного решения.
- Не вводить декоративные display fonts.
- Не увеличивать все размеры глобально без проверки layout.
- Не уменьшать всё до `10px`.
- Не использовать viewport-based font-size.
- Не оставлять смесь случайных inline `fontSize`.
- Не ломать Ant Design controls локальными CSS-override без необходимости.
- Не менять смысл кнопок и workflow ради типографики.

## Тесты И Проверки

### Static Checks

После правок выполнить:

```bash
rg -n "font-size|fontSize|line-height|letter-spacing" frontend/src
npm run typecheck -- --pretty false
ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint src --ext .ts,.tsx
```

Цель `rg` — не отсутствие всех упоминаний, а отсутствие случайных значений,
которые не соответствуют шкале.

### Unit/Integration

Запустить релевантные frontend-тесты:

```bash
npm test -- --run src/__tests__/unit/pages/HeatCalcPage.test.tsx \
  src/__tests__/integration/pages/ElecCalcPage.test.tsx \
  src/__tests__/integration/components/ObjectWizardDependencies.test.tsx
```

### Playwright / Visual

На seed-проекте проверить:

1. Actionbar не переносится хаотично на `1440x900`.
2. Таблица не меняет высоту строк при hover/error.
3. Icon-only buttons остаются квадратными.
4. Счётчики не прыгают при `6`, `8`, `14`.
5. Таблица труб и резервуаров читается без увеличения масштаба браузера.
6. Результаты расчёта не теряют читаемость чисел.

Если есть скриншотный smoke, обновить screenshot только после ручной проверки.

## Acceptance Criteria

Задача считается выполненной, если:

1. В `:root` есть понятная шкала font-size/line-height tokens.
2. Основные рабочие зоны используют tokens, а не случайные числа.
3. Inline `fontSize` сокращены до обоснованного минимума.
4. Таблицы используют согласованный размер и `tabular-nums`.
5. Toolbar/actionbar использует согласованные размеры кнопок, labels и tags.
6. Inline-form не содержит нечитаемо мелких служебных текстов.
7. Нет отрицательного `letter-spacing` и viewport-based font-size.
8. Disabled/secondary text остаётся читаемым.
9. Unit/integration tests проходят.
10. Playwright seed/screenshot подтверждает, что layout не сломан.
11. Backend, БД и расчётные формулы не изменены.

## Критерии Хорошего Решения

Хорошее решение не должно выглядеть как редизайн. Пользователь должен просто
ощутить, что интерфейс стал ровнее:

- одинаковые элементы читаются одинаково;
- таблицы не выглядят мельче toolbar или наоборот;
- кнопки не прыгают по высоте;
- числа лучше сравниваются;
- статусы не выбиваются из строки;
- длинные русские названия не ломают layout;
- новых "магических" размеров не появляется.
