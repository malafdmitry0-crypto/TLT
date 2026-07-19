# Карта Требований

## Где лежат требования

| Файл/папка | Смысл |
|---|---|
| `docs/srs.md` | Единый SRS-документ, верхнеуровневые требования |
| `docs/srs/01-user-stories.md` | Пользовательские истории |
| `docs/srs/02-use-cases.md` | Use cases |
| `docs/srs/03-elements-list.md` | Перечень элементов |
| `docs/srs/04-validation.md` | Правила валидации |
| `docs/srs/05-functional-nonfunctional.md` | Функциональные и нефункциональные требования |
| `docs/srs/06-test-program.md` | Программа испытаний |
| `docs/srs/07-report-requirements.md` | Требования к отчёту |
| `docs/tz-compliance.md` | Сверка с ТЗ и сводка % готовности |
| `docs/analysis/open-business-decisions.md` | Реестр открытых Q (отчёт, SEC, кабели, объекты) |
| `docs/analysis/business-logic-strengths-weaknesses.md` | SWOT расчётной бизнес-логики |
| `TO_DO.md` | Рабочий статус пробелов и отложенных задач |
| `docs/analysis/` | Бизнес-правила, персоны, story map, диаграммы |
| `docs/qa/` | Чек-листы и ручные тест-кейсы |
| `docs/tnp/cases/guest-specification/product-decisions.md` | Утверждённые PDL-ER-01…28 для dynamic-ER/PDF-кейса |
| `docs/architecture/dynamic-electrical-variants.md` | ADR, phase plan и UUID cutover contract |
| `docs/tnp/cases/guest-specification/phase-1-checkpoint.md` | Финальное evidence backend/DB Phase 1 и переходные ограничения |
| `docs/tnp/cases/guest-specification/phase-2-checkpoint.md` | Финальное frontend/consumer evidence Phase 2 и UUID/legacy boundary |
| `docs/tnp/cases/guest-specification/phase-3-checkpoint.md` | Authoritative assignments, exact cleanup и Phase 3 verification status |

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
  UUID query/cache identity и контролируемым fail-closed состоянием пятого ЭР;
- backend/DB foundation именованных UUID ЭР: readiness, persisted assignments,
  UUID-first electrical/report tasks и sparse CSV v2 import; Phase 1 и
  frontend/consumer Phase 2 имеют статус **PASS**;
- authoritative Phase 3 assignments для каждого `объект × ЭР`: assignment
  panel, `self_regulating/resistive`, read/unassign-only `skin/mineral`,
  optimistic version, calculation sync и exact confirmed unassign cleanup;
- импорт Excel/CSV;
- базовая/расширяемая спецификация;
- HTML-превью отчёта и экспорт PDF/DOCX/XLSX для сотрудника;
- админка пользователей, коэффициентов и внешней БД;
- локальные технические логи Docker-контейнеров через Loki/Grafana/Alloy;
- бизнес-аудит мутаций, расчётов, задач, отчётов и frontend-ошибок в
  Postgres `audit_events`.

## Полная версия: зоны повышенного внимания

| Зона | Что проверить перед задачей |
|---|---|
| Другие типы кабеля | `single_core` и `three_core` согласованы с full-version VSDX fallback policy; для MI и skin нужны отдельные методики |
| Dynamic ЭР / legacy СО | Frontend lifecycle/cache/URL UUID-first. Direct legacy calculation/candidate/folder/spec/report consumers временно передают UUID вместе с deprecated `variant_number`; backend обязан проверить точное соответствие пары до чтения/записи |
| Legacy write adapter | Calculation/candidate/folder/select writes обязаны readiness-gated подготовить UUID mapping и затем проверить compatible assignment exact UUID; spec/seeds сохраняют профильные guards, sparse slot не заполняет промежуточные ЭР |
| Project duplicate | После heat recalc ready copy готовит `ЭР1`/UUID и unassigned matrix, но не запускает electrical batch без явного выбора системы; not-ready copy остаётся без ER/electrical rows и явно audit-ится |
| Assignment semantics | После 0029 type/state authoritative и независимы: assign → stale/calculation-required, same-system no-op, reassign только через confirmed unassign, dirty unassigned graph требует отдельный cleanup handshake, runtime calculation не auto-assign |
| Assignment-aware modal | Row/batch/inline/recalculation строго проверяют совместимость текущего cable type; supported assignment не блокирует `Выбор`/`Подбор` из-за отсутствующего/несовместимого saved type. Модалка выбирает тип своей системы (`resistive → single_core`) и фильтрует варианты по assignment system |
| Unsupported assignments | Skin/mineral нельзя выбрать как target, но tabs должны оставаться доступными для просмотра migrated unsupported rows и confirmed unassign; полностью disabled tabs запрещены из-за stranded data |
| Copy semantics | UUID lifecycle copy и legacy calculation-copy не копируют/не регенерируют specification; target `not_generated`, explicit regeneration request fail-closed до mutation (PDL-ER-13) |
| Task idempotency | Explicit key scoped по principal/type/project и навсегда binding-ит полный payload/ER; heat lookup/insert project-locked; exact terminal retry возвращает original и truthful replay audit, changed binding даёт `TASK_IDEMPOTENCY_KEY_REUSED` |
| Electrical job selector | Omitted numeric selector → slot 1; UUID-only clears implicit default; explicit null → stable 422 до ER side effect |
| Candidate apply/delete | Общая lifecycle project lock, re-read candidate/mapping после lock, stable 404/409 без ER recreation или integrity 500 |
| Пятый ЭР | Доступен lifecycle, assignment API/UI и отдельный scope, но legacy calculation/candidate/spec/report graph отсутствует; UI обязан fail-closed до полного UUID-only cutover |
| Guest persistence | PDL-ER-26 разрешает временное PostgreSQL-хранение на 3 дня с последней активности, session isolation и auto-cleanup. Текущие 20 минут — implementation gap, а не целевой контракт |
| Масштаб проекта | PDL-ER-27 фиксирует цель 500 объектов. Runtime guard 50 сохраняется до performance evidence импорта, batch-расчёта, UI, спецификации и отчёта |
| Heating sections | Семантика утверждена PDL-ER-18…25: официальный источник ТЛТ, explicit `Iдоп` по марке/напряжению, direct `Iст.уд`, minimum object/climate start temperature, voltage isolation, source-defined rounding, self-reg only, fail closed при пробеле. PDL-ER-28 подтверждает обязательность фактического артефакта; Phase 4 остаётся blocked PDL-ER-15/18/28 до его предоставления |
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

Для dynamic-ER Phase 1 migration/backfill evidence, final-head DB invariants и
проверка переходных numeric consumers завершены. Phase 2 закрыла именованный
UUID frontend lifecycle, cache/URL identity, direct consumer bridge и
desktop/mobile UI proof. Phase 3 реализовала и доказала root gate для
authoritative assignment API/UI, exact UUID calculation scope, optimistic
races, confirmed cleanup, live reload и post-UI DB invariants. Это не
закрывает Phase 5, общий PDF/DoD или product release; семантика Phase 4 закрыта
PDL-ER-18…25, а guest TTL/scale решения закрыты PDL-ER-26/27. Сама Phase 4
остаётся blocked PDL-ER-15/18/28 до официального числового источника. Full
frontend gate не green из-за pre-existing missing accessible separator test,
который не является regression dynamic-ER Phase 3. Dependency security gate и
общий Alembic metadata drift вне dynamic-ER diff также блокируют release.
