# 05. Verification log и evidence

## Revision-bound среда

| Поле | Значение |
|---|---|
| Workspace | `/Users/dmalafey/Desktop/TLT` |
| Date/timezone | 19.07.2026, Europe/Minsk (+03) |
| Current Git | `38f6bb3e44393e46a8b8a2ba88dfd622dccba33c` |
| Commit time/message | `2026-07-19T18:15:47+03:00 fix(spec): close guest-specification audit honesty P0/P1` |
| Backend image ID | `sha256:0792eb90e5c0101fb2d581a7ec9d9a616c2df57bbddcd6f088f60edc8a07b85c` |
| Frontend image ID | `sha256:18a8a6daf0900511d84c22038064098c20c568482448fc02e7a5c42865d72f9e` |
| DB migration | Alembic `0031 (head)` |
| Browser | Chromium through repo Kontur Playwright verifier |
| Viewports | `1440×1000`, `390×844` |
| Current capture window | approximately 18:29–18:44 +03 |

Worktree был dirty до ревалидации. Product code не менялся; изменения ограничены
этой audit folder. Docker frontend/backend использовали bind-mounted current
source, а revision/image/migration записаны выше.

## Provenance старого evidence

`evidence/browser/` был записан примерно 17:16–17:28 и отчёт завершён до 17:55.
Commit `38f6bb3` появился в 18:15. Поэтому этот набор классифицирован как
`HISTORICAL PRE-FIX OBSERVED`.

Ближайший parent commit — `3073df5a238fa870b094a6b4924b921ac3467c18`, но
точный dirty-tree digest при старом capture не сохранялся. Старые screenshots
доказывают дефект «до», но не current state.

Текущие доказательства находятся в `evidence/current-head/`.

## PDF proof

| Проверка | Результат |
|---|---|
| Exact path | `ТНП/1_Кейс_«Расчёт_спецификации_для_неавторизованных_пользователей» (1).pdf` |
| SHA-256 | `5bf9a5f12f1ea609e7889f12dbbf4dbc24be8653258ea0e65f3d691d19fc978d` |
| `pdfinfo` | 81 A4 pages |
| `pdftotext -layout` | literal text rechecked for pages 7, 16, 28–29, 47–49, 56–60 |
| Poppler render | 81 page images previously generated in `tmp/pdfs/guest-spec-case-audit/pages` |
| Corrected attribution | page 49 has aggregate object fields/status; no mandatory group/tree hierarchy |

Source images:

- [page 21 input](../../tnp/cases/guest-specification/assets/pdf/page-21-input-ui.png)
- [page 35 electrical](../../tnp/cases/guest-specification/assets/pdf/page-35-electrical-ui.png)
- [page 49 aggregate object row](../../tnp/cases/guest-specification/assets/pdf/page-49-section-ui.png)
- [page 56 specification](../../tnp/cases/guest-specification/assets/pdf/page-56-specification-ui.png)

## Current live user flow

Все mutation выполнены через видимые controls.

1. Открыт Home; подтверждено `3 дня` и три start cards.
2. Guest entry создал один project.
3. Создан валидный pipe 108×4 мм, 10 м, −20/+20 °C, wind 5, alpha 25,
   insulation 50 мм, lambda 0.04, range −60…120 °C.
4. UI показал `q=15.0 Вт/м`, `Q=165 Вт`.
5. Создан `ЭР1`, object назначен `Самрег`, выполнен batch recalc.
6. Получен ТЛТ-20: installed 10.0 м, final order 11.0 м, 200 Вт, 0.91 А.
7. На specification нажато `Сформировать`.
8. Первый POST вернул expected 409 preflight: 0 skipped objects, две excluded
   groups.
9. Modal показал ошибочное `Всего исключений: 0`; нажато confirmation.
10. Второй POST вернул 201: 6 items, `partial=true`, оба group codes.
11. UI показал `НЕПОЛНАЯ` и persistent warning.
12. Выполнен same-URL reload; status/codes сохранились.
13. DB row подтвердил `generation_options.is_partial=true`, skipped=0, обе
    groups, `is_stale=false`.
14. Report preview вернул 200 и показал partial diagnostics.
15. `window.print` заменён счётчиком только для проверки handler; click кнопки
    `Печать отчёта` увеличил счётчик до 1.
16. Сняты desktop/narrow screenshots, accessibility snapshots и geometry.
17. После UI flow запущен `db-invariants`: 28 checks, 0 violations.

## Current browser/API evidence

- [409 preflight response](evidence/current-head/specification-preflight-409-response.json)
- [preflight modal false-zero screenshot](evidence/current-head/specification-preflight-modal-zero-desktop-1440x1000.png)
- [preflight modal snapshot](evidence/current-head/specification-preflight-modal-zero-desktop-snapshot.md)
- [generation network list](evidence/current-head/specification-generate-network.md)
- [201 request](evidence/current-head/specification-generate-201-request.json)
- [201 response](evidence/current-head/specification-generate-201-response.json)
- [spec after reload](evidence/current-head/specification-partial-after-reload-snapshot.md)
- [report preview response](evidence/current-head/report-preview-response.html)
- [print handler proof](evidence/current-head/report-print-handler-proof.json)
- [console entries](evidence/current-head/browser-console-errors.txt)

Console entries: два Ant Design static-message/theme warnings и expected
network 409 preflight entry. Unexpected request failures после confirmation не
обнаружены.

## Current screenshots

### Desktop

