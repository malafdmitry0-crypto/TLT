# Настройки отображения: доступность гостю и перенос в файле проекта

**Дата:** 2026-08-03
**Статус:** реализовано 2026-08-03 (backend + frontend heatcalc); детали — в чек-листе ниже.
Источник пробела: [`case1-backend-status.md`](./case1-backend-status.md), раздел 4, пункт
«настройки отображения не проектные и гостю недоступны».

## Требование кейса 1

- **5.9 «Настройка отображения таблицы»**: пользователь (в т.ч. гость) выбирает видимые
  столбцы, есть «По умолчанию», чекбокс выбора скрыть нельзя, настройки меняют только
  отображение; бизнес-правило — «настройки действуют в рамках текущей сессии».
- **5.11 «Открытие проекта из файла»**: система загружает «настройки отображения, **если они
  входят в файл**» — требование мягкое, но перенос настроек в файле прямо предусмотрен.
- Для гостя «сессия» и «единственный временный проект» — одно и то же, поэтому хранение
  настроек на проекте эквивалентно сессионному хранению из 5.9.

## Текущее состояние (ревизия 2026-08-03)

- Единственное серверное хранилище UI-настроек — `UserPreference`
  (`backend/app/models/user_preference.py`): `user_id NOT NULL`, endpoints
  `GET/PUT /api/v1/preferences/{key}` под `require_employee()`
  (`backend/app/api/v1/preferences.py`). **Гостя в этой модели не существует.**
- Фронт: `useHeatCalcPreferences` + `useHeatCalcPreferenceServerSync` — сотруднику
  синхронизация на сервер, гостю только localStorage браузера. При переносе файла проекта на
  другую машину настройки гостя теряются.
- Файл проекта (schema v3, `backend/app/services/project_io_service.py`) настроек отображения
  не содержит ни в одной секции.

## Целевое решение (рекомендация)

Хранить настройки отображения **на проекте**, по образцу уже реализованных
`Project.specification_settings` + `specification_settings_version` (см. коммит 4bbc5cf и
`SpecificationProjectSettingsService`):

- новое поле `Project.display_settings` (JSON, nullable) + `display_settings_version` (int);
- гость получает доступ через обычное правило мутации проекта (`canMutateProject` по
  `session_id`), сотрудник — по владению;
- `UserPreference` сотрудников не трогаем (личные настройки поверх проектных — вне объёма);
- файл проекта переносит `display_settings` как обычную секцию metadata.

Альтернатива (отклонена): расширять `UserPreference` на гостя (`session_id` nullable-ключ) —
не решает перенос в файле и усложняет модель двумя владельцами.

## Чек-лист реализации

### Backend — хранилище и API

- [x] Миграция: `projects.display_settings JSONB NULL`,
      `projects.display_settings_version INT NOT NULL DEFAULT 0`
      (`alembic/versions/0038_project_display_settings.py`).
- [x] `GET /api/v1/projects/{project_id}/display-settings` — `require_any()`, чтение доступно
      всем ролям с доступом к проекту; `{settings, version}` (`api/v1/display_settings.py`).
- [x] `PUT /api/v1/projects/{project_id}/display-settings` — `require_any()` + проверка права
      мутации (гость по `session_id`, сотрудник-владелец, админ); optimistic-версия:
      `expected_version` → 409 `PROJECT_DISPLAY_SETTINGS_VERSION_CONFLICT` при расхождении;
      `SELECT ... FOR UPDATE`, бамп версии только при фактическом изменении канонического
      payload (`services/project_display_settings_service.py`).
- [x] Валидация payload: верхнеуровневые ключи — whitelist по рабочим областям
      (`heatcalc`, `electrical`, `specification`), внутри — opaque JSON; лимит 32 КБ после
      канонизации → 422 `PROJECT_DISPLAY_SETTINGS_TOO_LARGE`; `extra="forbid"` на обёртке
      (`schemas/project_display_settings.py`).
- [x] Никаких серверных дефолтов: отсутствующее поле не подменяется значением.
- [x] `touch_project` при изменении (сортировка «по дате изменения»).

### Backend — файл проекта

- [x] Экспорт: строки `display_settings` / `display_settings_version` в секции `metadata`
      (одиночный экспорт) и колонки в секции `projects` (bulk); NULL → пустая ячейка,
      чтобы отличать «не задавались» от явного сброса `{}`.
- [x] Импорт: восстановление при наличии колонок; файл v3 без них остаётся валидным
      (`_apply_imported_display_settings`, payload lossless как у specification_settings).
- [x] Копирование при `duplicate_project`.

### Frontend

- [x] Гость: `useHeatCalcPreferenceServerSync` пишет/читает `display-settings` проекта;
      localStorage остаётся офлайн-кэшем и источником одноразовой миграции первого запуска
      (`version=0` + недефолтный localStorage → PUT на проект).
- [x] Сотрудник: без изменений (остаётся `UserPreference`).
- [x] После импорта проекта из файла — инвалидация query-кэша `project-display-settings`
      (ProjectMenu, ProjectsPage).
- [x] Конфликт версий (409) → перечитать серверную версию, показать уведомление, локальные
      изменения остаются в состоянии/localStorage (повторное сохранение доступно).
- [x] «По умолчанию» (кейс 5.9): сброс = запись канонического пустого payload
      (`buildGuestHeatcalcDisplaySection` опускает дефолты; полный сброс → `{heatcalc: {}}`).

### Тесты

- [x] Unit: канонизация payload, whitelist ключей, лимит размера
      (`tests/unit/services/test_project_display_settings.py`), идемпотентность PUT —
      в integration/query-counts.
- [x] Integration API: гость читает/пишет настройки своего проекта; чужой гость — 403;
      409 при устаревшей версии; round-trip export → import восстанавливает настройки и
      версию; v3-файл без колонок валиден
      (`tests/integration/api/test_project_display_settings.py`).
- [x] `test_query_counts.py`: GET — 1 запрос, PUT — 4, идемпотентный PUT — 2 без записи;
      bulk-экспорт остаётся в бюджете 7 запросов.
- [x] Frontend: сохранение гостя пишет display-settings проекта; проектные настройки
      применяются при чистом localStorage
      (`HeatCalcPage.settings.project-sync.test.tsx`, юнит-тесты канонического раздела в
      `heatCalcPreferencesModel.test.ts`).

### Приёмка по кейсу

- [ ] 5.9: набор столбцов настраивается и переживает перезагрузку страницы у гостя;
      чекбокс выбора скрыть нельзя; «По умолчанию» восстанавливает стандартный набор;
      данные объектов не изменяются.
- [ ] 5.11: файл, сохранённый на машине A с изменёнными настройками, при открытии на машине B
      показывает те же столбцы.

## Вне объёма

- Слияние/приоритет `UserPreference` сотрудника и проектных настроек.
- Синхронизация настроек сотрудника между устройствами (уже покрыта `UserPreference`).
- Настройки отображения для страниц ЭР/спецификации — каркас (whitelist-ключи) закладывается,
  наполнение — по мере появления настроек на этих страницах.

## Открытые вопросы (решения реализации 2026-08-03)

1. `SCHEMA_VERSION` файла проекта оставлен v3: колонки опциональные, старые файлы валидны.
2. Отдельный аудит-лог изменений настроек не заведён — достаточно optimistic-версии.
