# Как сделать рефакторинг эффективным

> Архивный объяснительный материал. Нормативные правила находятся в
> `docs/frontend/agent-development-standard.md`.

**Актуально на:** 2026-07-23

## Идея

Не больше библиотек «на будущее», а **фабрика**:

```text
Gates (tests/boundaries)
  + Process (budget PR)
  + UI kit strangler
  + Thin shells + pure models
  + Metrics
```

## 1. Контракт «остров»

| Правило | Смысл |
|---|---|
| Один owner на файл | heat / electrical / spec / ui / shared |
| Shell ≤ 500 LOC | иначе extract перед merge |
| components ↛ pages | pure models наружу |
| heat ↛ electrical | architecture test |
| Новый CSS только island/domain | freeze styles.css |

## 2. Budget-based refactor

```text
max 1 shell + 1–2 extracts + 2 tests
characterization first
no Heat+Elec in one PR
no “заодно styles.css”
```

## 3. Characterization-first

1. Snapshot поведения (unit / RTL / e2e path)  
2. Extract  
3. Same suite green  

## 4. Два proof-слоя UI

| Слой | Что |
|---|---|
| Token parity e2e | kit ↔ heat computed styles |
| Interaction e2e | guest heat save, elec smoke, spec open |

## 5. Public barrels

```text
pages/electrical/public.ts
pages/heatcalc/public.ts
ui-kit/index.ts
```

Снаружи только barrel; eslint restricted deep imports.

## 6. Strangler UI kit (не rewrite формы)

```text
1. Новый Form.Item → CompactField
2. Geometry Heat → kit
3. Climate / insulation params → kit
4. Elec params chrome → kit
5. Spec employee params → kit
```

Метрика: `% fields on CompactField`.

## 7. State inventory god-pages

Таблица: state | where | server/ui/draft | who writes.  
Refactor shell = перенос ownership, не «вынести JSX».

## 8. Commands / queries (лёгкий)

```text
shell → commands (save, batch) + queries (useObjects) + view models
```

## 9. CSS budget + freeze zones

| Зона | Политика |
|---|---|
| styles.css | freeze: delete/move |
| wizard islands | isolation test |
| insulation table | explicit request only |

## 10. Kill-list / do-not-touch

**Kill:** ElecCalc/Heat/Spec shells, styles.css growth, inverted imports.  
**Don't touch:** formula goldens, ER UUID protocol, insulation table, Glide rewrite for beauty.

## 11. Feature flags dual-run (для риска)

```text
flag → old path || new path → same API payload → remove old
```

## 12. Метрики weekly

| Метрика | Цель |
|---|---|
| Shell LOC top-3 | ↓ |
| styles.css LOC | ↓ |
| inverted imports | → 0 |
| % fields on ui-kit | ↑ |
| focused suite time | &lt; 2 min |

## 13. PR template (агенты и люди)

```text
Domain: heat | elec | spec | ui
Type: extract | migrate-kit | css-move | invert-fix
Budget: files N
Characterization: path
Proof: command
Out of scope: ...
```

## 14. ROI идей

| Идея | ROI |
|---|---|
| Architecture gates + freeze styles | ★★★★★ |
| Characterization + budget | ★★★★★ |
| UI kit strangler Heat form | ★★★★ |
| Thin Elec/Heat shells | ★★★★★ |
| Spec namespace | ★★★★ |
| Barrels + eslint | ★★★★ |
| Full features/ rewrite | ★ |
| Shared table Heat+Elec | ★ (опасно) |

## Пакет на 1–2 недели

1. Freeze styles.css  
2. CI: architecture + parity e2e  
3. PR template budget  
4. 1 strangler: Heat geometry → CompactField  
5. 1 shell slice Elec **или** Heat  
6. Script: top LOC + inverted count  

## Итог

Эффективный рефакторинг = gates + budget + strangler kit + thin shells + metrics.  
UI kit — foundation визуала, не серебряная пуля.
