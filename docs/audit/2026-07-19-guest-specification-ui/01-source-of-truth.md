# 01. Source of truth и актуальность требований

## Правило источников

Для каждой записи сначала определяется класс источника:

1. `APPROVED_PDL` — явные решения
   [PDL-ER-01…41](../../tnp/cases/guest-specification/product-decisions.md).
2. `PRIMARY_PDF` — буквальный текст переданного PDF там, где PDL не изменяет
   решение.
3. `NORMATIVE_SRS` — актуальные SRS/UC без supersession/conflict.
4. `DERIVED_INTERNAL` — normalized requirements, analyses, prompts, checkpoints,
   source mappings и QA docs. Они помогают найти правило, но сами не доказывают,
   что оно было в PDF.
5. `OBSERVED` — код, API, DB, UI, screenshots и тесты на конкретной revision.
6. `RECOMMENDATION` — предложенный UX/architecture.

Код и зелёный test фиксируют реализацию, но не заменяют бизнес-oracle. Старый
screenshot не используется как текущий факт после изменения revision.

## Паспорт первичного PDF

| Поле | Значение |
|---|---|
| Файл | `ТНП/1_Кейс_«Расчёт_спецификации_для_неавторизованных_пользователей» (1).pdf` |
| Редакция / дата | 4 / 07.07.2026 |
| Страницы | 81, A4 |
| SHA-256 | `5bf9a5f12f1ea609e7889f12dbbf4dbc24be8653258ea0e65f3d691d19fc978d` |
| Проверка | `pdfinfo`, `pdftotext -layout`, Poppler render 81 страниц, detail review ключевых страниц |

[pdf-requirements.md](../../tnp/cases/guest-specification/pdf-requirements.md)
и [pdf-page-index.md](../../tnp/cases/guest-specification/pdf-page-index.md) —
полезные `DERIVED_INTERNAL` mappings. В спорной записи всегда повторно открыт
сам PDF.

## Что PDF действительно говорит о UI

| Тема | Literal PDF | Вывод |
|---|---|---|
| Старт | стр. 16: два варианта — `Начать без регистрации`, `Войти с паролем` | Третья admin-card — дополнительный UI и P2 drift; способ её удаления/переноса является рекомендацией |
| Guest project | стр. 7, 16: один временный проект, local save/open, удаление после 3 дней без активности | Current Home `3 дня` соответствует; DB implementation разрешено PDL-ER-26 |
| Invalid create | стр. 28: при ошибке объект не создаётся, поля подсвечиваются, введённые значения сохраняются в форме | Current persisted invalid row расходится с literal PDF, пока draft behavior не утверждено отдельно |
| Section formula | стр. 47–48: `Lток`, `Lогр`, `N`, одинаковая длина/параметры, `Lфакт` | Требуются числовой source и проверяемый алгоритм |
| Section display | стр. 49: агрегированная строка объекта с маркой, числом ниток, общей длиной, теплопотерями, мощностью, токами и статусом | PDF **не** задаёт обязательное дерево `объект → группы → секции` |
| Spec grouping | стр. 59: отдельные sections по типам или merge по базе+коду | PDL-ER-38 выбирает default pipe/tank/common и optional merge |
| Spec columns | стр. 60: name, mark, nomenclature code, supplier if set, supply unit, quantity | Current supplier field отсутствует |
| Report/export | стр. 7 и 60 содержат неоднозначность guest report/export | PDL-ER-05/39/40 разрешает guest HTML preview + browser print и запрещает guest server exports |

Канонические изображения исходника:

- [стр. 21 — исходные данные](../../tnp/cases/guest-specification/assets/pdf/page-21-input-ui.png)
- [стр. 35 — электротехнический расчёт](../../tnp/cases/guest-specification/assets/pdf/page-35-electrical-ui.png)
- [стр. 49 — агрегированная строка объекта](../../tnp/cases/guest-specification/assets/pdf/page-49-section-ui.png)
- [стр. 56 — страница спецификации](../../tnp/cases/guest-specification/assets/pdf/page-56-specification-ui.png)

