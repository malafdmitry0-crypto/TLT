# Карта Требований

## Где лежат требования

| Файл/папка | Смысл |
|---|---|
| `docs/srs.md` | Единый SRS-документ, верхнеуровневые требования |
| `docs/srs/README.md`, `docs/srs/` | Детальная legacy-декомпозиция; фиксированные `СО1…СО4` superseded и не являются текущим ER-контрактом |
| `docs/tz-compliance.md` | Исторический срез 2026-05-20; не текущий процент готовности |
| `docs/analysis/open-business-decisions.md` | Реестр открытых Q (отчёт, SEC, кабели, объекты) |
| `docs/analysis/business-logic-strengths-weaknesses.md` | SWOT расчётной бизнес-логики |
| `TO_DO.md` | Рабочий статус пробелов и отложенных задач |
| `docs/analysis/` | Бизнес-правила, персоны, story map, диаграммы |
| `docs/qa/` | Чек-листы и ручные тест-кейсы |
| `docs/tnp/cases/guest-specification/product-decisions.md` | Утверждённые PDL-ER-01…41 для dynamic-ER/PDF-кейса |
| `docs/architecture/dynamic-electrical-variants.md` | ADR, phase plan и UUID cutover contract |
| `docs/tnp/cases/guest-specification/phase-1-checkpoint.md` | Финальное evidence backend/DB Phase 1 и переходные ограничения |
| `docs/tnp/cases/guest-specification/phase-2-checkpoint.md` | Финальное frontend/consumer evidence Phase 2 и UUID/legacy boundary |
| `docs/tnp/cases/guest-specification/phase-3-checkpoint.md` | Authoritative assignments, exact cleanup и Phase 3 verification status |
| `docs/tnp/cases/guest-specification/phase-5-checkpoint.md` | Текущий partial-PASS checkpoint specification/report/guest/CSV/ER5 |

## Текущие границы реализации

Реализованный контур:

- вход гостя без регистрации;
- вход сотрудника и администратора;
- проекты для гостя/сотрудника;
- приватность гостевых проектов: сотрудник видит проекты зарегистрированных
  сотрудников, но не видит и не открывает проекты гостевых сессий подрядчиков;
- объекты: трубопровод и резервуар через встроенную SC-03 форму;
- теплопотери труб/резервуаров с материалами, климатом, грунтом,
  1/2/3 слоями изоляции и подземным резервуаром;
- саморегулирующийся кабель ТЛТ как расчётно поддержанный тип;
- до пяти динамических именованных UUID ЭР на SC-04 с lifecycle, URL selection,
  UUID query/cache identity и compatibility slots `1…5`; normal пятый ЭР имеет
  slot 5 и собственный downstream scope;
- backend/DB foundation именованных UUID ЭР: readiness, persisted assignments,
  UUID-first electrical/report tasks, CSV v3 export и v2/v3 import; Phase 1–3
  имеют статус **PASS**, Phase 5 — **PARTIAL PASS**;
- authoritative Phase 3 assignments для каждого `объект × ЭР`: assignment
  panel, `self_regulating/resistive`, read/unassign-only `skin/mineral`,
  optimistic version, calculation sync и exact confirmed unassign cleanup;
- импорт Excel/CSV;
- full automatic specification с settings snapshot, preflight и explicit
  multi-ЭР generation; manual items — employee/admin only;
- UUID-first multi-ЭР HTML preview/browser print и single-ЭР server export
  PDF/DOCX/XLSX для сотрудника;
- админка пользователей, коэффициентов и внешней БД;
- локальные технические логи Docker-контейнеров через Loki/Grafana/Alloy;
- бизнес-аудит мутаций, расчётов, задач, отчётов и frontend-ошибок в
  Postgres `audit_events`.

## Полная версия: зоны повышенного внимания

