# 04. Findings и приоритеты

Ниже — **аудиторская triage-рекомендация**, а не утверждённая продуктовая
severity. Все исходные FA-01…FA-19 и новые записи FA-20…FA-22 перечислены в
[реестре](00-revalidation-ledger.md). Закрытые дефекты не выдаются за текущие.

## P0 recommendation — не принимать как полный закупочный BOM

### FA-02. Нет утверждённого section source

- **Contract:** `PRIMARY_PDF` стр. 47–49; PDL-ER-15/18…25/28.
- **Current:** production корректно fail-closed и возвращает
  `SECTION_DATA_SOURCE_MISSING`; dependent rows не формируются.
- **Status:** `BLOCKED_SOURCE / FAIL-CLOSED PASS`.
- **Acceptance:** зарегистрированный immutable numeric artifact, source/version,
  golden + boundary + metamorphic tests, persisted trace и UI literal metrics.

### FA-04. Post-unblock accessory algorithms не готовы

- connector enabled-path: КСН-1=9 и КСН-2=18 вместо выбранного КСН-2=5;
- box enabled-path: одна hard-coded bucket row вместо multi-row PDF algorithm;
- glue: `0.14` undercounts boundary 50 kits (7 вместо 8);
- glass tape: `0.0333334` overcounts exact 30 m boundary (2 вместо 1).

Production сейчас не эмитит connector/box rows из-за fail-closed source block,
поэтому это latent acceptance blockers, а не текущая скрытая выдача.

### FA-08. Typed grouping не реализован

- **Contract:** literal PDF стр. 59 + PDL-ER-38.
- **Current:** cable агрегируется до split; generated rows имеют
  `bom_section=common`; UI selector меняет только presentation.
- **Acceptance:** typed calculation first; default pipe/tank/common; merge только
  после расчёта по совпадению base+code; exact probe 11+22 сохраняет две rows
  при merge=false.

### FA-06 / FA-20. Preflight modal вводит в заблуждение

- 409 содержит две excluded groups и 0 skipped objects;
- modal показывает `Всего исключений: 0` и не перечисляет groups;
- нет immutable token/revision между preflight и generation;
- multi-ER preflight вызывается без `req.options`, generation — с options.

Evidence: [409 body](evidence/current-head/specification-preflight-409-response.json),
[modal screenshot](evidence/current-head/specification-preflight-modal-zero-desktop-1440x1000.png).

**Acceptance:** per-ER objects и groups показаны одним списком; total считает
оба класса; options одинаковы; confirmation связано с immutable revision и
atomic generation.

## P1 recommendation — correctness, persistence и output

### FA-05. Partial persistence закрыта не полностью

`is_partial`, excluded groups и skipped count теперь проходят DB → GET → UI →
HTML-report. Осталось доказать/добавить full per-object details и diagnostics в
DOCX/XLSX/CSV round trip. Status `PARTIAL`.

### FA-10. Formula/catalog traceability неполна

Часть BOM rows содержит catalog source/version/code, но heat/electrical/BOM не
имеют единого immutable trail:

```text
formula_id + formula version + data source/version + units + input snapshot
+ result category + diagnostic code + ER/project identity
```

Это нужно проверять в DB, GET, reload, report и CSV, а не только показывать
technical IDs в normal UI.

### FA-11. TTL strict expiry не реализован

- Home copy `3 дня` исправлен;
- dependency проверяет только наличие GuestSession, затем touch-ит activity;
- до cleanup старая row может ожить;
- frontend на 401 автоматически создаёт новый guest project без явного expiry
  decision пользователя.

**Acceptance:** request-time age check до touch, stable code, explicit recovery
UX, no silent data replacement, cleanup/revival/cross-session tests.

### FA-12. CSV trust и scale guards

Остаются gaps в formula/catalog manifest, trust calculated/spec snapshots,
recomputation/stale semantics и row/object boundaries. Нужны atomic 10 MB / row /
50 / 500 boundaries и adversarial round-trip evidence.

### FA-14. Release quality gate красный

