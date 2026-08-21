# План удаления только legacy-тестов электрорасчёта

**Статус:** план, не реализация

**Дата:** 2026-08-05
**Область:** только backend/frontend/E2E тесты старого электрического контракта

Этот документ заменяет широкий план очистки runtime-кода. Удаление production-
кода, API, таблиц, сидов, миграций, справочников и обратной совместимости этой
задачей **не разрешено**.

## 1. Цель

Удалить тесты, которые требуют успешной работы старых расчётных путей:

```text
cable_type = self_regulating   # старый ТЛТ, не system_type назначения
cable_type = single_core       # старый ТТ R1
cable_type = three_core        # старый ТТ R3
formula_type = electrical      # старый formula-check ТЛТ
formula_type = resistive_single / resistive_three
```

Актуальный расчётный контракт остаётся покрыт тестами:

```text
system_type = self_regulating
cable_type = self_regulating_tt
series = ТТН / ТТВ / ТТХ
```

Потеря покрытия именно старых успешных сценариев допустима. Потеря покрытия
актуального TT-пути, общих правил RBAC/UUID/stale или запрета старого формата —
нет.

## 2. Жёсткие границы

В этом slice разрешены только:

- удаление целого legacy test case или целого файла, если все его сценарии
  legacy;
- удаление legacy-параметров из parametrized test;
- очистка ставших неиспользуемыми test imports, fixtures, mocks и helpers;
- переименование оставшегося `describe`, если старое имя стало неверным.

Запрещены:

- любые изменения вне test-кода и этого документа;
- изменение production-контракта ради прохождения оставшихся тестов;
- удаление теста только потому, что в его fixture встречается `ТЛТ`,
  `self_regulating` или слово `legacy`;
- переписывание generic-теста на новый бизнес-сценарий в рамках удаления;
- правка или удаление исторических миграций и их upgrade-тестов;
- общий тестовый прогон и mobile E2E.

Если generic-тест проверяет сортировку, RBAC, UUID, pagination, stale lifecycle,
экспорт или идемпотентность и лишь использует старую марку как пример, он
остаётся. Модернизация его fixture — отдельная задача.

## 3. Правило классификации

| Класс | Действие | Пример |
|---|---|---|
| Старый тип обязан успешно рассчитаться/отобразиться | удалить | R1/R3 успешно подбирается из UI |
| В одном файле есть TT и legacy-сценарии | удалить только legacy cases | TT оставить, TLT/R1/R3 удалить |
| Parametrize смешивает TT и legacy | удалить только legacy rows | сохранить `electrical_tt` |
| Старый payload обязан стать stale/rejected | оставить | ТЛТ не считается успешным результатом |
| `legacy` означает numeric ER slot или UUID bridge | оставить | запись по `variant_number` связывается с UUID |
| Тест исторической миграции | оставить | fresh DB upgrade со старым enum |
| Legacy относится к Heat/резервуарам/спецификации | вне scope | запрет старой формы резервуара |
| Старый literal используется в generic fixture | оставить | отчёт исключает stale-строку |

## 4. Исполнение по slice

### T0. Зафиксировать manifest

Перед удалением:

1. Выполнить `git status --short`.
2. Не включать чужой WIP в staging; его фиксирует владелец соответствующего
   slice.
3. Для каждого кандидата записать одно предложение: какое именно legacy-
   поведение требует assertion.
4. Если такое предложение сформулировать нельзя, тест не удалять.

### T1. Backend unit и API tests

Удалить позитивное покрытие старых справочников и формул из смешанных файлов:

- `backend/app/tests/unit/reference_data/test_loader.py`:
  - все `test_resistive_*`;
  - `test_tlt_cables_*`;
  - весь `TestGetTltCableByMark`;
- `backend/app/tests/unit/schemas/test_calculation_schemas.py`:
  - весь `TestSelfRegulatingParams` старого ТЛТ;
  - `test_resistive_tank_laying_step_bounds_match_source_document`;
- `backend/app/tests/integration/api/test_admin.py`:
  - `TestAdminCables`, обслуживающий старый `CableExtended`-контур;
  - успешный старый `electrical` formula-check;
  - успешные `resistive_single` и `resistive_three` formula-check;
  - соответствующие legacy rows из mixed parametrization;
- `backend/app/tests/unit/services/test_admin_service_unit.py`:
  - `TestCables` старого admin cable CRUD;
- `backend/app/tests/integration/api/test_references.py`:
  - публичный ТЛТ-каталог;
  - resistive R1/R3-каталог;
  - commercial/extended проверки старых cable types;
- `backend/app/tests/unit/services/test_cable_snapshot.py`:
  - два теста resistive alias/fallback normalization;
- `backend/app/tests/unit/services/test_electrical_candidate_dedupe.py`:
  - только пять resistive-specific cases для connection type, voltage и
    scheme priority;
- `backend/app/tests/unit/services/test_electrical_error_guidance.py`:
  - удалить resistive-ветку из смешанного structured-actions теста, сохранив
    проверку unknown/current ошибок;
- `backend/app/tests/unit/test_contracts.py`:
  - убрать только assertion, закрепляющий старые значения `CableType`; остальные
    persisted enums сохранить.