## Актуальные supersession decisions

| Тема | Актуальный контракт | UI/flow consequence |
|---|---|---|
| Storage/TTL | PDL-ER-26: temporary PostgreSQL project, sliding TTL 3 days | строгий request-time expiry и понятное recovery; countdown не обязателен буквальным PDL |
| ER identity | именованные UUID, 1…5 | dynamic current tabs сильнее legacy CO1…CO4 |
| Resistive | PDL-ER-10 сохраняет working resistive flow | нельзя убирать только ради старого макета |
| Sections | PDL-ER-03/15/18…25/28: auto, no direct editor, fail-closed без source | dependent BOM исключается; конкретный tree-view не предписан |
| Cable BOM length | PDL-ER-02: final commercial order; installed отдельно | current builder priority теперь корректен |
| Spec scope | PDL-ER-01: explicit UUID list + `Выбрать все` | current selector соответствует |
| BOM mode | PDL-ER-29: один full data-driven mode | basic/full switch не нужен; `mode=full` не равно `partial=false` |
| Partial/preflight | PDL-ER-32/35/36: fail-closed, diagnostics, confirm | groups должны быть видны до mutation и после reload/report |
| Stale | PDL-ER-37: read-only, исключить из output | current backend/UI fix соответствует |
| Grouping | PDL-ER-38: pipe/tank/common, optional base+code merge | current all-common builder не соответствует |
| Guest report | PDL-ER-05/39/40 + UC-G-18 | browser print доступен; real print render ещё не доказан |
| Width | PDL-ER-30: interactive ≥1280, warning below; print adaptive | mobile interactive defects — known limitation; print remains separate acceptance |
| CSV | PDL-ER-41: v3 manifest/trust rules | calculation/spec snapshots нельзя принимать без совместимого source identity |

`mode="full"` в API означает выбранный канонический алгоритм, а не обещание,
что результат закупочно полный. Полнота определяется `partial/excluded_groups`.

## Внешние блокеры

### Section source

Нет утверждённого artifact с `Lmax`, `Iдоп`, прямым `Iст.уд`, voltage,
cold-start temperature и source-defined rounding. Current production корректно
возвращает `SECTION_DATA_SOURCE_MISSING` и исключает Nсек-dependent rows.

Статус: `BLOCKED_SOURCE / FAIL-CLOSED PASS`, а не текущая ошибка
`num_circuits`.

### Boxes Ex/Rгр

Нет утверждённой per-row matrix. Current production возвращает
`BOX_EX_RGR_MATRIX_MISSING` и исключает зависимые rows. При искусственно
включённой matrix latent implementation всё ещё не повторяет literal row-driven
PDF algorithm.

### Scale 500 × 5

PDL-ER-27 задаёт целевую шкалу, но runtime guard 50 сохраняется до wall-clock
evidence. UI не должен обещать доказанную производительность 500 объектов без
performance run.

## Документационный drift

- legacy guest electrical SRS всё ещё содержит CO1…CO4;
- legacy specification SRS показывает basic/accessory layout;
- часть business/formula docs сохраняет старые guest TTL/access rules;
- `business-formula-contracts.json` регистрирует 5 широких contracts, но не
  section/full-BOM pipeline;
- Phase-5 checkpoint PASS по grouping остаётся неверным; preflight/stale/print
  части уже исправлены и не должны повторно называться текущими FAIL;
- некоторые spec/report E2E допускают несколько error outcomes и устаревший
  empty-state copy.

## Документы, фактически проверенные

- обязательные `codex-docs/README.md`, `project-map.md`, `requirements-map.md`,
  `testing.md`, `business-formula-contracts.json`;
- `formules.md`, `coefficients.MD`, formula summary и validation playbook;
- `docs/api.md`, business rules, `docs/srs.md`, `docs/srs/`, TZ compliance;
- relevant `docs/qa/` guest/auth/object/electrical/spec/report cases;
- primary PDF, product decisions, normalized PDF mapping, Phase 4/5 checkpoints,
  source mappings и historical traceability evidence.

