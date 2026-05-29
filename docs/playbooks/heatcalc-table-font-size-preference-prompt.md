# HeatCalc Table Font Size Preference Prompt

## Контекст

В HeatCalc уже есть рабочая таблица исходных данных, переключение типа объектов,
поиск, фильтры, сортировка, обычная backend-пагинация и модальное окно
`Поля таблицы` для управления видимостью, порядком и шириной колонок. В рамках
этой задачи это окно нужно переименовать в `Настройки таблицы`, потому что оно
начинает управлять не только полями, но и общим видом таблицы.

Следующий UX-шаг - дать пользователю управляемый размер шрифта таблицы. Это
нужно не для декоративного изменения UI, а для разных рабочих сценариев:

- на маленьком экране пользователь хочет видеть больше строк и колонок;
- при демонстрации или слабом зрении нужен более крупный текст;
- в таблице много инженерных чисел, и размер должен меняться предсказуемо,
  не ломая высоту строк, заголовки, фильтры и resize колонок.

## Цель

Добавить пользовательскую настройку размера шрифта для экранной таблицы
HeatCalc.

Настройка должна:

- применяться к таблице исходных данных и результатам HeatCalc, если они
  используют общий table surface;
- не менять расчётные данные;
- не менять фильтры, сортировки, backend-query и пагинацию;
- не менять XLSX/CSV export;
- не записываться в `ProjectObject.params` или расчётные таблицы;
- храниться как UI preference по тем же правилам, что остальные пользовательские
  настройки HeatCalc;
- быть ограниченной шкалой, а не произвольным набором случайных `px`.

## Главный Принцип

Размер шрифта таблицы - это `UI preference`, а не metadata поля, не layout
колонки и не настройка проекта.

Пользователь выбирает смысловой режим отображения, например `compact`,
`standard`, `comfortable`, `large`. В пользовательской настройке хранится только
стабильный token. Конкретные `font-size`, `line-height` и padding берутся из
дефолтного JSON/CSS token layer.

## Не Делать

Запрещено:

- хранить размер шрифта внутри `heatcalc.tableColumns.v1.columns[key]`;
- хранить размер шрифта отдельно для каждой колонки;
- хранить размер шрифта отдельно для каждой строки;
- менять `ProjectObject.params`;
- менять backend расчётов;
- менять export XLSX/CSV и report font sizes в этой задаче;
- менять названия/registry полей ради размера шрифта;
- сохранять дефолтный JSON в `localStorage` как пользовательскую настройку;
- использовать viewport-based font size (`vw`, `vh`, `clamp(...vw...)`);
- использовать отрицательный `letter-spacing`;
- давать пользователю произвольный input `8..30px`;
- уменьшать шрифт ниже читаемого минимума ради плотности.

Если позже понадобится размер шрифта для export/report, это отдельная
настройка, отдельный prompt и отдельный persistence contract.

## Область Работы

Основные файлы:

- `frontend/src/pages/HeatCalcPage.tsx`
- `frontend/src/styles.css`
- `frontend/src/config/heatcalc-table-view.default.json` или аналогичный
  дефолтный JSON для view-настроек таблицы
- `frontend/src/utils/heatCalcTableViewSettings.ts` или соседний utility
  module
- `frontend/src/api/preferences.ts`, если нужен только существующий generic API
- `backend/app/api/v1/preferences.py`, если для registered users добавляется
  строгая backend-валидация нового preference key
- `backend/app/tests/integration/api/test_user_preferences.py`
- `frontend/src/__tests__/unit/pages/HeatCalcPage.test.tsx`
- `frontend/src/__tests__/unit/utils/**`

Не использовать эту задачу для общей переделки типографики всего приложения.
Если нужен общий аудит шрифтов, сначала выполнить
`font-size-harmonization-prompt.md`.

## UX-Решение

Добавить настройку в существующее модальное окно полей таблицы и переименовать
его в `Настройки таблицы`.

Это обязательная часть задачи, а не опциональная косметика. После добавления
размера шрифта старое название `Поля таблицы` становится слишком узким:
пользователь настраивает уже не только набор колонок, но и вид таблицы.

