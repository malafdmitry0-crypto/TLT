# План слайсов закрытия кейса 1 (до 100%)

**Дата:** 2026-08-03  
**Обновление закрытия спецификации:** 2026-08-04 (HEAD `5038c56`)  
**Статус:** рабочая ведомость планирования, не ACTIVE-очередь; маршрутизация frontend-работ —
через [`../../frontend/refactor-backlog.md`](../../frontend/refactor-backlog.md).  
**Спецификация (BE path + FE selection/F5):** **ENGINEERING CLOSED** — residual owner catalog.  
**Входные снимки:** [`case1-backend-status.md`](./case1-backend-status.md) (оценка №3 + errata №4),
[`case1-frontend-checklist.md`](./case1-frontend-checklist.md).

**Принципы:** слайсы вертикальные и маленькие; каждый заканчивается зелёными тестами и
работающим сценарием; порядок — сначала конец-в-конец гостевой путь «объект → ЭР →
спецификация», потом ТЗ-конформность, потом качество. Отметки: `[ ]` не начат,
`[~]` в работе, `[x]` готов.

---

## Slice 0 — быстрые починки (разблокирует приёмку) `[ ]`

Мелкие правки с максимальным эффектом; все независимы, можно одним PR.

- [ ] **FE, баг:** `SpecTable.bomSectionOf` читать `params.object_type_section`
      (сейчас `bom_section || object_type` → все строки в «Общие материалы», «Трубы/Бочки»
      всегда пустые). `frontend/src/components/specification/SpecTable.tsx:34-54`.
- [ ] **FE, баг:** нитки 1..3 для `self_regulating_tt` — сейчас лимит 3 только для legacy
      (`elecCalcLayoutModel.ts:150-152`: `type === 'self_regulating' ? 3 : 100`).
- [ ] **FE, UX:** не закрывать модалку настроек при `selection_required` /
      `confirmation_required` (`useSpecificationPageModel.ts:172,175` — `toggleSettings(false)`
      прячет диагностики).
- [ ] **FE:** клиентский лимит 5 ЭР в «Выбрать все» спецификации и отчёта (бэкенд режет
      `max_length=5` → 422 при 6+ ЭР).
- [ ] **FE:** тексты `GuestHelpPage` — 3 дня (не 30), 500 объектов (не 50), «Начать без
      регистрации» (не «Пользователь»).
- [ ] **BE:** дефолт объекта `supply_voltage: 220 → 230`
      (`backend/app/services/project_object_params.py:66`).
- [ ] **FE:** мёртвый CSS-класс `spec-table-print-exclude` — добавить правило в
      `styles/print.css` или удалить навешивание.

Acceptance: сгенерированная спецификация раскладывается по секциям «Трубы/Бочки»;
TT-объект не даёт выбрать 4+ ниток; при selection/confirmation диагностики видны.

## Slice 1 — каталог спецификации из коробки (BE) `[x]` path / `[ ]` owner authority

- [x] Bundled bootstrap + `seeds --specification-catalog-only` (**seed-debt-v1**, TECH-DEBT).
- [x] HTTP many→PUT→generate→GET + auto_single + fail-closed 503/zero/stale fingerprint.
- [x] E2E phase5 **17/17** на dev `:3003`.
- [ ] **Residual:** заменить seed-debt owner-approved payload (`SPEC-OWNER-MATERIALS` + `EX-RGR`).

Acceptance path: **met for engineering/demo**. Production authority: **not met**.

## Slice 2 — наблюдаемость спецификации (BE+FE) `[x]` core / polish open

- [x] **BE:** GET `/variants/{er}` → `generation_status` + diagnostics + candidate_groups (REM-02).
- [x] **FE:** F5 hydrate selection/confirm/blocked from GET (REM-05).
- [ ] **FE polish:** per-ER status on tabs; kind-specific alerts; ER name in candidate panel.

## Slice 3 — выбор кандидатов: полный цикл (FE+BE) `[x]`

- [x] Server GET/PUT `catalog-selections` + project IO + generate without client store.
- [x] Stale fingerprint fail-closed in preflight (`5038c56`).
- [x] FE panel + confirm after F5 without live generate response.
- [ ] **Polish:** explicit UX copy when choice dropped (status already returns).

## Slice 4 — UX кейса 7.x на странице спецификации (FE) `[ ]`

- [ ] Кнопка «Исправить» в предупреждении о нераспределённых: переход в первый проблемный ЭР,
      вкладка «Нераспределённые объекты», подсветка строк (кейс 7.3).
- [ ] Человеческая сводка preflight вместо `<pre>{code: message}`.
- [ ] Переработать `alwaysShowSections`: пустая секция ≠ «расчёт недоступен»; различать
      «не сформирована» / «нет позиций» / «unsupported».
- [ ] Детали строки: id+версия строки каталога, применённые параметры, формула — раскрытие
      строки или tooltip (данные уже в `params`).
- [ ] Решение: печать/экспорт со страницы спецификации не делаем — вывод через «Отчёт»
      (кейс 7.8 определяет выгрузку отдельным кейсом); зафиксировать текстом на странице.

## Slice 5 — ЭР: конформность ТЗ §17.3 (FE) `[ ]`

- [ ] 230 В read-only: убрать редактируемое поле U (дефолт 220) и select 220/380 из мастера;
      показывать константу с источником.
- [ ] Iдоп-UI: настройка проекта (`/projects/{id}/electrical-settings` — бэкенд готов) +
      object override; блокирующее состояние «Задать допустимый стартовый ток»
      (`SECTION_CURRENT_LIMIT_REQUIRED`).
