# 02. Поэкранный аудит текущего UI

Baseline: `38f6bb3`. Desktop proof выполнен на `1440×1000`, known-limitation
proof — на `390×844`. Старые изображения в `evidence/browser/` относятся к
pre-fix состоянию; ссылки ниже по умолчанию ведут в `evidence/current-head/`.

## 1. Стартовый экран

**Подтверждено сейчас**

- guest action открывает один auto-project;
- copy сообщает sliding срок `3 дня`, а не прежние 20 минут;
- desktop и narrow layouts не имеют page overflow;
- local save recovery объяснён рядом с guest action.

**Осталось**

| Наблюдение | Класс | Вердикт |
|---|---|---|
| Три cards: guest, employee, admin | `PRIMARY_PDF` стр. 16 определяет два варианта | P2 contract drift; перенести admin entry — рекомендуемое решение, не единственно допустимый способ |
| Нет явного expiry/recovery состояния | PDL-ER-26 / session SRS | OPEN: frontend на 401 автоматически создаёт новую guest session/project |
| Нет remaining-time indicator | `RECOMMENDATION` | Не выдавать за прямое требование PDL |

Evidence: [desktop](evidence/current-head/home-desktop-1440x1000.png),
[mobile](evidence/current-head/home-mobile-390x844.png),
`HomePage.tsx:60,128-146`.

**Итог:** TTL copy `PASS`; start action model `P2 DRIFT`; strict expiry `OPEN`.

## 2. Шапка, навигация и workflow

**Полезно:** четыре раздела, heat/electrical counters, download/upload и scoped
ЭР navigation помогают ориентироваться.

**Текущие UX gaps:**

- narrow warning содержит внутренние `Phase 5`/`PDL-ER-30`;
- copy о «разблокировке следующего шага» не совпадает со свободной навигацией;
- route можно открыть заранее, хотя mutation позже gate-ится empty/readiness
  state;
- partial status теперь виден внутри specification/report, но общий step
  indicator по-прежнему не передаёт `partial/stale/blocked`.

Жёсткий disabled route не является прямым PDL-требованием. Корректный finding —
несогласованность copy/status model; конкретный navigation design —
`RECOMMENDATION`.

## 3. Теплотехнический расчёт

### Текущий live результат

Видимым UI создан валидный pipe:

| Input/result | Значение |
|---|---:|
| OD / wall / length | 108 мм / 4 мм / 10 м |
| Ambient / process | −20 / +20 °C |
| Wind / alpha | 5 м/с / 25 Вт/(м²·К) |
| Insulation / lambda | 50 мм / 0.04 Вт/(м·К) |
| Temperature range | −60…120 °C |
| `q` | 15.0 Вт/м |
| `Q` | 165 Вт |

`Q=165 Вт` — текущий объект без local fittings. Старое `Q=214 Вт` в pre-fix
evidence относится к другому input set и не используется как current oracle.

Evidence: [populated heat UI](evidence/current-head/heat-populated-desktop-1440x1000.png).

### Соответствует

- flat embedded form и отдельные pipe/tank scopes;
- units проходят UI → API → persisted result;
- после валидного save показываются `q`, `Q` и status;
- object mutation помечает downstream electrical/spec stale.

### Требует решения/упрощения

- `PRIMARY_PDF` стр. 28 говорит: invalid object не создаётся. Current editor
  (`useHeatCalcObjectEditor.ts:113`) поддерживает уже persisted invalid pipe/tank
  и оставляет его в edit mode. Это либо contract defect, либо неутверждённая
  draft-row модель. Нужен product decision, а не подмена PDF формулировкой;
- primary и rarely changed settings показаны одновременно; сворачивание
  advanced parameters — UX-рекомендация, PDF требует данные, а не постоянную
  одновременную видимость всех controls;
- полная formula/source/input traceability в normal result отсутствует;
- 390 px не входит в interactive target: form/grid становятся плотными. Это
  known limitation PDL-ER-30, не desktop release blocker.

**Итог:** calculation core `PASS/PARTIAL`; invalid-create contract `OPEN`;
traceability `OPEN`.

## 4. Электротехнический расчёт

### Текущий live результат

В `ЭР1` pipe назначен в `Самрег`, batch recalc завершён:

```text
Heat Q = 165 Вт
→ ТЛТ-20, 20 Вт/м
→ installed length = 10.0 м
→ final order length = 11.0 м
→ power = 200 Вт
→ current = 0.91 А при 220 В
```

Evidence: [electrical desktop](evidence/current-head/electrical-calculated-desktop-1440x1000.png),
[geometry](evidence/current-head/electrical-desktop-geometry.json).

### Соответствует

- именованные UUID ЭР, create/copy/rename/delete lifecycle;
- assignment scoped selected ER;
- installed и order length не смешиваются в calculation/report;
- power/current считаются от installed length;
- selection mark, criterion и reason доходят до report;
- desktop page has no horizontal overflow and populated geometry found no text
  clipping candidates.

### Не доказано / требует изменения

- официальный section calculation отсутствует. Production теперь честно
  исключает section-dependent BOM; это `FAIL-CLOSED PASS`, не скрытая подмена;
- PDF стр. 49 **не требует** tree `объект → группы → секции`. Отсутствие tree
  отозвано как direct finding. После появления source UI должен показать
  literal required section/object metrics, но конкретная визуальная структура
  требует отдельного решения;
- зелёная electrical success допустима для доказанного cable selection, однако
  не должна означать готовность полного закупочного BOM;
