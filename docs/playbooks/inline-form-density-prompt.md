# Prompt: Inline Object Form Density And Readability

## Цель

Перестроить inline-форму параметров объекта в HeatCalc так, чтобы она стала
плотнее, читабельнее и ниже по высоте. Главный пользовательский результат:
при открытой форме должна оставаться видимой таблица ниже, а редактирование
параметров не должно требовать постоянного вертикального скролла взгляда.

Задача не про то, чтобы просто уменьшить или увеличить шрифт. Текущая проблема
состоит в сочетании факторов:

- длинные labels рвутся на неестественные строки;
- help-иконки, select arrows и addon-единицы конкурируют за одно место;
- часть секций содержит много пустого пространства, а другая секция сжата;
- поля визуально наезжают друг на друга при коротких колонках;
- форма занимает слишком большую высоту и вытесняет таблицу;
- увеличение шрифта в input/select ухудшило плотность именно в этой области.

Нужно повысить читаемость через структуру, сетку и предсказуемые размеры, а не
через декоративные размеры шрифта.

## Область Работы

Основные файлы:

- `frontend/src/styles.css`
- `frontend/src/components/wizard/ObjectWizard.tsx`
- `frontend/src/components/wizard/HelpedControl.tsx`
- `frontend/src/components/wizard/FieldLabel.tsx`
- `frontend/src/components/wizard/steps/PipeGeometryStep.tsx`
- `frontend/src/components/wizard/steps/TankGeometryStep.tsx`
- `frontend/src/components/wizard/steps/ThermalStep.tsx`
- `frontend/src/pages/HeatCalcPage.tsx`

Проверки:

- `frontend/src/__tests__/integration/components/ObjectWizardDependencies.test.tsx`
- `frontend/src/__tests__/unit/pages/HeatCalcPage.test.tsx`
- Playwright guest seed with screenshot:

```bash
GUEST_SESSION_ID=16ARAghUNdSNmxdT7ksh6vMjfTkbIhLkfvIFZHiIwsQ PROJECT_ID=a9732f0e-a9bb-452f-961e-e2828a979fd1 npm run seed:guest:playwright -- --clear --screenshot=/private/tmp/tlt-seeded-guest-script.png
```

## Главный Принцип

Inline-form должна работать как плотная инженерная панель ввода данных над
таблицей. Это не карточная форма и не wizard-page. Каждый пиксель высоты должен
помогать вводу, проверке или пониманию параметров.

Приоритеты:

1. Сначала убрать пустоты и конфликтующие элементы.
2. Затем нормализовать сетку и размеры controls.
3. Только после этого трогать шрифт.

Шрифт в этой зоне должен оставаться compact, но читаемым. Нельзя компенсировать
плохую сетку увеличением `font-size`.

## Целевые Метрики

Для desktop viewport около `1440×900`:

- обычная форма с 1 слоем изоляции должна занимать не более `150-180px`
  рабочей высоты без actionbar;
- расширенная форма с подземными параметрами или 3 слоями изоляции может быть
  выше, но должна оставлять видимыми заголовок таблицы и несколько строк;
- при открытой форме пользователь должен видеть не только actionbar, но и
  начало таблицы исходных данных или результатов;
- ни один label, input value, unit addon, select arrow или help icon не должен
  перекрывать другой элемент;
- не должно быть секций, растянутых пустотой только потому, что соседняя секция
  выше.

Если точная высота конфликтует с читаемостью, предпочтение отдаётся читаемости,
но сначала нужно попробовать структурные решения: перенос секции, группировку,
сокращение label, fixed row rhythm, compact control slot.

## Что Нужно Исправить

### 1. Сделать Аудит Формы

Перед изменениями зафиксировать:

- текущую высоту `.inline-form-srs` и `.form-grid-srs`;
- количество видимых строк таблицы при открытой форме;
- какие секции определяют максимальную высоту;
- какие поля занимают целую строку без необходимости;
- где есть overlap help icon / select arrow / addon;
- какие labels переносятся плохо;
- какие поля показываются редко и могут быть компактнее или скрываться по
  условию.

Рекомендуемые команды:

```bash
rg -n "inline-object-form|form-grid-srs|form-col-srs|field-control-with-help|SECTION_WIDTH|SECTION_FIELD|FieldLabel|HelpedControl" frontend/src
rg -n "className=.*form-item|label=\\{fieldLabel|withHelp\\(" frontend/src/components/wizard
```

Дополнительно сделать Playwright screenshot до/после и сравнить:

- форма резервуара `outdoor`;
- форма трубы `underground`;
- форма с 2 и 3 слоями изоляции;
- форма с климатом и без климата.

### 2. Перестроить Сетку Секций

Текущая схема с фиксированными весами секций и растягиванием может создавать
парадокс: одна секция пустая, другая тесная, а вся форма остаётся высокой.

Правила:

- `.form-grid-srs` не должен растягивать пустые секции по высоте без причины;
- секции должны выравниваться по верхнему краю;
- ширина секций должна учитывать реальную плотность полей, а не только
  декоративные веса;
- узкая секция `Электропараметры и арматура` не должна ломать controls и
  заголовок;
