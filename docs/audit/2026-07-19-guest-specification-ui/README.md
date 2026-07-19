# Functional Accuracy Report

**Scope:** UI и end-to-end flow неавторизованного пользователя: старт →
теплопотери → ЭР → спецификация → отчёт/печать, включая формулы, BOM,
persistence, stale/partial и тестовые gates.

**Current baseline:** `38f6bb3e44393e46a8b8a2ba88dfd622dccba33c`,
19.07.2026 18:15 +03. Исходный отчёт и папка `evidence/browser/` были созданы
раньше этого коммита и теперь помечены как historical pre-fix evidence.

**Current result:** `FAIL` для приёмки полного закупочного комплекта.
Интерфейс уже честно показывает неполный результат, но полный BOM остаётся
недоступен из-за отсутствующих утверждённых данных секционирования и Ex/Rгр,
а также незакрытых grouping/latent formula/traceability/quality-gate рисков.

## Что исправлено после исходного аудита

- partial status, excluded groups и skipped count сохраняются, возвращаются GET,
  видны в UI после reload и в HTML-report;
- section-dependent позиции fail-closed с `SECTION_DATA_SOURCE_MISSING`;
- commercial final order length имеет правильный приоритет;
- stale specification read-only на backend и в UI;
- preflight видит builder exclusions и требует confirmation;
- guest видит `Печать`, click вызывает `window.print()`, добавлен print CSS;
- Home сообщает 3 дня, а не 20 минут;
- исправлены прежние glue-repair и glass-tape double-reserve paths.

Это доказано текущим live flow `409 → confirmation → 201`, API body, DB row,
reload, report и screenshots. Подробно: [реестр повторной проверки](00-revalidation-ledger.md).

## Что остаётся критичным

1. **Полный BOM внешне заблокирован.** Нет официального числового каталога
   секционирования и per-row Ex/Rгр matrix. Текущий fail-closed правильный, но
   закупочный комплект по определению неполон.
2. **Preflight UI сообщает неверное количество.** При двух исключённых группах
   и нуле пропущенных объектов modal пишет `Всего исключений: 0` и не показывает
   group codes.
3. **Typed grouping не реализован.** Generated rows получают `common`, поэтому
   `Трубопроводы / Ёмкости / Общие` невозможно восстановить presentation-toggle.
4. **После разблокировки источников остаются latent formula defects.** Connector
   choice/count и box row algorithm не соответствуют PDF-oracles; decimal
   `package_factor` создаёт boundary errors для glue и glass tape.
5. **PDF supplier field отсутствует.** Literal PDF стр. 60 требует показывать
   поставщика, если он задан; schema/table такого поля не имеют.
6. **Traceability и release gates неполны.** Нет полного formula/data/input trail;
   lint/typecheck/build/formula quick и report-unit subset красные.

## Исправление ошибки про секции

В ранней версии отчёта было написано, что PDF стр. 49 прямо требует дерево
`объект → группы → секции`. Это неверная атрибуция.

- PDF стр. 47–48 задаёт расчёт и одинаковые параметры секций.
- PDF стр. 49 задаёт агрегированную строку объекта, показатели и статус.
- Обязательный узел `группа` и конкретный tree-view в PDF не определены.
- Иерархия встречалась только во внутренних analysis/prompt документах.

Поэтому эта претензия **отозвана**. Реальный контракт сейчас другой: нельзя
формировать секционно-зависимый закупочный результат без утверждённых данных;
UI должен показывать отсутствие секций/исключённые группы. Точный способ
представления — таблица, disclosure или дерево — отдельное продуктовое решение.

## Live proof на текущем HEAD

- [Home, desktop](evidence/current-head/home-desktop-1440x1000.png)
- [Heat result, desktop](evidence/current-head/heat-populated-desktop-1440x1000.png)
- [Electrical result, desktop](evidence/current-head/electrical-calculated-desktop-1440x1000.png)
- [Preflight 409 body](evidence/current-head/specification-preflight-409-response.json)
- [Preflight modal: false zero](evidence/current-head/specification-preflight-modal-zero-desktop-1440x1000.png)
- [Generation 201 body](evidence/current-head/specification-generate-201-response.json)
- [Partial specification, desktop](evidence/current-head/specification-partial-desktop-1440x1000.png)
- [Partial status after reload](evidence/current-head/specification-partial-after-reload-snapshot.md)
- [Partial report, desktop](evidence/current-head/report-partial-desktop-1440x1000.png)
- [Print click proof](evidence/current-head/report-print-handler-proof.json)
- [Specification/report narrow evidence](evidence/current-head/)

## Состав папки

- [00-revalidation-ledger.md](00-revalidation-ledger.md) — статус каждой старой
  записи, retractions и новые findings;
- [01-source-of-truth.md](01-source-of-truth.md) — строгая иерархия источников и
  буквальная проверка PDF;
- [02-ui-screen-audit.md](02-ui-screen-audit.md) — текущий поэкранный UI;
- [03-calculations-and-bom.md](03-calculations-and-bom.md) — цепочка
  `документация → backend → frontend → тест → результат`;
- [04-findings-and-priorities.md](04-findings-and-priorities.md) — текущий
  backlog без закрытых дефектов, выданных за активные;
- [05-verification.md](05-verification.md) — environment, commands и evidence;
- [06-target-ui.md](06-target-ui.md) — только рекомендации, явно отделённые от
  прямых требований.

## Итог по цепочке

```text
APPROVED_PDL / PRIMARY_PDF
  → current backend
  → current frontend
  → focused tests + live Playwright + DB reload
  → честный partial result: PASS
  → полный закупочный BOM: FAIL / external sources BLOCKED
```

Код приложения в рамках этой `/audit-only` задачи не изменялся. Изменены только
Markdown-отчёт и evidence текущей проверки.
