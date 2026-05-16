# Источники Документации

## Основные

| Документ | Использовать когда |
|---|---|
| `README.md` | Быстрый запуск, стек, тестовые команды |
| `CLAUDE.MD` | Общая архитектура, роли, пользовательский поток, текущие границы реализации |
| `backend/CLAUDE.MD` | Карта backend-модулей, моделей и API |
| `frontend/CLAUDE.MD` | Карта frontend-модулей и UI-правил |
| `TO_DO.md` | Короткий рабочий список актуальных пробелов |
| `docs/analysis/current-status-and-missing-info.md` | Подробная сверка текущей реализации, SRS и недостающей информации |

## Требования и аналитика

| Документ | Использовать когда |
|---|---|
| `docs/srs.md` | Верхнеуровневые требования |
| `docs/srs/` | Детальная SRS-разбивка |
| `docs/tz-compliance.md` | Проверка соответствия ТЗ |
| `docs/analysis/business-rules.md` | Бизнес-правила |
| `docs/analysis/user-stories.md` | Пользовательские истории |
| `docs/analysis/story-map.md` | Карта сценариев |

## Технические контракты

| Документ | Использовать когда |
|---|---|
| `docs/api.md` | Endpoint-контракты |
| `docs/db_schema.md` | Таблицы, связи, миграции |
| `docs/business-logic-contract.md` | Главный контракт текущих формул, алгоритмов и справочников |
| `docs/context/formulas-summary.md` | Краткое описание формул; использовать после business contract |
| `docs/tnp/README.md` | Markdown-конвертация исходных ТНП/алгоритмов/внутренних справочников |
| `docs/tnp/correctness-review.md` | Сверка ТНП-формул и алгоритмов с инженерными правилами и backend |
| `qa-agent/examples/tlt-formulas.registry.yaml` | Machine-readable registry для deterministic QA-agent |
| `formules.md` | Подробные формулы и объяснения; не выше business contract при расхождениях |
| `coefficients.MD` | Корректирующие коэффициенты; не выше business contract при расхождениях |
| `docs/samples/README.md` | Форматы импорта |

## QA и эксплуатация

| Документ | Использовать когда |
|---|---|
| `docs/qa/README.md` | Навигация по тест-кейсам |
| `docs/qa/checklist.md` | Ручная приёмка |
| `docs/qa/automation-coverage.md` | Покрытие автотестами |
| `docs/qa/business-logic-coverage.md` | Матрица покрытия формул, алгоритмов и справочников |
| `docs/deployment.md` | Развёртывание |
| `docs/playbooks/` | Повторяемые процедуры |

## Что считать устаревшим осторожно

- `demo-doc/` выглядит как копия/срез документации для демо; для разработки
  сначала использовать `docs/`.
- Старые `docs/analysis/*status*.md` полезны как история, но конкретный статус
  реализации проверять через код, тесты, `TO_DO.md` и
  `docs/analysis/current-status-and-missing-info.md`.
