# Desktop viewport policy TLT

**Актуально на:** 2026-07-23

**Статус:** тематический регламент для desktop UI proof.

> Общий workflow, hard stops и Definition of Done:
> [agent-development-standard.md](./agent-development-standard.md). CSS
> breakpoints и ownership:
> [css-strategy.md](./css-strategy.md).

## Три разных понятия

| Понятие | Что измеряет | Как используется |
|---|---|---|
| Разрешение монитора | Физические пиксели панели | Справочный профиль устройства |
| Browser viewport | Доступную странице область в CSS pixels | Browser proof и Playwright |
| CSS breakpoint | Точку изменения layout в media query | Responsive CSS policy |

Эти значения нельзя подменять друг другом. Масштабирование ОС, browser chrome,
zoom и device pixel ratio могут сделать CSS viewport заметно уже физического
разрешения. В Playwright всегда задаётся точный viewport в CSS pixels.

Справка: [MDN — Viewport concepts][mdn-viewport]. Актуальная распространённость
desktop-профилей сверяется по [StatCounter][statcounter], но market share не
меняет обязательный продуктовый контракт TLT автоматически.

## Основные desktop-профили

| Профиль | Размер | Ширина | Тип |
|---|---:|---:|---|
| XGA | `1024×768` | `1024 px` | Компактный монитор |
| HD | `1280×720` | `1280 px` | Физическое разрешение 16:9 |
| WXGA | `1280×800` | `1280 px` | Физическое разрешение 16:10 |
| WXGA Laptop | `1366×768` | `1366 px` | Типовой ноутбук |
| WXGA+ | `1440×900` | `1440 px` | Основной QA-профиль TLT |
| Scaled FHD | `1536×864` | `1536 px` | Типичный logical viewport |
| HD+ | `1600×900` | `1600 px` | Промежуточный desktop |
| Full HD | `1920×1080` | `1920 px` | Wide desktop |
| QHD | `2560×1440` | `2560 px` | Extended wide smoke |
| 4K UHD | `3840×2160` | `3840 px` | Release smoke |

`1000 px` — нижняя граница browser viewport TLT, а не название физического
разрешения монитора.

## Контракт ширины TLT

| CSS viewport | Уровень поддержки | Обязательное поведение |
|---:|---|---|
| `<1000 px` | Вне общего desktop-контракта | Проверяется только в responsive/mobile slice |
| `1000–1279 px` | Functional desktop | Навигация и ключевые действия доступны; предупреждение, constrained mode и локальный horizontal scroll допустимы |
| `≥1280 px` | Full workspace | Плотные Heat/Electrical/Specification workflows работают в полном desktop layout |
| `1440 px` | Primary QA | Основной visual, geometry и interaction proof |
| `≥1920 px` | Wide desktop | Контент не растягивается бесконтрольно; таблицы и shell используют ширину осмысленно |

### Functional desktop от 1000 px

Для app shell, auth, help, projects, reports, admin и обычных страниц:

- нет page-level horizontal overflow;
- header, navigation, dialogs и основные actions доступны;
- текст и controls не перекрываются и не обрезаются без предусмотренного
  overflow-контракта;
- keyboard focus не уходит за видимую область.

Для плотных инженерных экранов при `1000–1279 px` дополнительно допустимы:

- явное предупреждение о рекомендуемой ширине `1280 px`;
- collapsed/stacked placement;
- горизонтальный scroll внутри таблицы или другого выделенного data region.

Нельзя скрывать либо делать недоступными save/close/navigation, primary action,
validation summary и сообщения об ошибках. Горизонтальный scroll всей страницы
не считается constrained mode.

### Full workspace от 1280 px

При `1280 px` инженерный экран не должен требовать предупреждения только из-за
ширины. Рабочая область, основные формы, action bar и таблица остаются доступны;
локальный table scroll разрешён, если он является явным контрактом таблицы.

## Обязательная QA-матрица

| Viewport | Роль в proof | Когда запускать |
|---|---|---|
| `1000×768` | Нижняя functional boundary | Shell, navigation, dialogs, overflow и затронутый engineering workspace |
| `1024×768` | Реальный compact profile | При изменении constrained layout или высотно-чувствительного UI |
| `1280×800` | Full-workspace boundary | Любое изменение плотного Heat/Electrical/Specification layout |
| `1366×768` | Типовой laptop | Формы, action bars и сценарии, чувствительные к небольшой высоте |
| `1440×900` | Primary QA | Любое видимое desktop UI-изменение |
| `1536×864` | Scaled compatibility | Shell, сложные grids и изменения responsive behavior |
| `1920×1080` | Wide desktop | App shell, max-width, таблицы и распределение свободного пространства |
| `2560×1440` | QHD smoke | Release или изменение wide-layout контракта |
| `3840×2160` | 4K smoke | Release или изменение max-width/centering |

`1600×900` остаётся справочным профилем: отдельный обязательный запуск не нужен,
если зелёные `1536×864` и `1920×1080`.

### Как выбрать viewports для одного slice

- Любой видимый desktop slice: `1440×900` плюс один релевантный крайний профиль.
- App shell, navigation, modal или overflow: `1000×768`, `1440×900`,
  `1920×1080`.
- Плотный engineering layout: `1000×768` constrained, `1280×800` full,
  `1440×900` primary.
- Высотно-чувствительная форма/action bar: добавить `1366×768`.
- Wide-layout или max-width: добавить `1920×1080`; QHD/4K только для release или
  явно затронутого wide-контракта.
- Responsive/mobile slice: desktop matrix дополняется `390×844` и `768×1024`,
  но не заменяется ими.

Высота `1000 px` допустима для дополнительного proof длинной формы, однако не
заменяет primary profile `1440×900`.

## Viewports не являются breakpoints

QA-профили проверяют поведение внутри диапазонов. Они не разрешают добавлять
одноимённый media query. Действующая CSS policy остаётся:

```text
480 / 768 / 1200 / 1400
print
prefers-reduced-motion
```

Новый breakpoint требует отдельного CSS architecture decision независимо от
этого документа.

## Definition of Done

- В отчёте указаны точные `width×height`, а не только «desktop» или «wide».
- `1000 px` проверяет functional desktop, `1280 px` — full workspace,
  `1440 px` — primary QA.
- Для `1000–1279 px` отдельно зафиксировано допустимое constrained behavior.
- Page-level overflow, clipping, focus, console и failed network requests
  проверены на выбранных профилях.
- Непроверенные required profiles явно перечислены; обязательный отсутствующий
  proof означает `blocked`.

[mdn-viewport]: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/CSSOM_view/Viewport_concepts
[statcounter]: https://gs.statcounter.com/screen-resolution-stats/desktop/