Требования к переименованию:

- заголовок modal: `Настройки таблицы`;
- кнопка открытия modal: `Настройки таблицы`;
- tooltip/aria-label кнопки: `Настройки таблицы`;
- тесты должны искать modal по role/name `Настройки таблицы`;
- старый текст `Поля таблицы` не должен оставаться как основное название
  действия или dialog;
- если нужен transitional compatibility в тестах или analytics, держать его
  отдельно и не показывать пользователю как новый label.

Настройку размера шрифта разместить в этом же modal, но визуально отделить от
списка колонок.

Рекомендуемая структура:

```text
Настройки таблицы

[Трубы] [Резервуары]                    [Все поля] [Сбросить текущий тип]

Размер текста
[Компактный] [Стандартный] [Комфортный] [Крупный]

┌ drag ┬ show ┬ № ┬ Поле ┬ Ширина ┬ reset ┐
...

[Отмена] [Применить]
```

Требования:

- настройка размера шрифта находится над списком колонок, потому что она
  относится ко всей таблице, а не к конкретному полю;
- label должен быть коротким: `Размер текста` или `Вид таблицы`;
- не добавлять длинные пояснения в modal;
- у каждого режима должен быть tooltip с фактическим размером, например
  `12 px`;
- выбранный режим должен быть виден без hover;
- изменение в modal работает через draft и применяется после `Применить`;
- `Отмена` откатывает draft размера шрифта вместе с draft layout колонок;
- `Сбросить текущий тип` не должен сбрасывать размер шрифта, потому что размер
  шрифта не зависит от типа объекта;
- нужен отдельный `Сбросить вид` или `Сбросить размер текста`, если требуется
  сбросить только font preference.

## Шкала Размеров

Не использовать произвольные значения. Ввести дефолтный JSON с ограниченной
шкалой.

Рекомендуемая шкала:

| Token | Label | Table font | Line height | Padding Y | Назначение |
|---|---|---:|---:|---:|---|
| `compact` | Компактный | `11px` | `1.18` | `2px` | максимум строк на экране |
| `standard` | Стандартный | `12px` | `1.22` | `3px` | дефолтный рабочий режим |
| `comfortable` | Комфортный | `13px` | `1.28` | `4px` | лучше читаемость |
| `large` | Крупный | `14px` | `1.32` | `5px` | демонстрация, слабое зрение |

Правила:

- `standard` должен соответствовать текущему дефолтному виду таблицы;
- `compact` не должен уменьшать важный текст ниже `11px`;
- `large` не должен ломать toolbar и inline-form, потому что применяется только
  к table surface;
- при увеличении размера шрифта row height может вырасти, но не должна
  появляться визуальная каша: текст не перекрывает соседние строки;
- числовые колонки сохраняют `font-variant-numeric: tabular-nums`;
- header и body используют один table font-size, но header может иметь больший
  weight.

## Дефолтный JSON

Добавить дефолтный JSON, который описывает доступные режимы и дефолт.

Пример:

```json
{
  "version": 1,
  "defaultFontSize": "standard",
  "fontSizes": {
    "compact": {
      "label": "Компактный",
      "fontSizePx": 11,
      "lineHeight": 1.18,
      "cellPaddingY": 2
    },
    "standard": {
      "label": "Стандартный",
      "fontSizePx": 12,
      "lineHeight": 1.22,
      "cellPaddingY": 3
    },
    "comfortable": {
      "label": "Комфортный",
      "fontSizePx": 13,
      "lineHeight": 1.28,
      "cellPaddingY": 4
    },
    "large": {
      "label": "Крупный",
      "fontSizePx": 14,
      "lineHeight": 1.32,
      "cellPaddingY": 5
    }
  }
}
```

Дефолтный JSON является product default, но не пользовательской настройкой. Его
нельзя автоматически записывать в `localStorage` или БД при первом открытии.

## User Preference Contract

Создать отдельный preference key для table view, не расширять layout колонок.