- [Home](evidence/current-head/home-desktop-1440x1000.png)
- [Heat](evidence/current-head/heat-populated-desktop-1440x1000.png)
- [Electrical](evidence/current-head/electrical-calculated-desktop-1440x1000.png)
- [Partial specification](evidence/current-head/specification-partial-desktop-1440x1000.png)
- [Partial report](evidence/current-head/report-partial-desktop-1440x1000.png)

### Narrow known-limitation proof

- [Home 390](evidence/current-head/home-mobile-390x844.png)
- [Specification 390](evidence/current-head/specification-partial-mobile-390x844.png)
- [Report 390](evidence/current-head/report-partial-mobile-390x844.png)

Названия содержат viewport, не обязательно bitmap/full-page dimensions.

## Geometry/readability

| State | Result |
|---|---|
| Heat populated desktop | document 1440 px, no page horizontal overflow/outside elements; canvas row/result verified by screenshot, not DOM text probe |
| Electrical desktop | document 1440 px, no page overflow, 0 text clipping candidates; grid scroller +2 px |
| Specification desktop | document 1440 px, no horizontal overflow, no outside elements; Ant ellipsis candidates визуально читаемы |
| Report desktop | no page horizontal overflow; partial warning/print visible; raw UUID/status detected |
| Specification 390 | document 554 px for viewport 390, horizontal overflow, table outside viewport |
| Report 390 | page width 390, but internal tables outside viewport up to ~942 px |

Evidence:
[heat geometry](evidence/current-head/heat-populated-desktop-geometry.json),
[electrical geometry](evidence/current-head/electrical-desktop-geometry.json),
[spec desktop](evidence/current-head/specification-partial-desktop-geometry.json),
[spec narrow](evidence/current-head/specification-partial-mobile-geometry.json),
[report desktop](evidence/current-head/report-partial-desktop-geometry.json),
[report narrow](evidence/current-head/report-partial-mobile-geometry.json).

PDL-ER-30 делает interactive width ниже 1280 known limitation; narrow results
не присвоены desktop FAIL, но print adaptation ими не доказана.

## Commands и текущие результаты

| Command/suite | Result |
|---|---|
| `scripts/codex-functional-audit.sh contracts` | PASS: 5/5 |
| `scripts/codex-functional-audit.sh db-invariants` | PASS: 28, violations 0, после live flow |
| `scripts/codex-functional-audit.sh layout` | PASS: 9/9 |
| `scripts/codex-functional-audit.sh accessibility` | PASS: 6/6 |
| `scripts/formula-qa.sh quick` | **FAIL:** formula block green; 7 service-guard failures |
| `pytest test_spec_full_builder.py` | PASS: 25/25 |
| specification builder/service/API focused subset | PASS: 54/54 |
| report integration + no-mixing | PASS: 16/16 |
| broader spec/report backend subset including report-service unit | **FAIL:** 4 outdated mock signature assertions |
| focused Home/Specification/Report Vitest | PASS: 25/25 |
| `npm --prefix frontend test -- --run` | PASS: 181 files / 1056 tests |
| `npm --prefix frontend run lint` | **FAIL:** 3 errors, 3 warnings |
| `npm --prefix frontend run typecheck` | **FAIL:** 2 unused declarations |
| `npm --prefix frontend run build` | **FAIL:** same 2 TypeScript errors |

### Exact backend focused commands

```text
docker exec heatcalc_backend pytest \
  app/tests/unit/formulas/test_spec_full_builder.py \
  app/tests/unit/services/test_specification_service_unit.py \
  app/tests/integration/api/test_specifications.py \
  -q --tb=short --no-cov

docker exec heatcalc_backend pytest \
  app/tests/integration/api/test_reports.py \
  app/tests/integration/api/test_report_no_mixing.py \
  -q --tb=short --no-cov
```

Static wrapper из Kontur plugin был запущен, но вычислил repo root внутри plugin
cache и искал `.../plugins/cache/personal/frontend/package.json`. Эквивалентные
lint/typecheck/test/build commands поэтому выполнены вручную. Сам browser proof
выполнен repo Kontur Playwright verifier.

## Красные gates

`formula-qa quick`:

- stale electrical mock exhausts an added assignment query;
- batch chunk expected 5, got 2;
- yield/mixed-success/coefficient-cache/climate-index/progress mocks исчерпывают
  DB side effects.

Backend report unit:

- четыре assertions ожидают `_load_context(..., variant_number=1)`;
- current call также передаёт `electrical_variant_id=None` и
  `electrical_variant_name=None`.

Frontend:

- unused `_omit` в test;
- unused `Segmented` и `firstSupportedVariant` в `ReportPage`;
- three hook/fast-refresh warnings.

## Residual risk / не проверено

- official section numeric catalog отсутствует;
- official Ex/Rгр matrix отсутствует;
- 500 objects × 5 ER wall-clock target не доказан;
- real browser print-preview/save-to-PDF/page-break rendering не проверены;
- Firefox/Opera/Yandex matrix не запускалась;
- employee DOCX/XLSX partial diagnostics и corporate templates не проверены;
- full adversarial CSV limits/trust run не выполнялся;
- expired-session revival и two-commit fault не воспроизводились live;
- latent connector/box paths проверены probe/code, но production специально
  заблокирован источниками.

Итог разделён: current partial UI/report `PASS`; complete procurement result
`FAIL`; external section/box truth `BLOCKED_SOURCE`; print/export/scale portions
`NEEDS VERIFICATION`.
