# Бэклог и риски

**Обновлено:** 2026-07-19

Этот файл — навигационный индекс, а не параллельный backlog. Актуальные gaps и
приоритеты ведутся в `TO_DO.md`.

| Область | Канонический документ |
|---|---|
| Активные implementation gaps | `TO_DO.md` |
| Незакрытые продуктовые решения | `docs/analysis/open-business-decisions.md` |
| Динамические именованные ЭР и фазность cutover | `docs/architecture/dynamic-electrical-variants.md` |
| Performance target 500 × 5 ЭР и rollout guard 50 | `docs/architecture/performance-and-scaling.md` |
| Неутверждённые идеи будущего продукта | `docs/analysis/product-proposal-ledger.md` |
| Контракты формул и traceability | `docs/business-logic-contract.md`, `codex-docs/business-formula-contracts.json` |

## Сквозные риски

- Изменение ЭР затрагивает DB, API, frontend, candidates, specification,
  report, import/export и audit; integer compatibility не является новым
  источником истины.
- Новая формула или коэффициент требуют утверждённого источника, независимого
  oracle, boundary/metamorphic evidence и сохранения traceability.
- Импорт, batch и reorder требуют идемпотентности, stable keys, partial-success
  semantics и проверки повторного запуска.
- Повышение лимита объектов запрещено до полного PDL-ER-27 gate; отдельный
  быстрый unit/builder benchmark недостаточен.
- Изменения доступа проверяются backend/security тестом, а не только видимостью
  control в UI.
- UI/layout finding не закрывается без before/after screenshots и
  программной проверки clipping/overflow/overlap/readability.

При расхождении статуса сначала применяется иерархия из
`codex-docs/source-documents.md`, затем фиксируется цепочка
`документация -> backend -> frontend -> тесты -> результат`.