Current rerun:

- frontend lint: 3 errors, 3 warnings;
- typecheck/build: 2 `TS6133` в `ReportPage.tsx`;
- `formula-qa quick`: 7 service-guard failures;
- report-service unit subset: 4 failures из-за `_load_context` signature drift.

Assertions не ослаблять. Для каждого expected change нужен источник нового
контракта.

### FA-15. ER5 paths не единообразны

UUID lifecycle и многие APIs поддерживают 1…5, но legacy frontend store и
candidate/folder service guards сохраняют 1…4. Legacy-v2 import slot-5 —
отдельный contract decision; mismatch нельзя исправлять простым обновлением
golden без решения.

### FA-19. Guest session и auto-project создаются двумя commit

Первый commit создаёт session, второй — project. Failure второго шага оставляет
orphan session. Acceptance: одна transaction либо доказанная compensation +
fault-injection test.

### FA-21. Supplier отсутствует

- **Contract:** literal PDF стр. 60 — `поставщик, если указан`.
- **Current:** `SpecificationItem` содержит category/name/article/unit/quantity/
  params/source; supplier column отсутствует в API/UI/report table.
- **Acceptance:** nullable supplier из выбранной catalog base проходит builder,
  persistence, GET, grouping identity decision, UI и report/export.

### FA-22. Invalid object create расходится с PDF

- **Contract:** literal PDF стр. 28 — invalid object не создаётся, values
  остаются в форме.
- **Current:** UI намеренно продолжает редактирование уже persisted invalid
  pipe/tank.
- **Status:** `OPEN / NEEDS PRODUCT DECISION`.
- **Acceptance:** либо atomic reject, либо approved supersession с явным draft
  status, downstream exclusion, persistence/reload semantics и tests.

## P2 recommendation — UI clarity

### FA-16. Technical copy и стартовая структура

- PDF стр. 16 показывает два start choices; current UI добавляет admin card;
- spec/report выводят `PDL-*`, `Project defaults`, raw UUID,
  `ProjectStatus.draft`, `other`.

Два действия — primary contract observation; конкретный способ переноса admin и
скрытия technical trace — UX recommendation.

### FA-17. Copy о workflow не совпадает с routes

Изменить текст на рекомендуемую последовательность либо добавить status-aware
readiness behavior. Disabled route сам по себе не является прямым PDL contract.

### FA-18. Narrow interactive UI

PDL-ER-30 поддерживает interactive flow от 1280 px, поэтому 390 px не desktop
blocker. Но warning должен быть human-readable, а print layout обязан быть
адаптивным. Current narrow spec width 554; report tables выходят до ~942 px.

## Закрытые на `38f6bb3`

| ID | Закрытая проблема | Current evidence |
|---|---|---|
| FA-01 | partial masquerading as full | header/banner + reload + report + DB |
| FA-03 | raw order before commercial final | builder priority + 110/120 test |
| FA-07 | stale Add/Delete/reset | backend 409 + disabled UI + tests |
| FA-09 | guest print отсутствовал | button + one `window.print()` call + CSS; render proof остаётся отдельным risk |
| FA-04(old glue) | repair kits игнорировались | 8+7 now →3 |
| FA-04(old glass) | double reserve | 100 m oracle now →11 |
| FA-11(copy) | Home обещал 20 минут | current screenshot/code: 3 дня |

Historical screenshots остаются доказательством «до», но не основанием вновь
открывать закрытый defect без current reproduction.

## Рекомендуемый порядок работ

1. Исправить preflight total/details/options/snapshot, потому что он сейчас
   неправильно объясняет уже корректный backend partial.
2. Утвердить и зарегистрировать section catalog и Ex/Rгр matrix; до этого
   сохранить fail-closed.
3. До включения sources закрыть connector/box/exact-divisor tests и typed
   grouping.
4. Добавить supplier и полный trace/round trip.
5. Закрыть TTL/CSV/ER5/transaction gaps и красные gates.
6. Выполнить real print-preview/PDF visual proof и очистить normal UI copy.
