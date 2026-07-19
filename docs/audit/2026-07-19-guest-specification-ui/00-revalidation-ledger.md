# 00. Реестр повторной проверки

Этот файл отвечает на вопрос «нужно ли перепроверить все записи»: **да, все
записи папки перепроверены**. Исходный отчёт был составлен до коммита
`38f6bb3e44393e46a8b8a2ba88dfd622dccba33c` от 19.07.2026 18:15 +03 и
описывал более раннее состояние. Старые screenshots и API responses сохранены
как historical evidence, но больше не используются как описание текущего UI.

## Baseline и статусы

| Контекст | Значение |
|---|---|
| Текущий код | `38f6bb3e44393e46a8b8a2ba88dfd622dccba33c` |
| Ближайший commit до исправления | `3073df5a238fa870b094a6b4924b921ac3467c18` |
| Точный pre-fix dirty-tree digest | не был сохранён; восстановить нельзя |
| Текущая БД | Alembic `0031 (head)` |
| Текущий функциональный итог | `FAIL` для принятия полного закупочного BOM |
| Внешние данные | `BLOCKED`: каталог секционирования и Ex/Rгр matrix отсутствуют |
| Честность partial UI | `PASS` на текущем HEAD: UI, reload, DB и HTML-report |

Статусы в этом отчёте:

- `CLOSED@38f6bb3` — прежний дефект исправлен и повторно проверен;
- `OPEN` — текущий дефект воспроизводится кодом, тестом или live UI;
- `PARTIAL` — часть контракта исправлена, остаток явно указан;
- `BLOCKED_SOURCE / FAIL-CLOSED PASS` — источник истины отсутствует, а текущий
  код корректно не выдумывает результат;
- `RETRACTED` — исходное утверждение не подтверждается названным источником;
- `HISTORICAL_FAIL` — дефект был доказан до `38f6bb3`, но не является текущим.

## Классы источников

| Код | Что это | Как используется |
|---|---|---|
| `APPROVED_PDL` | `product-decisions.md` | явные решения, которые разрешают конфликты PDF/legacy |
| `PRIMARY_PDF` | переданный PDF редакции 4 от 07.07.2026 | буквальный текст, формулы и показанные поля |
| `NORMATIVE_SRS` | актуальные, не superseded SRS/UC | контракт при отсутствии конфликта с PDL/PDF |
| `DERIVED_INTERNAL` | `pdf-requirements.md`, analyses, prompts, checkpoints, mappings | навигация и гипотезы; не может само создать требование PDF |
| `OBSERVED` | код, API, DB, screenshot, geometry, тесты | описание поведения только на указанной revision |
| `RECOMMENDATION` | предложенная архитектура/UX | не называется несоответствием без отдельного контракта |

При конфликте используется порядок `APPROVED_PDL → PRIMARY_PDF → актуальный
NORMATIVE_SRS`. `DERIVED_INTERNAL` не повышается до первичного требования даже
если внутри него написано `source: pdf`.

## Явно отозванные или суженные утверждения

| Исходная запись | Новый вердикт | Почему |
|---|---|---|
| «PDF стр. 49 обещает UI `объект → группы → секции`» | **RETRACTED** | Стр. 47–48 задают формулы и одинаковые секции; стр. 49 задаёт агрегированную строку объекта, показатели и статус. Узел `группа` и обязательное дерево там не определены. Иерархия встречается только в `DERIVED_INTERNAL` analysis/prompt. |
| «Отсутствие такого дерева — прямое нарушение PDF» | **RETRACTED** | Прямой контракт — рассчитать секции и показать требуемые показатели. Конкретный tree-view был нашей UX-рекомендацией. |
| «Все успешные электрические результаты запрещены до появления секций» | **NARROWED** | Доказанный подбор кабеля может быть успешным; fail-closed обязателен для секционно-зависимых BOM-позиций и статуса полного закупочного комплекта. |
| «PDL требует live countdown TTL» | **NARROWED** | PDL требует трёхдневный lifecycle и явное expiry-поведение. Countdown `2д 23ч` — рекомендация. |
| «PDL требует disabled routes между шагами» | **RETRACTED AS CONTRACT** | Readiness-gated mutation требуется, но конкретная блокировка навигации — UX-рекомендация. |
| «Убрать UUID/enum/PDL из normal view — прямое PDF-требование» | **RECLASSIFIED** | Это обоснованная usability-рекомендация; буквальный PDF её не формулирует. |

## Реестр FA-01…FA-19

