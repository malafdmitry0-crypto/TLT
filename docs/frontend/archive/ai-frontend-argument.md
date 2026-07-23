# ИИ и фронтенд: как отвечать на «ИИ не умеет писать фронт»

> Архив: объяснительный материал, не норматив и не активная очередь.

**Актуально на:** 2026-07-23

## Ключевая формула

```text
ИИ + хаос = плохой фронт
ИИ + kit + tokens + e2e + budget = предсказуемый конвейер
```

Тезис оппонента часто верен **для vibe-coding без системы**.  
Он не верен для режима: **контракт → slice → proof**.

## Сначала согласиться

ИИ слабо, если:

- «сделай красивый UI» без design system;
- нет эталона (экран / токены / Figma);
- нет e2e/RTL;
- god-page 2000 LOC без budget;
- spacing «на вкус».

Это не «не умеет React», а **плохо импровизирует UI**.

## Переформулировки

| Говорят | Ответ |
|---|---|
| ИИ не умеет фронт | Не умеет *без design system и proof* |
| Только сеньор напишет UI | Сеньор задаёт kit/DoD; ИИ делает volume |
| Будут layout-баги | Ловим parity e2e + form e2e |
| Сгенерит кашу | Budget + freeze CSS + import only ui-kit |

## Доказательства из TLT

| Артефакт | Зачем |
|---|---|
| `components/ui-kit/` | библиотека, не с нуля каждый раз |
| `/ui-kit` + unit/integration | витрина + регрессия API |
| e2e `ui-kit-heatcalc-parity` | computed styles kit = Heat (26px, 9px unit, 98px…) |
| wizard islands + architecture tests | границы ловятся CI |
| safe-split budget | нет monorepo «рефакторинга» |
| vitest + playwright suite | не «сгенерил и забыл» |

**Фраза:**  
«Мы не просим ИИ *придумывать* UI. Мы просим *повторять kit и проходить parity e2e*.»

## Роли

```text
Человек: kit, hard rules (units, ER), DoD, review
ИИ: strangler slice, extract models, tests, CSS move under freeze
CI: red = no merge
```

## Пилот на 2 недели (закрывает спор)

| Критерий | Измеримо |
|---|---|
| 1–2 секции Heat на `@/components/ui-kit` | code |
| ui-kit-heatcalc-parity green | CI/e2e |
| styles.css net ≤ 0 | diff |
| API/units без изменений | tests |
| Review ≤ ~400 LOC | process |

Если пилот failed — позиция скептика сильнее.  
Если passed — масштабируем strangler.

## Честные ограничения

- ИИ ≠ UX research / product decisions  
- ElecCalc ER/batch — только с characterization  
- Visual polish без эталона — слабо  
- Без review накопит debt  

## Текст на встречу

> Согласен: без дизайн-системы и тестов ИИ пишет плохой фронт.  
> У нас другой setup: ui-kit, токены SC-03, e2e parity kit↔Heat, architecture gates, budget на slice.  
> ИИ не «рисует красиво», а мигрирует на kit и не ломает proof.  
> God-pages режем отдельно (safe-split).  
> Предлагаю 2-недельный пилот с измеримым DoD.

## Одной фразой

**ИИ плохо пишет фронт без системы. С UI kit, токенами, parity e2e и budget — пишет предсказуемо. Спор решаем пилотом, не верой.**