Рекомендуемый key:

```text
heatcalc.tableView.v2
```

Рекомендуемый payload:

```json
{
  "version": 1,
  "fontSize": "standard",
  "updatedAt": "2026-05-09T00:00:00.000Z"
}
```

Правила:

- в пользовательском payload хранить только `fontSize` token, а не `fontSizePx`;
- `fontSize` должен быть одним из ключей дефолтного JSON;
- `updatedAt` можно хранить для диагностики, но не использовать как бизнес-логику;
- не хранить `lineHeight`, `cellPaddingY`, `label` или CSS values в user
  preference;
- поврежденную или неизвестную настройку игнорировать и использовать дефолтный
  JSON;
- при появлении нового product default старый браузерный дефолт не должен
  блокировать обновление, потому что дефолт не записывался как пользовательская
  настройка.

## Хранение По Ролям

Использовать тот же принцип, что в настройках колонок:

- новый гость: дефолтный JSON;
- гость с пользовательским изменением: `localStorage`;
- новый registered без записи в БД: дефолтный JSON, устаревший cache-key в
  `localStorage` очистить;
- registered с записью в БД: БД как source of truth, `localStorage` только кеш
  подтвержденной backend-записи.

Для registered:

- если backend вернул запись, применить её и заменить localStorage cache;
- если backend вернул `null`, удалить localStorage cache и применить дефолт;
- при сохранении сначала считать кеш устаревшим, отправить в БД, и только после
  успешного ответа обновить localStorage cache;
- при ошибке сохранения не делать неподтвержденный localStorage source of truth;
- если backend временно недоступен, можно показать валидный кеш как временное
  состояние, но после восстановления связи БД снова источник истины.

## Frontend Implementation

Ввести utility module, который:

- читает дефолтный JSON;
- нормализует unknown input;
- возвращает resolved view settings;
- умеет читать/писать guest localStorage;
- умеет читать/писать registered cache;
- не имеет side effects при простой нормализации;
- экспортирует allowed tokens для UI и tests.

Пример типов:

```ts
export type HeatCalcTableFontSize = 'compact' | 'standard' | 'comfortable' | 'large';

export interface HeatCalcTableViewSettings {
  version: 1;
  fontSize: HeatCalcTableFontSize;
}

export interface HeatCalcResolvedTableFontSize {
  key: HeatCalcTableFontSize;
  label: string;
  fontSizePx: number;
  lineHeight: number;
  cellPaddingY: number;
}
```

Не смешивать эти types с `HeatCalcTableColumnSettings`.

## CSS Implementation

Применять размер шрифта через CSS variables/class на корне таблицы, а не через
inline style каждой ячейки.

Пример:

```tsx
<div
  className="calc-spreadsheet"
  data-table-font-size={resolvedTableView.fontSize}
>
  ...
</div>
```

Пример CSS:

```css
.calc-spreadsheet {
  --heatcalc-table-font-size: 12px;
  --heatcalc-table-line-height: 1.22;
  --heatcalc-table-cell-padding-y: 3px;
}

.calc-spreadsheet[data-table-font-size="compact"] {
  --heatcalc-table-font-size: 11px;
  --heatcalc-table-line-height: 1.18;
  --heatcalc-table-cell-padding-y: 2px;
}

.calc-spreadsheet .ant-table {
  font-size: var(--heatcalc-table-font-size);
  line-height: var(--heatcalc-table-line-height);
}

.calc-spreadsheet .ant-table-cell {
  padding-top: var(--heatcalc-table-cell-padding-y);
  padding-bottom: var(--heatcalc-table-cell-padding-y);
}
```

Правила:

- не менять размер иконок toolbar от table font size;
- не менять inline-form input font size этой настройкой;
- filter dropdown может использовать table font-size или control font-size, но
  не должен становиться нечитаемым;
- empty state и pagination должны оставаться читаемыми;
- horizontal scroll не должен исчезать или ломаться из-за крупного шрифта;
- ellipsis должен продолжать работать в `name` и длинных enum columns.

## Backend Validation