- [ ] Скрыть Резистив/Скин/Минеральный: вкладки, drop-зоны, кнопки «Назначить», пункты меню,
      саммари-карточки; удалить мёртвое `tab.key === 'skin' && false`.
- [ ] «Применить правило к группе»: убрать зашитый Самрег — либо семантика ТЗ, либо
      переименовать в «Назначить Самрег выбранным».
- [ ] DnD в glide-движке (drag-источник есть только в AntD-ветке) + клавиатурная
      альтернатива drop-зон.
- [ ] T2/T3: required-правила, управляемая применимость пропарки, бейджи источника значений.
- [ ] Provenance: включить L-метрики в `default_visible`, вернуть номенклатурный код в
      характеристики кабеля, тултип/модалка вместо сжатой строки.
- [ ] Stale per-объект: подсветка строки, построчная кнопка «Пересчитать», счётчик stale в
      сводке.

## Slice 6 — ЭР: зачистка бэкенда (BE) `[ ]`

**Детальный план:** [`electrical-slice6-polish-plan.md`](./electrical-slice6-polish-plan.md)
(B1/B2/B4/B6, №8, §9.15, import policy, PR-DAG, acceptance).

- [ ] Закрыть вход legacy `cable_type` (только `self_regulating_tt`), убрать дефолты
      `"self_regulating"`, вырезать legacy-ветки из прод-пути.
- [ ] `GET /calc/cable-options` → TT-модели (серия, мощность при T3, причины недоступности,
      параметр ЭР).
- [ ] `electrical_variant_id` + `Idempotency-Key` + `expected_assignment_version` в
      `/calc/electrical`, `/batch`, `/page` (UUID-first).
- [ ] Финальный гейт §9.15 после секционирования (`Pуст ≥ Pтреб`, `Lфакт ≥ Lтреб`).
- [ ] Табличный статус: разделить «Требуется перерасчёт» (stale) и «Требуется корректировка»
      (error).
- [ ] Нитки `1..3` на всех публичных схемах (residual `le=100`); fail-closed вместо
      fallback 220 В / −20 °C; зачистка `cables_tlt.json` / демо-сидов / import legacy policy.

## Slice 7 — heat-calc доделки (FE+BE) `[ ]`

- [ ] **FE:** UI групповой корректировки — форма «параметр → значение → применить к выбранным»
      на готовый `POST /objects/group-update`.
- [ ] **FE:** «Добавить копии выбранных» перевести с цикла одиночных POST на
      `POST /objects/duplicate-batch`.
- [ ] **BE:** гейт невалидности после пересчёта для `tank` (сейчас только `pipe`).
- [ ] **BE+FE:** согласовать верхнюю границу λ (UI 400 vs бэкенд без границы) — одно значение
      в обоих контрактах.
- [ ] **FE:** удалить старый coordinate-путь раскладки (`useObjectWizardSectionResize`) по
      манифестам grid.

## Slice 8 — гостевая сессия (FE) `[ ]`

- [ ] Session recovery AUTH-05: при пересоздании гостевой сессии — `cancelQueries` +
      `removeQueries` ключей старого проекта до ретрая (`api/client.ts:134-141` + связка с
      queryClient); ноль 401/404 и console-ошибок после восстановления.
- [ ] Сообщения о вместимости: показывать остаток до 500 до импорта/добавления.

## Slice 9 — качество и приёмка (FE) `[ ]`

- [ ] Console seal: circular-references warning Ant Form при первом сохранении трубы.
- [ ] Семь красных архитектурных гейтов (AF100-11+/15).
- [ ] Browser-matrix 1000×768 / 1280×800 / 1440×900 по всем экранам гостевого пути +
      состояние «нет Iдоп» + session recovery.
- [ ] Прогон 19 сценариев `AC-FE-01…19` (§13.2 ТЗ).
- [ ] Ручная приёмка 5.9/5.11 (display-settings) из
      [`project-display-settings-portability.md`](./project-display-settings-portability.md).

---

## Parking lot — решения владельца (не код)

- **P1. Ex/R_gr-матрица коробок**: авторитетный approved-набор условий для 12 коробок
  (сейчас валидация принимает `"unused"` у всех строк → матчатся все коробки). Блокирует
  категорию `box` в Slice 1.
- **P2. Семантика `ceil`**: одно округление на ЭР vs по секциям типа объекта (текущее
  поведение завышает при нескольких типах); + раздел «Общие материалы» в
  `separate_by_object_type`.
- **P3.** Локальные элементы резервуара: нужен ли ввод (кол-во + L_экв) или достаточно
  `q_additional`.
- **P4.** Индикатор «есть несохранённые изменения»: серверное поле или официально клиентский.
- **P5.** «Мои проекты» сотрудника: только свои или все (сейчас все — вероятно, баг).
- **P6.** `pump/platform/other` в enum: удалить или реализовать.
- **P7.** Обязательность толщины стенки трубы (P2 аудита heatcalc-tab).
- **P8.** Первоисточники `q1/q2`, `Iдоп`, номенклатурные коды клея/лент — подтверждение
  владельцами справочников (условие production-ready ТЗ §18).

## Порядок и зависимости

```
Slice 0 ──┬─→ Slice 2 ─→ Slice 3 ─→ Slice 4
          └─→ Slice 1 (P1 для категории box)
Slice 5 ─→ Slice 6 (независимы от 1–4, можно параллельно)
Slice 7, Slice 8 — независимы
Slice 9 — последний (приёмка по всему)
```

Кратчайший путь до работающего end-to-end гостевого сценария: **Slice 0 → Slice 1**.