Также удалить найденные при T0 тесты, если их основной assertion прямо требует
успешный `self_regulating`, `single_core` или `three_core`. Файл целиком удалять
только когда в нём нет ни одного текущего или общего контракта.

### T2. Frontend unit и integration tests

Удалить только assertions старого UI:

- `frontend/src/__tests__/integration/pages/admin/FormulasPage.test.tsx`:
  - таб «Саморег. ТЛТ»;
  - таб «Резистивный»;
  - legacy labels из проверки списка вкладок;
- `frontend/src/__tests__/unit/pages/admin/ReferencesPage.test.tsx`:
  - таб «Кабели ТЛТ» и оставшиеся только для него mock data;
- `frontend/src/__tests__/unit/pages/admin/DatabasePage.test.tsx`:
  - старый cable CRUD/table assertion; покрытие аксессуаров сохранить, если оно
    независимо;
- `ElecCalcElectricalTypeControls.test.tsx`:
  - read-only old `self_regulating` control;
  - resistive controls;
- `elecCalcAssignAutoCalcModel.test.ts`:
  - `resistive -> single_core` batch;
- `elecCalcAssignmentScopeModel.test.ts`:
  - нормализацию legacy cable types;
  - свежий resistive assignment;
- `elecCalcCableTypeModel.test.ts`:
  - только resistive classification assertion; generic TT/default assertions
    сохранить;
- `useElecCalcCableReferenceData.test.tsx`:
  - resistive query assertion; negative test «hidden TLT catalog не
    запрашивается» сохранить;
- `client.network-idempotency.test.ts`:
  - сохранение voltage для resistive request;
- `cableCatalogSourceLabels.test.ts`:
  - три resistive signature/fallback cases;
  - старый ТЛТ comparison удалять только если его цель — поддержка старого
    каталога, а не generic source-label contract.

После удаления разрешена только механическая очистка test imports/mocks. Код
компонентов, hooks, API clients и types не менять.

### T3. Desktop E2E

Удалить legacy journeys:

- `cable-business-flows.cable-types.spec.ts`:
  - одножильный R1;
  - трёхжильный R3;
  - текущий TTН/TTВ/TTХ сценарий сохранить;
- `cable-business-flows.catalog-spec-path.spec.ts`:
  - старый builtin ТЛТ path с `cable_type=self_regulating`;
  - path с `cable_type=three_core`;
  - TT → specification/report сохранить;
- `cable-business-flows.layout-glide.spec.ts`:
  - резервуар через old ТЛТ batch;
  - два generic layout-теста оставить;
- `electrical-candidate-selection.param-change.spec.ts`:
  - удалить файл целиком: все три сценария — old ТЛТ/R1/R3.

Не удалять `elec-calculation.spec.ts`, `heat-to-electrical-flow.spec.ts` и
`electrical-case1-p0-regression.spec.ts` по одному старому слову или старому
названию helper. Их текущие TT/fail-closed assertions проверяются отдельно.

## 5. Тесты, которые явно остаются

- `backend/app/tests/unit/services/test_legacy_import_soft_stale.py` — старый
  импорт не становится `ready`;
- `backend/app/tests/unit/test_electrical_result_status.py` — untyped ТЛТ не
  считается успешным;
- `backend/app/tests/unit/api/test_canonical_path_no_legacy_builder.py` —
  запрещает возврат удалённых builders;
- `backend/app/tests/integration/api/test_legacy_electrical_variant_writes.py` —
  тестирует numeric-to-UUID bridge и использует актуальный TT расчёт;
- DB migration/upgrade tests со старыми enum и строками;
- negative tests на unsupported/rejected cable type;
- frontend tests numeric ER/UUID compatibility;
- любые Heat, tank и specification legacy-rejection tests вне электрического
  cable contract.

## 6. Точечные проверки

Общий прогон не выполнять.

1. `git diff --check`.
2. Backend: запустить только изменённые test-модули; сначала `--collect-only`,
   затем обычный focused pytest.
3. Frontend: запустить Vitest только по изменённым файлам.
4. E2E: из `e2e/` выполнить `playwright test --list` для затронутых spec и один
   сохранённый desktop TT-сценарий из каждого смешанного файла.
5. Mobile projects не запускать и не создавать.
6. Выполнить финальный `rg`-аудит. Остаточные legacy tokens разрешены только в
   negative guards, migration/UUID tests и generic fixtures; каждый остаток
   просмотреть вручную, а не требовать слепой нулевой счётчик.

## 7. Коммиты

Не смешивать владельцев и test runners:

1. `test(backend): remove legacy electrical success cases`
2. `test(frontend): remove legacy electrical UI cases`
3. `test(e2e): remove legacy electrical journeys`

В каждый commit входят только тесты своего slice. Production-файлы и чужой WIP
не добавляются даже как checkpoint.

## 8. Критерий готовности

- ни один оставшийся тест не требует успешного расчёта/выбора старого
  ТЛТ/R1/R3;
- актуальные `self_regulating_tt` тесты сохранены;
- stale/reject, UUID bridge и migration tests сохранены;
- изменены только test-файлы и этот план;
- focused проверки зелёные;
- общий прогон и mobile QA честно отмечены как `NOT RUN`.
