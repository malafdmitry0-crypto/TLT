# Журнал проверки

Дата проверки: 18.07.2026. Режим: `/audit-only`; исходный код, тесты,
конфигурация и схема БД не изменялись.

## PDF

| Проверка | Результат |
|---|---|
| `pdfinfo` | PASS: 81 страница A4, PDF 1.7, без шифрования, форм и JavaScript. |
| `shasum -a 256` | PASS: `5bf9a5f12f1ea609e7889f12dbbf4dbc24be8653258ea0e65f3d691d19fc978d`. |
| `pdftotext -layout` | PASS: извлечено 4098 строк с сохранением постраничных разрывов. |
| `pdftoppm -png -r 110` | PASS: получено 81 изображение. |
| Визуальная проверка | PASS: просмотрены страницы 1–81; отдельно сохранены макеты страниц 21, 35, 49 и 56. |

## Живой стек и пользовательский сценарий

| Проверка | Результат |
|---|---|
| `make dev-d` / `make ps` | PASS: frontend, backend, PostgreSQL и Redis healthy; worker запущен. |
| Guest entry, `1440x1000` | PASS: `POST /api/v1/auth/guest` → 201; автоматически открыт проект «Мой проект». |
| Создание трубы видимыми действиями | PASS: `POST /objects` → 201; после refetch/reload объект и теплопотери видны. UI-поля `108 мм` и `50 мм` переданы как `0.108 м` и `0.05 м`. Evidence: [request](evidence/api/guest-audit-object-create-request-body.json), [response](evidence/api/guest-audit-object-create-response-body.json). |
| Gate перехода | FAIL: electrical/specification/report доступны из header до успешного electrical calculation. |
| Генерация spec без electrical | **FAIL:** UI предупреждает о необходимости шага 2, но `POST /specifications/.../generate?variant=1` → 201 и возвращает 6 аксессуаров, `skipped_objects=0`. Evidence: [response](evidence/api/guest-audit-spec-generate-response-body.json). |
| Report propagation | FAIL: отчёт показывает 6 ложных позиций спецификации одновременно с `Электротехнический расчёт (0)`. |
| Console | PARTIAL: business-request failures не зафиксированы; есть `favicon.ico` 404 и Ant Design warning о static message без theme context. |

## UI geometry и screenshots

Проверены desktop `1440x1000` и mobile `390x844` на реальном приложении.

| Состояние | Результат / evidence |
|---|---|
| Home desktop/mobile | PASS по overflow; PDF mismatch: три role-card вместо двух стартовых действий. [desktop](assets/ui/guest-audit-home-desktop.png), [mobile](assets/ui/guest-audit-home-mobile.png). |
| Heat empty/populated desktop | PASS по page-level overflow; рабочая форма и таблица загружаются. [empty](assets/ui/guest-audit-heat-empty-desktop.png), [populated](assets/ui/guest-audit-heat-populated-desktop.png). |
| Electrical desktop | FAIL относительно PDF: фиксированные `СО1…СО4`, нет динамических именованных ЭР, распределения и секций. [screenshot](assets/ui/guest-audit-electrical-empty-desktop.png). |
| Specification empty desktop | PARTIAL: корректное пустое предупреждение, но кнопка не заблокирована. [screenshot](assets/ui/guest-audit-spec-empty-desktop.png). |
| Specification after invalid generation | FAIL: 6 позиций без electrical. [desktop](assets/ui/guest-audit-spec-without-electrical-desktop.png), [mobile](assets/ui/guest-audit-spec-without-electrical-mobile.png). |
| Report desktop/mobile | FAIL по business content; mobile использует внутренний горизонтальный scroll для широкой таблицы. [desktop](assets/ui/guest-audit-report-desktop.png), [mobile](assets/ui/guest-audit-report-mobile.png). |
| Heat populated mobile | **FAIL:** page-level horizontal scroll `393 > 390`, подписи `9px`, обрезаны единицы `мм/шт/°C/м/с/Вт/мК`, desktop-колонки сжаты до посимвольного переноса. [screenshot](assets/ui/guest-audit-heat-populated-mobile.png), [geometry](evidence/layout/guest-audit-heat-mobile-geometry.json). |
| Specification mobile geometry | PASS по clipping/overflow для достигнутого состояния; нижняя подпись варианта остаётся визуально чрезмерно узкой. [geometry](evidence/layout/guest-audit-spec-mobile-geometry.json). |

## Автоматические проверки

| Команда | Результат |
|---|---|
| `scripts/formula-qa.sh quick` | PASS. Важно: набор проверяет зарегистрированные старые формулы, но не PDF-BOM-01…07. |
| `scripts/codex-functional-audit.sh docs` | PASS: docs up to date, manifest facts OK. |
| `scripts/codex-functional-audit.sh contracts` | PASS: 5 контрактов. Новый PDF BOM не зарегистрирован, поэтому green не является proof его соответствия. |
| `scripts/codex-functional-audit.sh db-invariants` | PASS после ручного UI-сценария и повторно после e2e: 11 проверок, 0 нарушений. Инвариант не проверяет бизнес-условие «нет electrical → пустая spec». |
| Kontur `run-static-ui-checks.sh` | INFRA FAIL: скрипт ошибочно ищет `/Users/dmalafey/.codex/plugins/cache/personal/frontend/package.json`. Эквивалентные команды выполнены напрямую. |
| `npm --prefix frontend run lint` | FAIL: существующая `_omit` не используется в `projectStore.test.ts:49`. |
| `npm --prefix frontend run typecheck` | PASS. |
| `npm --prefix frontend run test -- --run` | FAIL: 926/927 tests pass; не найден separator в `HeatCalcPage.settings.test.tsx:321`. |
| Focused rerun упавшего HeatCalc settings test | FAIL воспроизводимо: 1 failed, 10 skipped; accessible separator отсутствует. |
| `npm --prefix frontend run build` | PASS. |
| Focused backend specification/auth/security, `--no-cov` | PASS: все выбранные assertions прошли; warnings о JWT HMAC key 23 bytes. |
| Тот же focused subset с repository coverage gate | FAIL только по global coverage: `44.23% < 85%`; test failures не было. |
| Relevant Playwright/e2e: specification, report, project CSV, layout | PASS вне sandbox: 18/18. Первая sandbox-попытка была infrastructure FAIL (`EPERM` localhost/Chrome) и не являлась product result. |
| `scripts/codex-functional-audit.sh accessibility` | PASS: 6/6 desktop/mobile. Gate guest workspace проверяет Heat/Elec, но не Specification/Report. |

Точные read-only проверки новых BOM oracles и наблюдаемые количества вынесены в
[formula-probes.md](formula-probes.md).

## Ограничения evidence

- Cross-browser Firefox/Opera/Яндекс и PDF NFR на 500 объектов не запускались.
- TTL три дня невозможно считать текущим контрактом без продуктового решения:
  действующая реализация и guest SRS используют 20 минут.
- Никакие expected/golden значения не менялись.

Существующий layout e2e green не опровергает mobile finding: он проверяет в
основном empty workspace и исключает элементы с `text-overflow: ellipsis`, тогда
как ручной verifier проверил populated form, clipped units и page scroll.
