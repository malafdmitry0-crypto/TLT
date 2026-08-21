# Electrical №9: сводка, инженерные колонки, demo data и UUID read scope

## Цель и порядок

Сначала выполнить slice 1 (корректная server-side сводка, инженерные колонки и demo data), затем slice 2 (exact UUID read-scope всех query). Это один Electrical owner, но пользовательская корректность не должна смешиваться с совместимостью Phase 5.

Нормативный источник — `1_Кейс`, в частности §§6.8, 6.14 и 6.16. Техническое ТЗ `guest-electrical-calculation-tz.md` фиксирует разрешения неоднозначностей. Backend остаётся авторитетом для формул, каталогов, округлений, read scope и summary; frontend отображает серверный контракт и управляет query cache.

## Slice 1 — summary и инженерные данные

1. Расширить `ElectricalPageSummary` полями `total_sections`, `total_start_current_a` и `system_summaries`.
2. Каждый bucket содержит `object_count`, `cable_length_m`, `section_count`, `power_w`, `working_current_a`, `start_current_a`. Плоские итоги должны в точности совпадать с `system_summaries.total`.
3. Группировать по авторитетному `ElectricalVariantObject.system_type`, а не по `calculation.cable_type`. В summary включать только строки, прошедшие существующий compatibility-aware ready/success predicate; failed и stale исключать.
4. `cable_length_m` — это `installed_cable_length` (`Lфакт`), не `order_cable_length` (`Lзаказ`). Число секций читать как `section_count` с legacy fallback `num_sections`; стартовый ток — `start_current` с fallback `section_start_current_a`, без подмены рабочим током.
5. Сохранить buckets `self_regulating`, `resistive`, `skin`, `total`. `mineral` остаётся non-MVP: не формирует ready-строки.
6. На frontend серверные `system_summaries` — источник карточек. Клиентская агрегация загруженной страницы разрешена только как fallback и также использует `Lфакт`. После распределения, расчёта и ручной корректировки query должна инвалидацироваться/обновляться: карточки не должны зависеть от pagination или требовать reload.

### Инженерные колонки

Добавить в query response `required_installed_length_m`, `section_l_max_m`, `section_l_tok_m`, `section_l_ogr_m`, `section_l_excess_m` и `provenance`; сохранить `installed_cable_length` и `order_cable_length`.

- Сначала читать канонический nested TT snapshot (`layout`, `section_plan`, `electrical`, `provenance`), затем применять top-level compatibility fallback.
- Числовые длины обязаны поддерживать SQL/Python range filter и numeric sort.
- Показывать компактный provenance: источники ниток, укладки и `Iдоп`, каталог секционирования, formula version/fingerprint. Полный объект — только details/tooltip; raw JSON в таблице запрещён.
- Новые колонки скрыты по умолчанию и доступны исключительно через настройки таблицы. Текущая видимость `Lфакт`/`Lзаказ` не меняется.
- В соответствии с §6.14 показывать `Lтреб`, `Lмакс`, `Lток`, `Lогр`, `Lфакт`, `Lдоп`, `Lзаказ`, секции, рабочий и стартовый ток. Это расчетные, read-only данные.
- §6.16 непосредственно запрещает ручное добавление, удаление и изменение автоматических секций. Provenance нужен для трассируемости §6.14, но не является прямым требованием §6.16. Из pipeline editable остаются только марка кабеля и навив в пределах §6.16/действующего контракта; длины, ограничения, секции, токи и provenance не редактируются.

## Slice 2 — UUID read scope (Phase 5 boundary)

1. Если передан `electrical_variant_id`, UUID — единственный авторитетный selector; `variant_number` используется только при отсутствии UUID.
2. Пронести UUID через default keyset, SQL keyset, SQL offset, Python fallback, joins calculations, summary и `/query-capabilities`.
3. Валидировать UUID через read path, не требуя legacy slot. UUID другого проекта возвращает безопасный not-found.
4. UUID-only ЭР может читаться с пустым результатом. Не менять DB schema и не реализовывать UUID-only write — это намеренно остаётся границей Phase 5.
5. В request оставить compatibility default `variant_number=1`; normalized query echo обязан вернуть фактический `electrical_variant_id` и nullable resolved legacy number.
6. Добавить acceptance на несовпадающие UUID/legacy selectors: UUID побеждает, а чужой legacy slot не влияет на строки, summary или capabilities.

## Demo seeds и fixtures

- Backend demo seed обязан вызывать текущий TT service/pipeline, а не формировать production provenance вручную. Нужны canonical nested fields, snapshots каталогов и актуальные formula/catalog fingerprints.
- Напряжение нового расчёта строго 230 В.
- Основной demo seed должен давать как минимум две детерминированные ready-строки с различимыми `Lтреб`, `Lфакт`, `Lзаказ`, числом секций и токами. В seed не подделывать результат ради этой разницы: обеспечить её различной канонической геометрией/heat input.
- Failed/stale строку не добавлять в чистый основной demo project: она принадлежит integration/QA fixture либо отдельному Playwright state.
- Обновить typed summary fixtures, `makeElectricalPage`, capabilities mocks и guest/Playwright seed только там, где это требуется новому контракту.

## Приёмка

- Backend: ready-only totals, `Lфакт` вместо `Lзаказ`, grouping по assignment, исключение failed/stale, независимость summary от страницы и одинаковое поведение всех query paths.
- Frontend: server-authoritative cards, fallback, cache refresh, новые колонки скрыты по default и включаются через настройки, nested values и безопасный provenance rendering.
- Browser QA: seeded populated/empty/error, переключение ЭР, pagination и settings на `1440×1000` и `390×844`, без overflow, console errors и failed requests.
- Выполнить focused backend tests и рассчитанный `agent:scope` frontend proof. Полный DoD допускается пометить `NOT RUN`, пока он отдельно не запрошен.