| Зона | Что проверить перед задачей |
|---|---|
| Другие типы кабеля | `single_core` и `three_core` согласованы с full-version VSDX fallback policy; для MI и skin нужны отдельные методики |
| Dynamic ЭР / numeric compatibility | Frontend lifecycle/cache/URL UUID-first. Direct compatibility consumers временно передают UUID вместе с deprecated `variant_number=1…5`; backend обязан проверить точное соответствие пары до чтения/записи |
| Legacy write adapter | Calculation/candidate/folder/select writes обязаны readiness-gated подготовить UUID mapping и затем проверить compatible assignment exact UUID; spec/seeds сохраняют профильные guards, sparse slot не заполняет промежуточные ЭР |
| Project duplicate | После heat recalc ready copy готовит `ЭР1`/UUID и unassigned matrix, но не запускает electrical batch без явного выбора системы; not-ready copy остаётся без ER/electrical rows и явно audit-ится |
| Assignment semantics | После 0029 type/state authoritative и независимы: assign → stale/calculation-required, same-system no-op, reassign только через confirmed unassign, dirty unassigned graph требует отдельный cleanup handshake, runtime calculation не auto-assign |
| Assignment-aware modal | Row/batch/inline/recalculation строго проверяют совместимость текущего cable type; supported assignment не блокирует `Выбор`/`Подбор` из-за отсутствующего/несовместимого saved type. Модалка выбирает тип своей системы (`resistive → single_core`) и фильтрует варианты по assignment system |
| Unsupported assignments | Skin/mineral нельзя выбрать как target, но tabs должны оставаться доступными для просмотра migrated unsupported rows и confirmed unassign; полностью disabled tabs запрещены из-за stranded data |
| Copy semantics | UUID lifecycle copy и legacy calculation-copy не копируют/не регенерируют specification; target `not_generated`, explicit regeneration request fail-closed до mutation (PDL-ER-13) |
| Task idempotency | Explicit key scoped по principal/type/project и навсегда binding-ит полный payload/ER; heat lookup/insert project-locked; exact terminal retry возвращает original и truthful replay audit, changed binding даёт `TASK_IDEMPOTENCY_KEY_REUSED` |
| Electrical job selector | Omitted numeric selector → slot 1; UUID-only clears implicit default; explicit null → stable 422 до ER side effect |
| Candidate apply/delete | Общая lifecycle project lock, re-read candidate/mapping после lock, stable 404/409 без ER recreation или integrity 500 |
| Пятый ЭР | Migration 0031 и normal lifecycle дают slot 5; calculation/copy/spec/report/CSV поддерживают его. Остаточный gap: `create_electrical_candidate` и `create_electrical_candidate_folder` всё ещё валидируют только `1…4` |
| Guest persistence | Реализован TTL 3 дня с последней активности, session isolation и cleanup по PDL-ER-26; expiry создаёт новый пустой проект, восстановление старого возможно только из файла |
| Масштаб проекта | PDL-ER-27 фиксирует 500 объектов × 5 ЭР и PDF-пороги 30 секунд. Runtime guard 50 сохраняется до performance evidence импорта, batch-расчёта, UI, specification и report |
| Heating sections | Семантика утверждена PDL-ER-18…25: официальный источник ТЛТ, explicit `Iдоп` по марке/напряжению, direct `Iст.уд`, minimum object/climate start temperature, voltage isolation, source-defined rounding, self-reg only, fail closed при пробеле. PDL-ER-28 подтверждает обязательность фактического артефакта; Phase 4 остаётся blocked PDL-ER-15/18/28 до его предоставления |
| Phase 5 specification | **PASS в checkpoint:** один full mode, settings snapshot, exact catalog identity, explicit partial/preflight/atomic multi-ЭР generation, stale read-only/no-output и grouping; official `Ex/Rгр` data artifact остаётся external |
| Phase 5 report | **PASS functional:** явный UUID-list, независимые главы без cross-ЭР sums, HTML/browser print; corporate template остаётся отдельным out-of-scope acceptance |
| Phase 5 project I/O | **PASS focused:** export только v3, v2/v3 import, stale trust boundary и atomic reject guest manual BOM rows |
| Поддерживаемая ширина Phase 5 | **PASS focused:** interactive UI от 1280 px, меньшая ширина получает предупреждение, browser print проверяется отдельно |
| Расширенные типы объектов | Для pump/platform/other нужны формы, схемы, формулы, импорт, отчёты и тесты |
| Безопасность раздела 5 ТЗ | Обфускация, шифрование формул/справочников, ротация ключей пока отдельный риск |
| Табличный UX | TSV-копирование есть; Excel-like bulk edit и эскизы Приложения 4 проверять по `TO_DO.md` |
| Документация ошибок | Нет полноценного справочника кодов ошибок |

## Трассировка изменения

Для каждой функциональной задачи фиксировать цепочку:

`ТЗ/SRS -> API/сервис -> UI -> тесты -> документация`

Минимальный набор проверок:

- требование есть или добавлено в `docs/srs*`;
- API описан в `docs/api.md`, если менялся контракт;
- схема БД описана в `docs/db_schema.md`, если менялись модели/миграции;
- QA-сценарий добавлен или обновлён в `docs/qa/`;
- автотест покрывает основной успешный сценарий и хотя бы один риск.

Для dynamic-ER Phase 1–3 evidence завершено. Phase 5 имеет partial PASS:
settings/specification/report/guest/CSV v3/ER5 подтверждены focused evidence,
но полный scale gate 500, Phase 4 numeric artifact, два candidate/folder guards
slot 5 и общий release gate остаются открыты. Текущий статус брать из
`phase-5-checkpoint.md`, а не из ранних Phase 0–3 snapshots или старых SRS.