Если preference сохраняется для registered users через generic preferences API,
добавить строгую валидацию для key `heatcalc.tableView.v2`.

Backend должен проверять:

- payload JSON-object;
- `version === 1`;
- `fontSize` в allowed list: `compact`, `standard`, `comfortable`, `large`;
- отсутствие лишних display/CSS fields (`fontSizePx`, `lineHeight`,
  `cellPaddingY`, `label`);
- разумный максимальный размер payload;
- принадлежность preference текущему пользователю.

Backend не должен:

- принимать произвольный `fontSizePx`;
- знать CSS;
- писать настройку в project/object/calculation tables;
- менять export/report settings.

## Accessibility

Настройка размера шрифта должна быть доступной с клавиатуры.

Требования:

- segmented/radio group имеет accessible name `Размер текста таблицы`;
- каждое значение имеет понятный label;
- `large` действительно увеличивает читаемый текст таблицы;
- focus state виден;
- изменение не должно ломать screen reader names колонок;
- настройка не должна быть единственным способом прочитать данные: контраст,
  tooltip и ellipsis остаются корректными.

## Состояния И Edge Cases

Проверить:

- новый гость получает default `standard`, localStorage не создается сам;
- гость меняет размер, перезагружает страницу, настройка восстановлена;
- registered без записи в БД игнорирует старый cache и использует default;
- registered с записью в БД применяет БД и обновляет cache;
- поврежденный localStorage fallback к default;
- неизвестный token, например `tiny`, fallback к default;
- после смены font size активные фильтры и сортировка остаются на тех же keys;
- при `large` заголовки колонок не перекрывают resize handle;
- при `compact` текст не становится меньше `11px`;
- при изменении размера шрифта не меняется количество объектов, результат
  расчета и backend query params;
- export XLSX/CSV не меняется.

## Тесты

Frontend unit:

- default settings из JSON;
- нормализация unknown/поврежденного input;
- unknown font token fallback к default;
- guest default не записывается в localStorage;
- guest save записывает только user preference;
- registered no DB clears cache and uses default;
- registered DB preference updates cache;
- user preference не содержит `fontSizePx`, `lineHeight`, `label`.

Frontend component:

- modal называется `Настройки таблицы`;
- кнопка открытия modal называется `Настройки таблицы`;
- modal показывает control `Размер текста таблицы`;
- изменение в modal не применяется до `Применить`;
- `Отмена` откатывает draft;
- `Применить` меняет `data-table-font-size`;
- `Сбросить текущий тип` не сбрасывает font size;
- `Сбросить размер текста` возвращает default;
- при `large` таблица остается доступной и видимой;
- при `compact` таблица показывает больше строк без overlap.

Backend tests:

- valid payload сохраняется;
- unknown token возвращает `422`;
- payload с `fontSizePx` возвращает `422`;
- другой пользователь не читает чужую настройку;
- guest не может писать registered preference.

Playwright smoke:

- открыть HeatCalc;
- открыть `Настройки таблицы`;
- выбрать `Крупный`;
- применить;
- проверить, что table root получил `data-table-font-size="large"`;
- перезагрузить страницу в гостевом режиме;
- проверить, что настройка восстановлена;
- выбрать `Компактный`;
- убедиться screenshot-проверкой, что строки не перекрываются.

## Acceptance Criteria

Готово, если:

- пользователь может выбрать размер текста таблицы из ограниченной шкалы;
- настройка сохраняется отдельно от column layout;
- в user preference хранится только stable token;
- default JSON не записывается как пользовательская настройка;
- guest/registered storage работает по тем же правилам, что остальные
  UI-конфиги;
- backend валидирует registered payload;
- настройка не влияет на расчёты, фильтры, сортировку, пагинацию и export;
- CSS применяет размер через variables/data attribute, без inline style каждой
  ячейки;
- `compact` не опускается ниже читаемого минимума;
- `large` не ломает header, ellipsis, resize handle и горизонтальный scroll;
- тесты покрывают default, storage, validation, apply/cancel и визуальный smoke.