| ID | Статус на `38f6bb3` | Повторная проверка |
|---|---|---|
| FA-01 partial маскировался как full | `CLOSED@38f6bb3` | Live `409 → confirm → 201`; header `НЕПОЛНАЯ`, persistent warning и два error code; состояние пережило reload и попало в report. Старый full-success screenshot — `HISTORICAL_FAIL`. |
| FA-02 `num_circuits` подменял секции | `BLOCKED_SOURCE / FAIL-CLOSED PASS` | Production выдаёт `SECTION_DATA_SOURCE_MISSING` и не формирует Nсек-dependent rows. Реальный section algorithm всё ещё заблокирован отсутствующим source artifact. |
| FA-03 raw order выигрывал у commercial final | `CLOSED@38f6bb3` | Приоритет `commercial.required_order_length`; oracle 110/120 теперь даёт 120. |
| FA-04 accessory formulas | `MIXED / OPEN` | Старые glue и double-reserve tape probes исправлены. Открыты exact-divisor boundaries (`0.14` вместо `/7`, `0.0333334` вместо `/30`) и latent connector/box algorithms после разблокировки секций/matrix. |
| FA-05 partial diagnostics не сохранялись | `PARTIAL` | `is_partial`, excluded groups и skipped count сохраняются в `generation_options`, доступны GET/UI/report. Per-object details и DOCX/XLSX diagnostics не доказаны/не представлены. |
| FA-06 preflight не видел builder exclusions | `PARTIAL / OPEN` | Backend теперь видит группы и требует confirm. UI ошибочно пишет `Всего исключений: 0` при двух исключённых группах; нет snapshot token/revision; multi-ER preflight вызывается без `req.options`. |
| FA-07 stale можно было редактировать | `CLOSED@38f6bb3` | Backend PUT возвращает stable 409, UI выключает Add/Delete, report не принимает stale; focused tests проходят. |
| FA-08 typed grouping отсутствует | `OPEN` | Builder по-прежнему агрегирует cable и помечает generated rows `bom_section=common`; UI selector не восстанавливает pipe/tank/common. |
| FA-09 guest print отсутствовал | `CLOSED FUNCTION / PRINT RENDER UNVERIFIED` | Кнопка видна; click вызвал `window.print()` один раз; print CSS есть. Реальный print-preview/PDF и page-break layout не проверены. |
| FA-10 traceability неполна | `OPEN` | Есть часть catalog metadata, но нет полного immutable input/formula/data-version trail для heat/electrical/BOM и round trip всех outputs. |
| FA-11 TTL неверен и не строг | `PARTIAL / OPEN` | Home исправлен с 20 минут на 3 дня. Backend по-прежнему принимает найденную старую сессию до age-check и обновляет activity; frontend автоматически создаёт новый guest project на 401. |
| FA-12 CSV trust/scale | `OPEN` | Manifest formula/catalog completeness, recomputation trust и row/object boundaries остаются неполными. |
| FA-13 gates слишком permissive | `OPEN` | Phase-5 сценарий допускает несколько error status как приемлемый outcome; populated partial/reload exact oracle не является strict release gate. |
| FA-14 quality gate красный | `OPEN` | lint 3 errors/3 warnings; typecheck/build fail; formula quick 7 fails; дополнительно 4 report-service unit assertions расходятся с current signature. |
| FA-15 ER5 data plane | `OPEN + CONTRACT DECISION` | Основные UUID schemas поддерживают 1…5, но candidate/folder paths и legacy frontend store ещё ограничены 1…4. Legacy-v2 import slot-5 expectation требует отдельного решения, а не автоматического переписывания golden. |
| FA-16 перегруженный/технический copy | `OPEN, RECOMMENDATION` | На старте остаётся третья admin-card; spec/report показывают `PDL-*`, `Project defaults`, UUID, `ProjectStatus.draft`, `other`. Два стартовых действия — literal PDF; конкретный способ очистки copy — UX. |
| FA-17 обещание route locking | `OPEN, UX CONSISTENCY` | Copy говорит о последовательной разблокировке, но routes открыты. Это согласованность интерфейса, не прямое требование disabled navigation. |
| FA-18 narrow UI | `KNOWN LIMITATION + PRINT RISK` | PDL поддерживает интерактивный flow от 1280 px. На 390 px spec имеет width 554 и horizontal overflow; report tables выходят до 942 px. Это не desktop blocker, но адаптивная печать не доказана. |
| FA-19 два commit при guest creation | `OPEN` | `AuthService.create_guest_session()` commit, затем отдельный commit auto-project; fault второго шага может оставить orphan session. |

## Новые записи текущей ревалидации

| ID | Статус | Evidence |
|---|---|---|
| FA-20. Preflight modal считает только объекты | `OPEN` | Backend 409 содержит 0 skipped objects и 2 excluded groups; modal показывает `Всего исключений: 0` и не перечисляет группы. |
| FA-21. В specification отсутствует supplier | `OPEN` | Literal PDF стр. 60: supplier показывается, если указан. `SpecificationItem` и текущая table не имеют supplier field. |
| FA-22. Invalid create расходится с PDF | `OPEN / NEEDS PRODUCT DECISION` | PDF стр. 28: при некорректных данных объект не создаётся. Current editor намеренно оставляет сохранённый invalid pipe/tank в edit mode. Если нужны draft rows, это надо явно утвердить как supersession. |

## Текущий live proof

- [409 preflight body](evidence/current-head/specification-preflight-409-response.json)
- [preflight modal showing zero](evidence/current-head/specification-preflight-modal-zero-desktop-1440x1000.png)
- [201 generation body](evidence/current-head/specification-generate-201-response.json)
- [partial specification desktop](evidence/current-head/specification-partial-desktop-1440x1000.png)
- [partial state after reload](evidence/current-head/specification-partial-after-reload-snapshot.md)
- [partial report desktop](evidence/current-head/report-partial-desktop-1440x1000.png)
- [print handler proof](evidence/current-head/report-print-handler-proof.json)
- [desktop specification geometry](evidence/current-head/specification-partial-desktop-geometry.json)
- [narrow specification geometry](evidence/current-head/specification-partial-mobile-geometry.json)
