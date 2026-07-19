# Активные пробелы и блокеры TLT

**Дата сверки:** 2026-07-19

Это короткий навигационный список, а не самостоятельный источник требований и
не декларация полной готовности. Приоритет источников описан в
`codex-docs/source-documents.md`.

## Текущее направление

- Динамические именованные ЭР используют постоянные UUID и поддерживают до пяти
  решений на проект. Числовой `variant_number` остаётся compatibility detail на
  время миграционного окна, а не публичным идентификатором ЭР.
- Фазы 1–3 динамических ЭР имеют сохранённое evidence. Phase 4 заблокирована до
  официального числового источника PDL-ER-15/18/28. Phase 5 находится в активной
  реализации и не считается завершённой без полного backend/frontend/DB/e2e
  evidence.
- Подробный статус: `docs/architecture/dynamic-electrical-variants.md` и
  `docs/tnp/cases/guest-specification/README.md`.

## Активные P0/P1 gaps

| Приоритет | Область | Требуемый результат |
|---|---|---|
| P0 | Heating sections | Получить официальный каталог/«Таблицу Виктора» с `Lmax`, токами и правилами округления; до этого fail closed |
| P0 | Dynamic-ER Phase 5 | Доказать UUID-isolation для calculation/specification/report/project I/O, пятого ЭР и multi-ЭР операций |
| P0 | Release evidence | Закрыть dependency/security, Alembic metadata и полный frontend gate, перечисленные в dynamic-ER checkpoints |
| P1 | Guest persistence | Реализовать и доказать PDL-ER-26: PostgreSQL TTL 3 дня, session isolation и cleanup; старый 20-минутный runtime — gap |
| P1 | Масштаб | Доказать 500 объектов × 5 ЭР и PDF-порог 30 секунд до повышения runtime guard 50 |
| P1 | Кабели `mineral` / `skin` | Получить методики расчёта и ограничения; до этого типы остаются unsupported |
| P1 | `pump` / `platform` / `other` | Получить формулы, поля формы, импорт, спецификацию, отчёт и тестовые примеры |
| P1 | Безопасность раздела 5 ТЗ | Зафиксировать выбранный вариант защиты формул/справочников и acceptance evidence |
| P1 | Error catalog | Свести стабильные API/domain error codes в единый пользовательский справочник |

## Где проверять фактический статус

| Область | Источник |
|---|---|
| Целевой контракт | `ТЗ/`, `docs/tnp/`, подтверждённые product decisions |
| Текущая бизнес-логика | `docs/business-logic-contract.md` |
| API и БД | `docs/api.md`, `docs/db_schema.md` |
| Реализация dynamic ER | `docs/architecture/dynamic-electrical-variants.md` |
| Общая готовность | `codex-docs/requirements-map.md`, `docs/tz-compliance.md` |
| Открытые решения | `docs/analysis/open-business-decisions.md` |
| QA coverage | `docs/qa/README.md`, `docs/qa/automation-coverage.md` |

## Минимальная проверка документационного изменения

```bash
scripts/sync-docs.py --check
scripts/codex-functional-audit.sh docs
scripts/codex-functional-audit.sh contracts
```
