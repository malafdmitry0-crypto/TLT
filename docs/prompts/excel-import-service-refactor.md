# Промпт: декомпозиция `excel_import_service.py`

**Статус:** исполняемый prompt, не очередь работ

**Актуально на:** 2026-08-21

**Зона:** backend / импорт объектов проекта из XLSX и CSV

## Цель

Разделить `backend/app/services/excel_import_service.py` на небольшие модули с
одним направлением зависимостей:

```text
parsing → mapping/normalization → domain validation → persistence
                         ↑                 ↑                ↑
                         └──────── importer/orchestration ─┘
```

Рефакторинг должен быть behavior-preserving: публичный API, форматы файлов,
сообщения об ошибках, режимы импорта и транзакционная семантика не меняются.

Этот prompt не создаёт новую ACTIVE-очередь и не разрешает соседний cleanup.

## Копируй в агента

```text
Работай из корня репозитория TLT.

GOAL
====

Декомпозируй backend/app/services/excel_import_service.py на небольшие
application-layer модули: parsing, mapping/normalization, validation,
persistence и orchestration. Сохрани старый модуль как compatibility facade.

Это структурный рефакторинг без изменения пользовательского поведения.

STARTUP CONTRACT
================

1. Полностью прочитай:
   - AGENTS.md;
   - backend/app/services/excel_import_service.py;
   - backend/app/services/project_object_params.py;
   - backend/app/services/spreadsheet_schema.py;
   - backend/app/services/spreadsheet_safety.py;
   - backend/app/api/v1/objects.py в части import/export;
   - все прямые callers и тесты, найденные через rg.

2. До изменений выполни `git status --short`.

3. В рабочем дереве может находиться чужой WIP в `calculation*`, `project_io*`,
   specification и docker-compose. Не изменяй, не форматируй, не перемещай,
   не добавляй в commit и не используй его как обязательную зависимость.

4. Если любой target-файл этого slice уже изменён и происхождение изменения
   неочевидно — STOP и сообщи точный путь и конфликт.

5. Найди через `rg`:
   - импорты публичных и приватных symbol из excel_import_service;
   - monkeypatch targets старого модуля;
   - тесты CSV, XLSX, mapping, validation, batch fallback и import modes.

ARCHITECTURE
============

Целевая структура:

  backend/app/services/
  ├── excel_import_service.py          # compatibility facade
  └── object_import/
      ├── __init__.py
      ├── contracts.py
      ├── csv_codec.py
      ├── xlsx_codec.py
      ├── mapping_common.py
      ├── pipe_mapping.py
      ├── tank_mapping.py
      ├── validation.py
      ├── persistence.py
      └── importer.py

Не обязательно создавать пустой или искусственный модуль только ради этой
схемы. Если две обязанности остаются маленькими и связными, допускается один
модуль. Запрещён обратный результат: новый монолит под другим именем.

Используй модули и обычные функции. Не создавай классы `ParserService`,
`NormalizerService`, `ValidatorService` без реальной необходимости в состоянии
или полиморфизме.

Направление зависимостей:

  contracts
      ↑
  csv_codec / xlsx_codec
      ↑
  mapping_common / pipe_mapping / tank_mapping
      ↑
  validation → app.services.project_object_params
      ↑
  importer → persistence + ProjectService
      ↑
  excel_import_service facade → API

Обязательные границы:

- codecs не импортируют SQLAlchemy, ORM models, ProjectService, domain
  validation или persistence;
- mapping не импортирует openpyxl, SQLAlchemy или ORM models;
- validation не парсит файлы и не обращается к БД;
- persistence не парсит файлы и не нормализует поля;
- только persistence импортирует SQL query builders и `app.models`;
- importer может использовать `AsyncSession` как тип и вызывать ProjectService,
  но не содержит field-by-field mapping, ORM models и прямых SQL statements;
- API не импортирует внутренние модули `object_import` напрямую;
- новые domain rules здесь не появляются.

DOMAIN OWNERSHIP
================

`app.services.project_object_params` остаётся единственным владельцем
канонической нормализации и бизнес-валидации ProjectObject params.

Новый import validation обязан переиспользовать текущую цепочку:

  reject_legacy_specification_object_params
  → normalize_project_object_params
  → validate_and_canonicalize_project_object_params

Не копируй диапазоны, обязательность полей или правила heat-loss contracts в
`object_import`. Import validation только:

- вызывает канонического владельца;
- связывает issue с source sheet/row;
- адаптирует issue к существующему API-формату;
- сохраняет текущие пользовательские сообщения.

`app.services.spreadsheet_schema` остаётся единственным владельцем заголовков
и схемы колонок. Не дублируй header maps в новых модулях.

INTERNAL CONTRACTS
==================

Замени неявные длинные tuple-контракты внутренними dataclass-моделями с
`slots=True`, где это улучшает границу. Минимально нужны эквиваленты:

- SourceRow: source row number + raw values;
- ParsedSheet: label + explicit object_type + rows;
- PreparedRow / PreparedRows;
- ImportIssue;
- PersistenceResult;
- ImportResult.

Не используй русское имя sheet для повторного определения object_type. CSV и
XLSX parsers должны передавать тип явно.

Внешний результат пока остаётся прежним dict с теми же ключами и типами.
`created_object_ids` остаётся внутренним каналом между service и API.

BEHAVIOR INVARIANTS
===================

Сохрани без изменений:

- публичные функции `import_objects_from_csv`, `import_objects_from_excel`,
  `build_objects_xlsx`, `build_template_xlsx`, `build_template_csv`;
- класс и identity `ExcelImportError` через стабильный re-export;
- сигнатуры публичных функций и формат ответа API;
- XLSX archive guards и лимиты файлов/листов/строк;
- blocking openpyxl parsing через `asyncio.to_thread`;
- кодировки CSV, BOM, delimiter detection и type aliases;
- номера строк источника и формат `errors` / `validation_errors`;
- все aliases, defaults, material resolution и преобразования мм ↔ м;
- climate provenance reconciliation через каноническую climate policy;
- append/merge/replace;
- dedupe по canonical params и нормализованному name;
- `IMPORT_COMMIT_BATCH_SIZE` и существующий batch fallback row-by-row;
- частичный успех импорта при ошибках отдельных строк/батчей;
- guest object limit, `sort_order`, skipped counters и invalid counters;
- replace применяется только при наличии хотя бы одной prepared valid row;
- удаление зависимых ElectricalCalculation и Specification при replace;
- обновление `Project.updated_at` в тех же случаях;
- создание heat-loss batch task остаётся в API и не переносится в importer;
- audit event остаётся в API.

Не исправляй попутно замеченные спорные поведения. В частности, различия в
порядке access-check и parsing между CSV/XLSX сначала зафиксируй тестами и
сохрани. Их унификация — отдельное изменение поведения.

WORK SEQUENCE
=============

Phase 0 — Characterization
--------------------------

До перемещения production-кода добавь или уточни тесты, фиксирующие:

- точную структуру результата CSV и XLSX;
- пустой/неизвестный файл и неизвестные sheets/types;
- source row numbers;
- pipe/tank mapping, aliases, units, layers и defaults;
- domain validation issues;
- append, merge и replace;
- duplicate handling;
- project object limit;
- batch success, batch failure и row-by-row fallback;
- partial commits;
- replace без prepared rows;
- вызов touch updated_at;
- сохранение async `to_thread` boundary.

Не создавай snapshot огромных бинарных XLSX. Используй небольшие workbook/
CSV fixtures и текущий table-driven стиль.

Phase 1 — Contracts
-------------------

Добавь `object_import/contracts.py`. Переведи внутренние границы на именованные
типы без изменения внешнего dict-контракта. На этом этапе не перемещай всю
логику одновременно.

Phase 2 — Parsing
-----------------

Перенеси:

- CSV decode/delimiter/header/type parsing в `csv_codec.py`;
- XLSX archive validation/workbook/sheet/header parsing в `xlsx_codec.py`.

Результат обоих codecs — одинаковый `ParsedSheet` contract.

Phase 3 — Mapping / normalization
---------------------------------

Перенеси общие coercion/resolver helpers в `mapping_common.py`, а pipe/tank
row-to-candidate mapping — в отдельные owner-модули.

Структурные ошибки импортного представления допустимы здесь. Каноническая
domain validation остаётся в `project_object_params`.

Phase 4 — Validation
--------------------

Перенеси preparation pipeline и адаптацию validation issues. Validator
принимает candidate params, ничего не знает о CSV/XLSX и не изменяет БД.

Phase 5 — Persistence and orchestration
---------------------------------------

Перенеси SQLAlchemy operations в `persistence.py`. Persistence предоставляет
узкие операции чтения состояния, replace и batch persistence.

Importer владеет:

- access check;
- import mode;
- порядком стадий;
- решением о replace;
- transaction/commit policy;
- aggregate result.

Не делай весь импорт атомарным и не меняй commit boundaries без отдельного
пользовательского решения: текущая partial-success семантика является
контрактом этого refactor.

Phase 6 — Facade and tests ownership
------------------------------------

Оставь `excel_import_service.py` тонким compatibility facade. Production API
продолжает импортировать старый путь.

Приватные helper’ы можно временно re-export для совместимости, но production
код не должен создавать новых импортов приватных symbol из facade.

Перенеси unit-тесты к владельцам, например:

  backend/app/tests/unit/services/object_import/
  ├── test_csv_codec.py
  ├── test_xlsx_codec.py
  ├── test_pipe_mapping.py
  ├── test_tank_mapping.py
  ├── test_validation.py
  ├── test_persistence.py
  └── test_importer.py

Не оставляй одни и те же тесты одновременно в старом монолите и новых файлах.
Monkeypatch должен применяться к модулю-владельцу symbol, а не случайно к
facade. Обнови прямой private import `_commit_object_batch` в тестах на путь
реального владельца.

Добавь небольшой AST architecture test, который доказывает ключевые запреты
импортов между codecs, mapping, validation и persistence. Не проверяй LOC и не
создавай хрупкий полный allowlist каждого import.

Phase 7 — Export/template separation
------------------------------------

Только после зелёного import pipeline отдельно вынеси:

- `build_objects_xlsx` в модуль экспорта объектов;
- `build_template_xlsx` и `build_template_csv` в модуль шаблонов.

Не помещай export/template generation внутрь `object_import`. Старый facade
реэкспортирует функции с прежними именами. Если этот этап заметно расширяет
blast radius, остановись после Phase 6 и оформи Phase 7 как следующий slice.

ALLOWED SCOPE
=============

- backend/app/services/excel_import_service.py
- backend/app/services/object_import/**
- при Phase 7 — новые узкие spreadsheet export/template modules
- backend/app/tests/unit/services/test_excel_import_helpers.py
- backend/app/tests/unit/services/object_import/**
- backend/app/tests/integration/api/test_import_excel.py
- backend/app/tests/integration/api/test_electrical_variants.py только для
  обновления private test import
- backend/app/api/v1/objects.py только если нужен compatibility import fix;
  изменение endpoint behavior запрещено

OUT OF SCOPE
============

- frontend и e2e;
- formulas и packages/*;
- migrations и schema DB;
- project_io, calculation и specification refactors;
- изменение API schema, endpoint или background task behavior;
- изменение spreadsheet headers/template contract;
- изменение domain validation rules;
- dependency upgrades;
- backend/mutants/** — это не production owner, вручную не синхронизировать;
- массовое форматирование соседних файлов.

PROOF
=====

После каждого phase запускай ближайшие focused tests владельца.

Минимальный focused proof из корня при доступном dev backend:

  docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend \
    pytest \
      app/tests/unit/services/object_import \
      app/tests/integration/api/test_import_excel.py \
      app/tests/integration/api/test_electrical_variants.py \
      --no-cov -q

Если старый test-файл ещё существует на промежуточной фазе, включи его в
focused command. Не передавай несуществующий путь pytest.

Финальные обязательные проверки:

  make lint-backend
  make lint-backend-mypy-ratchet
  make test-backend
  git diff --check

Если Docker/backend недоступен, не называй проверки зелёными. Зафиксируй
точную команду, ошибку окружения и что осталось NOT RUN.

ACCEPTANCE
==========

- API использует прежний import path и возвращает прежний контракт.
- CSV и XLSX сходятся к одному typed parsed/prepared contract.
- Канонические domain rules не продублированы вне project_object_params.
- Только persistence импортирует SQL query builders и ORM models внутри
  object_import; importer использует AsyncSession только как session boundary.
- Codecs и mapping проверены architecture test на запрещённые зависимости.
- Importer не содержит field-by-field mapping и прямых SQL statements.
- Persistence не принимает raw spreadsheet rows.
- Длинные tuple results и определение object_type по sheet label удалены.
- Batch fallback, partial success, dedupe, replace и limits покрыты тестами.
- Старый excel_import_service — facade, а не второй источник логики.
- Нет изменений чужого WIP и файлов вне allowed scope.
- Все фактически запущенные проверки перечислены с результатом; NOT RUN не
  выдаётся за PASS.

GIT
===

- Не выполнять commit и push без явного запроса пользователя.
- Не добавлять в staging чужой WIP.
- Перед финальным отчётом снова показать `git status --short` и отделить свои
  файлы от существовавших до начала изменений.

FINAL REPORT
============

Сообщи:

- behavior before → after;
- итоговую структуру и направление зависимостей;
- публичные compatibility exports;
- какие тесты были перенесены/добавлены;
- изменённые файлы только этого slice;
- focused proof, lint, mypy ratchet и full backend test с exit status;
- NOT RUN и residual risks;
- отдельно — выполнен ли Phase 7 или оставлен следующим slice.

Не заявляй проверки, которые не запускались.
```

## Короткий запуск

```text
Прочитай AGENTS.md и выполни рефакторинг по
docs/prompts/excel-import-service-refactor.md. Не трогай существующий чужой WIP.
Сначала characterization, затем один архитектурный phase за раз; после каждого
phase запускай focused tests. Не меняй behavior и не делай commit/push.
```
