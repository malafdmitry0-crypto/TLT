# CSS-стратегия TLT: ownership, strangler и контроль регрессий

**Актуально на:** 2026-07-23  
**Статус:** рабочий регламент для нового CSS и постепенного разбора legacy.

## Решение

Используем гибрид:

```text
Общее поведение и визуальные контракты → tokens / UI kit
Уникальный layout и chrome             → рядом с feature-компонентом
App shell                              → styles/layout.css
Legacy                                 → styles.css, только удаление и перенос
```

Новый feature CSS в `frontend/src/styles.css` запрещён. Миграция идёт
небольшими срезами с удалением исходных правил и проверкой поведения в том же PR.

## Цели

1. У каждого правила есть один понятный владелец.
2. Изменение одного поля или feature не требует правок глобального CSS.
3. UI kit задаёт единый контракт полей; feature задаёт только размещение.
4. Перенос CSS не меняет поведение, пока это не заявлено отдельной задачей.
5. Архитектура обеспечивается тестами и CI, а не только договорённостью.

## Четыре слоя

| Слой | Целевое место | Отвечает за | Не отвечает за |
|---|---|---|---|
| Tokens | `styles/tokens.css` | семантические цвета, размеры, density и layout tokens | селекторы компонентов |
| Design system | `components/ui-kit/*.css` | `.tlt-*`, CompactField, primitives и состояния контролов | layout конкретного экрана |
| Feature / island | `Foo.css` рядом с `Foo.tsx` | toolbar, page chrome, таблица, modal и feature-layout | чужие feature и app shell |
| Legacy | `styles.css` | временно оставшийся глобальный код | новые правила |

Допустимое направление зависимостей:

```text
tokens ← ui-kit ← feature
tokens ← layout

feature не импортирует legacy
ui-kit не знает о heat / electrical / specification
feature A не стилизует feature B
```

## Куда помещать новое правило

1. Значение повторяется в нескольких независимых компонентах?  
   Добавить семантический token, но не селектор.
2. Это визуальное поведение переиспользуемого Tlt-компонента?  
   Добавить в UI kit.
3. Это app header/sidebar/page frame?  
   Добавить в `styles/layout.css`.
4. Всё остальное?  
   Добавить рядом с компонентом под его root namespace.

Формат feature:

```text
Foo.tsx
Foo.css

Foo.tsx → import './Foo.css'
root    → className="feature-foo"
CSS     → .feature-foo ... / .feature-foo__part / .feature-foo--state
```

Plain CSS с root namespace/BEM — основной подход. CSS Modules допустимы для
полностью принадлежащих приложению компонентов, если они реально уменьшают риск.
Массовое внедрение Modules, Tailwind или CSS-in-JS не является целью.

## Cascade и импорты

Глобальные файлы подключаются один раз в `main.tsx` в явном порядке:

```ts
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles.css'; // legacy, временно
```

Feature CSS импортирует компонент-владелец. Новый feature CSS не должен
побеждать legacy только за счёт порядка импорта:

- исходное legacy-правило удаляется в том же PR;
- каждый feature-селектор содержит root class;
- намеренные cross-file overrides запрещены;
- рост специфичности для обхода legacy не считается миграцией.

Cascade Layers пока не вводим: сначала уменьшаем legacy и проверяем взаимодействие
с Ant CSS-in-JS на отдельном прототипе.

## Tokens и Ant Design

Разделяем ответственность:

| Контракт | Источник |
|---|---|
| CSS semantic tokens (`--tlt-*`, `--layout-*`) | `styles/tokens.css` |
| Ant component/theme tokens | `appTheme.ts`, передаваемый в `ConfigProvider` |
| Значения, которые должны совпадать | parity-тест |

Одинаковый literal в `tokens.css`, `main.tsx` и feature CSS недопустим. До
выноса `appTheme.ts` текущий `ConfigProvider` считается legacy-точкой.

Токен получает имя по назначению, а не по значению:

```css
/* хорошо */
--tlt-field-control-height: 26px;
--layout-toolbar-border: #d9e1e6;

/* плохо */
--height-26: 26px;
--gray-217: #d9d9d9;
```

CSS custom properties не используются как значения media query. Новые числовые
breakpoints разрешены только из принятого allowlist; добавление нового значения
требует отдельного обоснования.

## Ant Design overrides

Порядок выбора решения:

1. `ConfigProvider` theme/component token.
2. Собственный Tlt-компонент.
3. Scoped override под стабильным feature root.

```css
/* допустимо */
.heat-object-fields--wide .ant-form-item {
  margin-block-end: 0;
}

/* запрещено в новом коде */
.ant-form-item {
  margin-block-end: 0;
}
```

Новый `!important` запрещён по умолчанию. Исключение возможно только для
неустранимого third-party/inline-style конфликта, с комментарием причины и тестом.
Общее количество `!important` в PR не должно расти.

## Freeze `styles.css`

Допустимо:

- удалить правило;
- переместить правило владельцу и удалить оригинал;
- исправить критическую регрессию с отдельным proof;
- временно исправить base/shell только с явно указанным последующим переносом.

Недопустимо:

- новое feature-правило;
- новый bare `.ant-*`;
- новая копия существующего селектора;
- «компенсирующий» override вместо удаления конфликтующего legacy;
- формально удержать LOC за счёт удаления комментариев.

`net LOC ≤ 0` остаётся budget-ограничением, но не считается достаточным gate.

## Автоматические gates

В Phase 0 добавляется `css:architecture`, который хранит baseline и проверяет:

1. `styles.css` не растёт по LOC, rules и declarations.
2. Количество `!important` не растёт.
3. В новом CSS нет bare `.ant-*`.
4. Все селекторы island-файла находятся под root class.
5. Нет точного overlap селекторов между `styles.css` и вынесенным island.
6. Нет CSS imports между независимыми feature/islands.
7. CSS-файл импортируется своим компонентом и не является orphan.
8. Новые цвета и размеры контролов используют tokens.
9. Число уникальных breakpoint-значений не растёт.

За основу берётся существующий wizard isolation architecture test. Проверки
расширяются через registry владельцев, а не набор несвязанных regex-скриптов.

CI gate:

```text
test:architecture
css:architecture
focused unit/integration
focused e2e по proof matrix
```

## Протокол одного extraction

Один PR переносит один визуальный контракт одного домена.

### До изменения

1. Назначить owner и root class.
2. Найти все селекторы, JSX class names, динамические модификаторы и media/print rules.
3. Зафиксировать characterization: screenshot, geometry assertion или computed style.
4. Записать состояния, которые реально затрагивает перенос.

### Изменение

1. Создать или использовать `Foo.css`.
2. Scope каждого правила под root.
3. Перенести правила без визуального redesign.
4. Подключить CSS только в компоненте-владельце.
5. Удалить legacy-правила в том же PR.

### После изменения

1. Exact selector overlap с legacy равен нулю.
2. `!important`, bare Ant selectors и breakpoint count не выросли.
3. Focused tests и выбранные UI-состояния прошли.
4. Console errors, overflow и print behavior не ухудшились.
5. PR содержит список удалённых legacy-блоков и явный `Out of scope`.

Если удалить legacy в том же PR нельзя, перенос делится на меньший срез.
Длительное сосуществование двух источников истины запрещено.

## Proof matrix

Проверяется только релевантная часть матрицы, но автор PR обязан явно отметить
непроверенные состояния.

| Изменение | Минимальный proof |
|---|---|
| Token/UI kit | unit + `/ui-kit` + computed-style parity |
| Heat form/layout | 1280 и 1440; top + используемое side placement; empty + populated; validation |
| Table/Glide chrome | populated rows; horizontal/vertical scroll; selection; error row |
| Modal/settings | open/close; long content; keyboard focus; 1280 |
| Specification | populated + stale; screen + print |
| Electrical | focused unit/integration + основной e2e сценарий |
| App shell | 1280, 1440, 1920; navigation; overflow |
| Responsive component | 390 и 768 дополнительно |

HeatCalc ниже официальной минимальной ширины не является release blocker, если
задача не про responsive. UI kit и явно responsive-компоненты всё равно проверяются
на 390/768. Reduced motion, focus-visible и print проверяются при затрагивании
соответствующего поведения.

## Порядок миграции по ROI

0. Baseline + CI gates + `tokens.css`; без визуальных изменений.
1. Точные legacy/island дубли и form-density overlaps. Текущая миграция формы
   считается частичной, пока остаются `.inline-object-form` overrides и рост
   специфичности.
2. Heat toolbar и table chrome.
3. Specification layout вместе с print-контрактом.
4. Electrical chrome небольшими независимыми срезами.
5. Projects/admin.
6. Header/sidebar → `layout.css`.

Insulation table не меняется «заодно»: для неё нужен отдельный PR, owner,
characterization и полный isolation proof.

## Метрики

LOC измеряет прогресс удаления legacy, но не качество сам по себе.

| Метрика | На каждый PR | 6–8 недель | 4–6 месяцев |
|---|---:|---:|---:|
| `styles.css` LOC | не растёт | `< 5000` | `< 2500` |
| Feature selectors в `styles.css` | не растут | заметно уменьшаются | `0` |
| Exact legacy/island overlaps | `0` для затронутого island | `0` вынесенных блоков | `0` |
| `!important` | не растёт | `-20%` от baseline | только documented exceptions |
| Bare `.ant-*` | не растут | уменьшаются | только approved base rules |
| Уникальные HEX вне tokens/theme | не растут | уменьшаются | documented exceptions |
| Уникальные breakpoints | не растут | allowlist | allowlist |
| UI Kit form coverage | растёт при миграции форм | Heat | Heat + выбранные panels |

Количество CSS-файлов не является KPI. Цель — один владелец и отсутствие дублей,
а не максимальное дробление.

Baseline снимается автоматически и хранится рядом с architecture gate; числа в
документации не используются как источник истины.

## План первых двух недель

### Неделя 1 — сделать правила исполнимыми

- добавить `tokens.css`, `base.css`, `layout.css` и явный порядок импортов;
- вынести Ant theme из `main.tsx` в `appTheme.ts`;
- добавить baseline и `css:architecture`;
- подключить gate к `test:architecture`;
- удалить один набор точных legacy/island дублей с focused proof.

### Неделя 2 — доказать процесс

- вынести один Heat chrome-блок;
- вынести Specification CSS вместе с print characterization;
- измерить время одного extraction и скорректировать PR budget;
- обновить baseline только после подтверждённого уменьшения legacy.

Не выполнять больше двух production extractions одного домена в одном PR.

## Definition of Done миграции CSS

- `styles.css` содержит только reset/base/shell, которые ещё не вынесены;
- feature-селекторов в нём нет;
- tokens и Ant theme имеют явных владельцев и parity;
- каждый feature CSS scoped и импортируется owner-компонентом;
- legacy/island overlaps равны нулю;
- `!important` остались только как документированные исключения;
- breakpoint и color allowlists соблюдаются;
- architecture gates и focused UI proof обязательны в CI.

## Не делать

- rewrite `styles.css` одним большим PR;
- визуальный redesign одновременно с extraction;
- Tailwind/CSS Modules migration всего приложения;
- универсальный layout kit без подтверждённого повторения;
- удаление `.inline-object-form` или insulation CSS без characterization;
- перенос, после которого старый и новый селектор остаются активными;
- объявлять успех только по уменьшению LOC.