- если секция не помещается в одну строку без overlap, лучше перенести часть
  секции во вторую строку формы, чем сохранять наезд элементов;
- пустое пространство внутри секции нужно устранять через `align-content: start`,
  `grid-auto-rows`, `minmax()` и корректные `min-width`, а не через отрицательные
  margin.

Рекомендуемый подход:

- перейти от "4 фиксированные колонки любой ценой" к responsive grid:
  `grid-template-columns: minmax(...) minmax(...) minmax(...) minmax(...)`;
- для секций с большим числом compact fields разрешить внутреннюю сетку в 2-3
  field columns;
- для маленькой секции электропараметров дать достаточную минимальную ширину
  или перенести её в compact row;
- отказаться от секционного `height: stretch`, если оно создаёт пустые низы.

### 3. Стабилизировать Field Row

Каждое поле должно иметь предсказуемый слот:

```text
[label slot] [control slot] [help slot]
```

или для very compact полей:

```text
[short label] [value] [unit] [help]
```

Правила:

- help icon не должен быть absolute-overlay поверх input/select;
- help icon должен быть отдельной grid/flex ячейкой справа от control;
- select arrow и help icon не должны занимать одно и то же место;
- unit addon (`мм`, `°C`, `Вт/мК`) не должен перекрываться help icon;
- `InputNumber` с addonAfter должен иметь фиксированную высоту и понятную
  ширину value-части;
- ширина числовых controls должна зависеть от ожидаемой длины значения, а не
  от ширины всей секции;
- длинные select должны иметь ellipsis, но выбранное значение не должно
  исчезать под help icon.

Не использовать `display: contents` для critical layout, если из-за этого
теряется предсказуемая геометрия control/help.

### 4. Label Strategy

Проблема labels не решается механическим `word-break: break-word`.

Правила:

- не допускать разрывов внутри коротких слов вроде `Наименование`;
- не использовать `overflow-wrap: anywhere` для labels по умолчанию;
- длинный label должен либо сокращаться до инженерного обозначения, либо иметь
  controlled two-line layout;
- единицы измерения должны жить в addon/control, а не раздувать label;
- для общеупотребимых инженерных параметров использовать короткие labels:
  - `T окр.`
  - `T объекта`
  - `T макс. окр.`
  - `T макс. продукта`
  - `U`
  - `Kзап`
  - `Qдоп`
  - `α внеш`
  - `λ грунта`
  - `λ стенки`
- расшифровку длинного смысла давать в tooltip/help, а не в постоянном label;
- label не должен занимать больше 2 строк;
- если label не помещается в 2 строки, это сигнал к переименованию поля или
  перестройке группы.

`FieldLabel` не должен автоматически делить любую фразу пополам. Лучше иметь
явную карту compact labels:

```ts
const COMPACT_FIELD_LABELS = {
  process_temperature: 'T объекта',
  ambient_temperature: 'T окр.',
  max_process_temperature: 'T макс. продукта',
};
```

Длинное человекочитаемое описание сохранять в help text.

### 5. Typography For This Area

Для inline-form использовать отдельный плотный профиль поверх общей шкалы:

- section title: `11px`, weight `600`;
- field label: `11px`, line-height `1.1-1.15`;
- input/select value: `12px`, line-height под высоту control;
- unit addon: `11px`;
- help icon: размер не больше `12px`, отдельный слот;
- validation text: `11px`, не должен постоянно увеличивать высоту строки.

Важно:

- не увеличивать `input/select` выше `12px` в этой зоне без веской причины;
- не снижать читаемый текст ниже `11px`;
- не использовать отрицательный `letter-spacing`;
- не делать labels жирными везде;
- активность/required-состояние показывать не жирностью, а тонким визуальным
  маркером.

### 6. Compact Control Tokens

Ввести или уточнить tokens:

```css
:root {
  --inline-form-control-height: 22px;
  --inline-form-row-gap: 2px;
  --inline-form-column-gap: 6px;
  --inline-form-section-gap: 3px;
  --inline-form-label-width: 76px;
  --inline-form-compact-label-width: 64px;
  --inline-form-help-slot: 14px;
}
```

Фактические значения можно выбрать по результату визуальной проверки, но они
должны быть централизованы. Не размазывать `22px`, `24px`, `84px`, `104px`,
`128px` по разным селекторам без роли.

### 7. Сократить Высоту Через Группировку

Поля, которые логически образуют пару, должны стоять рядом:

- `T окр.` + `T объекта`;
- `T макс. окр.` + `T макс. продукта`;
- `Среда` + `Классификация зоны` + `Температурная группа`;
- `U` + `Kзап` + `Qдоп` + `Пропарка`;
- геометрические размеры резервуара в одной компактной группе;
- слои изоляции в повторяемой mini-grid: `δ`, `Материал`, `λ`.

Поле не должно занимать полную ширину секции, если его значение короткое.
Full-width допустимы:

- `Наименование`;
- `Климат`;
- длинные справочные select с поиском;
- материал с длинными названиями, если ellipsis ухудшает выбор.

### 8. Progressive Disclosure