- normal UI не показывает полный formula/data/input identity;
- lifecycle/assignment/parameters/grid одновременно создают плотный экран;
  compact secondary actions — рекомендация;
- 390 px toolbars/grid не являются поддержанным interactive target.

**Итог:** cable/ER core `PASS`; section source `BLOCKED`; full-BOM readiness
`PARTIAL`.

## 5. Спецификация

### Что сейчас работает

- explicit ER selector + `Выбрать все`;
- один canonical `full` mode без basic/full switch;
- guest не видит manual Add/Delete;
- Ex/K1i/K2i/Kiu/Rгр находятся в одном parameters panel;
- generation 1: backend вернул 409 с двумя excluded groups;
- после confirmation generation 2: HTTP 201, `partial=true`, 6 proven rows;
- header показывает `ЭР1 · НЕПОЛНАЯ`, persistent banner перечисляет оба codes;
- partial состояние и codes пережили reload и сохранены в DB;
- desktop 1440: нет page overflow/outside elements.

Evidence:
[409](evidence/current-head/specification-preflight-409-response.json),
[modal with false zero](evidence/current-head/specification-preflight-modal-zero-desktop-1440x1000.png),
[201](evidence/current-head/specification-generate-201-response.json),
[desktop](evidence/current-head/specification-partial-desktop-1440x1000.png),
[after reload](evidence/current-head/specification-partial-after-reload-snapshot.md),
[DB/geometry proof](evidence/current-head/specification-partial-desktop-geometry.json).

Прежний finding «UI пишет full и скрывает partial» имеет статус
`HISTORICAL_FAIL → CLOSED@38f6bb3`.

### Текущие дефекты

1. **Preflight modal искажает данные.** 409 body содержит 0 skipped objects и
   две excluded groups; modal пишет `Всего исключений: 0` и не перечисляет
   groups. `SpecificationPage.tsx:299` использует только
   `total_skipped_objects`.
2. **Preflight не snapshot-safe.** Нет token/revision; generation lock берётся
   позже. Multi-ER preflight вызывается без текущих `req.options`, тогда как
   generation получает options.
3. **Grouping не реализован backend.** Все live rows имеют
   `params.bom_section=common`; presentation selector не может восстановить
   pipe/tank/common.
4. **Supplier отсутствует.** Literal PDF стр. 60 требует field `supplier, если
   указан`; его нет в `SpecificationItem` и table.
5. **Internal copy остаётся.** `PDL-ER-29`, `Project defaults v1`, `snapshot v1`
   полезны диагностике, но перегружают normal guest task.
6. **Static full-BOM copy двусмыслен.** Он обещает boxes/kits, но persistent
   warning теперь сразу уточняет исключения. Это clarity issue, больше не silent
   masking.

На 390 px document width = 554 при viewport 390; это known interactive
limitation. Evidence: [narrow](evidence/current-head/specification-partial-mobile-390x844.png),
[geometry](evidence/current-head/specification-partial-mobile-geometry.json).

**Итог:** partial honesty/persistence `PASS`; procurement completeness `FAIL`;
preflight detail/grouping/supplier `OPEN`.

## 6. Отчёт

### Что сейчас работает

- guest HTML preview и ER selector;
- heat, electrical и specification sections в одном report;
- partial warning и оба excluded group codes;
- guest button `Печать`; controlled click вызвал `window.print()` ровно 1 раз;
- server PDF/DOCX/XLSX actions остаются employee-only;
- desktop report не создаёт page-level horizontal overflow.

Evidence: [desktop report](evidence/current-head/report-partial-desktop-1440x1000.png),
[snapshot](evidence/current-head/report-partial-desktop-snapshot.md),
[preview response](evidence/current-head/report-preview-response.html),
[print handler](evidence/current-head/report-print-handler-proof.json).

Прежние findings «print отсутствует» и «partial report выглядит полным» закрыты
на текущем HEAD.

### Осталось

- real browser print-preview/PDF, page breaks и warning visibility под print
  media не проверены; handler/CSS presence не равны визуальному print PASS;
- raw project UUID, `ProjectStatus.draft` и material `other` видны пользователю;
- report показывает order summary 11.0 м и installed electrical row 10.0 м — это
  правильно, но labels должны исключать неоднозначность;
- DOCX/XLSX partial diagnostics не доказаны;
- на 390 px document itself не overflow-ит, но report tables выходят далеко за
  viewport (до ~942 px) и часть колонок не видна. PDL требует adaptive print,
  поэтому этот риск остаётся даже при unsupported interactive width.

Evidence: [narrow report](evidence/current-head/report-partial-mobile-390x844.png),
[geometry](evidence/current-head/report-partial-mobile-geometry.json).

**Итог:** HTML preview/partial/print handler `PASS`; real print layout
`NEEDS VERIFICATION`; localization `OPEN`.

## 7. Responsive итог

| Экран | 1440×1000 | 390×844 | Contract result |
|---|---|---|---|
| Start | читаем | читаем | layout PASS; third-card P2 drift |
| Heat | рабочий | unsupported/dense | desktop scope PASS |
| Electrical | no page overflow/clipping candidates | unsupported grid/toolbars | desktop scope PASS |
| Specification | no page overflow; partial visible | 554 px document, overflow | desktop partial UI PASS; full BOM FAIL |
| Report | no page overflow; partial/print visible | tables outside viewport | HTML PASS; print layout unverified |

PDL-ER-30 делает interactive width `<1280` known limitation. Поэтому mobile
evidence не переопределяет desktop acceptance, но и не доказывает adaptive
print.