Форма должна показывать только то, что нужно для текущего состояния.

Правила:

- поля 2-го и 3-го слоя появляются только при выбранном количестве слоёв;
- ручная `λ` показывается только в ручном режиме или для `Другое`;
- подземные поля показываются только для подземного размещения;
- климатическая обеспеченность показывается только при выбранном климате;
- дополнительные/редко меняемые электрические параметры можно сгруппировать
  компактнее, но нельзя прятать критичные расчётные параметры без ясного
  affordance.

Если вводится collapse/expand:

- по умолчанию открыты только расчётно-критичные поля;
- состояние не должно скрывать ошибку в закрытой группе;
- в заголовке закрытой группы должен быть индикатор ошибки/изменения.

### 9. Required And Validation States

Required-состояние должно быть компактным:

- не использовать звёздочки, которые ломают label layout;
- оставить тонкий left inset или border marker у control;
- validation error не должен резко увеличивать высоту всей формы;
- для ошибок можно использовать compact inline message под control только при
  focus/submit, либо общий статус в caption;
- поле с ошибкой должно быть видно и доступно с клавиатуры.

### 10. Цвет, Границы И Иерархия

Форма должна выглядеть как рабочая панель, а не как набор карточек:

- секционные рамки оставить тонкими и спокойными;
- заголовки секций делать низкими, без декоративной крупности;
- required marker должен быть заметен, но не доминировать;
- disabled/readonly значения должны читаться, но быть визуально слабее;
- не добавлять крупные фоны, тени, градиенты или декоративные разделители;
- визуальная плотность должна сохранять сканируемость строк.

### 11. Responsive Rules

На desktop форма оптимизируется под таблицу. На узких экранах:

- секции могут становиться вертикальными;
- высота может увеличиваться, но overlap всё равно запрещён;
- labels и controls не должны вылезать за контейнер;
- заголовок секции не должен обрезаться до бессмысленного текста;
- icon-only actions и tooltips должны оставаться доступными.

Не использовать viewport-based font-size.

### 12. Implementation Plan

1. Измерить текущую высоту inline-form через Playwright.
2. Составить inventory полей по секциям и типам объекта.
3. Ввести compact tokens для inline-form.
4. Переделать `HelpedControl`: help icon как отдельный слот, не overlay.
5. Переделать `FieldLabel`: убрать произвольное деление слов, ввести compact
   label map или явные short labels.
6. Пересобрать `.form-grid-srs` и `.form-col-srs`, убрать лишнее растягивание.
7. Перегруппировать поля внутри секций по semantic pairs.
8. Проверить pipe/tank, outdoor/indoor/underground, 1/2/3 слоя.
9. Прогнать typecheck, tests, Playwright seed screenshot.
10. Сравнить до/после: высота формы, видимые строки таблицы, отсутствие overlap.

### 13. Acceptance Criteria

Изменение считается успешным, если:

- при открытой форме таблица ниже видна лучше, чем до изменения;
- форма резервуара `outdoor` стала ниже без потери обязательных полей;
- labels не разрывают слова и не выглядят случайно;
- help icons не перекрывают значения, unit addon и select arrow;
- секции без большого числа полей не содержат крупного пустого низа;
- `Электропараметры и арматура` не ломает поля из-за узкой ширины;
- input/select values читаются и не обрезаются по вертикали;
- нет regressions в сохранении объекта;
- tests проходят;
- Playwright screenshot визуально подтверждает плотность и отсутствие overlap.

### 14. Что Не Делать

- Не уменьшать всё до микрошрифта ради высоты.
- Не увеличивать input font-size в inline-form, если проблема в сетке.
- Не перекрывать help icon поверх value/addon.
- Не использовать `overflow-wrap: anywhere` как универсальное решение labels.
- Не делать одну секцию широкой, оставляя другую в состоянии overlap.
- Не менять backend-модели, API и принцип хранения объекта.
- Не добавлять декоративные cards внутри формы.
- Не прятать расчётно-критичные поля без явного состояния и индикации ошибок.

## Verification Commands

```bash
cd frontend
npm run typecheck -- --pretty false
ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint src/components/wizard/ObjectWizard.tsx src/components/wizard/HelpedControl.tsx src/components/wizard/FieldLabel.tsx src/components/wizard/steps/PipeGeometryStep.tsx src/components/wizard/steps/TankGeometryStep.tsx src/components/wizard/steps/ThermalStep.tsx src/pages/HeatCalcPage.tsx src/__tests__/integration/components/ObjectWizardDependencies.test.tsx src/__tests__/unit/pages/HeatCalcPage.test.tsx --ext .ts,.tsx
npm test -- --run src/__tests__/integration/components/ObjectWizardDependencies.test.tsx src/__tests__/unit/pages/HeatCalcPage.test.tsx
GUEST_SESSION_ID=16ARAghUNdSNmxdT7ksh6vMjfTkbIhLkfvIFZHiIwsQ PROJECT_ID=a9732f0e-a9bb-452f-961e-e2828a979fd1 npm run seed:guest:playwright -- --clear --screenshot=/private/tmp/tlt-seeded-guest-script.png
```
