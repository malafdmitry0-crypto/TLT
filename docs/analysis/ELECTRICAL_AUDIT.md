# Аудит логики электрорасчёта

Дата: 2026-05-08. Проверены: `calculation_service.py`, `self_regulating.py`, `resistive.py`, `cable_geometry.py`, `api/calculations.ts`, `useElectricalStats.ts`, `calcStatus.ts`

---

## 1. Маршрут данных: теплопотери → кабель

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│ Теплорасчёт  │ ──▶ │ _build_electrical_data │ ──▶ │ Формула кабеля   │
│ q_linear / Q │     │ (маппинг объекта→payload)│     │ (подбор/проверка)│
└─────────────┘     └──────────────────────┘     └─────────────────┘
```

| Тип кабеля | Что берёт из теплорасчёта | Где применяется K | Статус |
|---|---|---|---|
| **ТЛТ (труба)** | `heat_loss_per_meter` (q, без K) | В формуле: `P_треб = q × K` | ✅ |
| **ТЛТ (резервуар)** | `heat_loss_per_m2` (Вт/м²) | В формуле: `P_треб = q × K` | ❌ см. пункт 2 |
| **ТТН/ТТВ/ТТХ (труба)** | `heat_loss_per_meter` (q, без K) | В формуле: `P_треб = q × K` | ✅ |
| **ТТН/ТТВ/ТТХ (резервуар)** | `total_heat_loss / K / base_length` | В формуле: `q_треб = q_расч × K` | ✅ |
| **ТТ Р1 / ТТ Р3** | `total_heat_loss` (Q, с K) | Не применяется повторно | ✅ |

---

## 2. Критические проблемы

### ❌ 2.1 ТЛТ на резервуаре: сравнение Вт/м² с Вт/м

**Суть:** Для резервуара `_required_power_per_meter` при `cable_type == 'self_regulating'` возвращает `heat_loss_per_m2` — удельные потери в **Вт/м²**. Но каталог ТЛТ содержит мощность в **Вт/м кабеля**. Сравнение единиц разной размерности.

```python
# calculation_service.py, _required_power_per_meter()
if cable_type == "self_regulating":
    return self._positive_heat_loss(results.get("heat_loss_per_m2"))
    # Возвращает Вт/м² — сравнение с каталогом (Вт/м) некорректно
```

**Пример:** Бак 2×3 м, изоляция 80 мм ППУ, ΔT=100°C.
- `heat_loss_per_m2` = 53,6 Вт/м²
- `required_effective` = 53,6 × 1,1 = 59,0
- Автоподбор выбирает **ТЛТ-60** (60 Вт/м) — сравнил Вт/м² с Вт/м
- `cable_length` = `height` × 1,1 = 3 × 1,1 = **3,3 м**
- `total_power` = 60 × 3,3 = **198 Вт**
- Реальные теплопотери: 53,6 × S × K ≈ 53,6 × 18,8 × 1,1 = **1109 Вт**
- **Установленная мощность занижена в 5,6 раза**

**Причина:** В коде есть комментарий «Для ТЛТ сохраняем прежний контракт» — это осознанное遗留-поведение, в отличие от ТТ и резистивных кабелей, где геометрия резервуара используется для пересчёта в Вт/м кабеля.

**Исправление:** Для ТЛТ на резервуаре повторить логику ТТ: вычислить `base_length` через `_tank_base_cable_length()`, затем `required_power_per_meter = heat_loss_total_without_K / base_length`.

### ❌ 2.2 Длина кабеля для трубы не учитывает L_eff

**Суть:** В `_build_electrical_data`:

```python
pipe_length = self._num(
    params.get("pipe_length") or results.get("effective_length") or params.get("height"),
    1.0,
)
```

Из-за того что `params.get("pipe_length")` — всегда truthy для корректного объекта, `effective_length` **никогда не используется**. Кабель считается на `pipe_length`, а теплопотери — на `L_eff = pipe_length + N × L_ekv`.

**Пример:** Труба L=50 м, 4 фланца, L_ekv=2,5 м → L_eff=60 м.
- `Q_total` = q × 60 × K — база для подбора мощности кабеля
- `cable_length` = 50 × 1,1 = 55 м — кабель на 5 м короче, чем нужно
- Установленная мощность: P × 55 вместо P × 66 (60 × 1,1)

**Исправление:** Для труб с `num_local_elements > 0` приоритет у `effective_length`:
```python
pipe_length = self._num(
    params.get("pipe_length"),  # fallback если нет L_eff
) or self._num(results.get("effective_length"))
```

Или, что правильнее: всегда использовать `effective_length` для труб, когда оно доступно.

### ⚠️ 2.3 Batch-расчёт затирает ручной выбор кабеля без предупреждения

При повторном запуске batch-расчёта (`cable_mark=None`) все существующие `ElectricalCalculation` записи перезаписываются через upsert. Если пользователь вручную выбрал кабель для 5 объектов из 20 и перезапустил batch — ручной выбор теряется.

**Исправление:** Добавить параметр `skip_manual=true` в batch — пропускать объекты, у которых уже есть `cable_mark` от ручного выбора.

---

## 3. Проблемы средней тяжести

### ⚠️ 3.1 `supply_voltage` для ТЛТ не валидируется

В `_build_electrical_data` напряжение берётся из overrides или params объекта. Для ТЛТ все кабели в каталоге — строго 220 В. Если пользователь (или API) передаст 380 В, ток будет рассчитан неверно: `I = P / 380` вместо `I = P / 220`.

**Исправление:** Для `cable_type == 'self_regulating'` принудительно использовать `supply_voltage = 220` или валидировать соответствие каталогу.

### ⚠️ 3.2 Frontend: batch-расчёт ТЛТ не передаёт `supply_voltage` и другие параметры

В `HeatCalcPage.tsx`:

```typescript
if (cableType === 'self_regulating') {
  return batchCalcElectrical(project!.id, effectiveSource, elecVariant);
}
// Для других типов — параметры передаются
return batchCalcElectrical(project!.id, effectiveSource, elecVariant, cableType, {
  supplyVoltage, connectionType, windingCoefficient, ...
});
```

Для ТЛТ `supplyVoltage`, `windingCoefficient`, `numberOfThreads` и т.д. **молча игнорируются**, даже если пользователь заполнил их в UI. Бэкенд использует дефолты.

**Исправление:** Унифицировать — всегда передавать electrical_params, независимо от типа кабеля.

### ⚠️ 3.3 `safety_factor` дублируется в params объекта и overrides

Для ТЛТ/ТТ `safety_factor` берётся из:
```python
safety_factor = self._num(
    overrides.get("safety_factor") or params.get("safety_factor"),
    1.1,
)
```

Это значение из overrides (переданное с фронта через electrical_params) может отличаться от `params.safety_factor`, сохранённого в объекте. При ручном выборе кабеля оба источника могут конфликтовать — итоговый K зависит от того, какое значение не-None.

**Исправление:** Приоритет всегда у `params.safety_factor` (сохранённое в объекте значение), overrides — только если params отсутствует.

### ⚠️ 3.4 Результаты batch-расчёта не показывают объекты с ошибками теплопотерь

`batch_calc_electrical` выбирает только `is_valid == True` объекты. Объекты с ошибками теплопотерь **молча исключаются** — они не попадают ни в `calculated`, ни в `skipped`, ни в `errors`. Пользователь видит «рассчитано: 8, пропущено: 2» при 15 объектах в проекте и не понимает, где ещё 5.

**Исправление:** Добавить в ответ поле `heat_loss_failed: int` — количество объектов, исключённых из-за невалидного теплорасчёта.

### ⚠️ 3.5 `effective_length` для ТТН/ТТВ/ТТХ на трубе — та же проблема, что и для ТЛТ

В `_build_electrical_data` для `self_regulating_tt`:
```python
"pipe_length": pipe_length,  # pipe_length, не L_eff
```
Та же проблема, что в пункте 2.2, но для кабелей ТТ.

---

## 4. Что работает правильно

| Механизм | Оценка |
|---|---|
| Upsert по `(object_id, variant_number)` — повторный расчёт не плодит дубликаты | ✅ |
| Сохранение ошибок в `ElectricalCalculation.results.error_code/category/message` — причина видна после reload | ✅ |
| Перенос `winding_pitch` и `num_circuits` из предыдущего расчёта через `_layout_overrides_from_existing` | ✅ |
| `_tank_heat_loss_without_double_safety` — деление Q/K перед подачей в ТТ/резистивные формулы | ✅ |
| `_merge_electrical_overrides` — сохранённые настройки укладки + новые overrides от пользователя | ✅ |
| Валидация `process_temperature` для ТТН/ТТВ/ТТХ и резистивных (обязательное поле); `maintain_temperature` опционален с fallback `T3=T1` | ✅ |
| Автоподбор ТТН/ТТВ/ТТХ: серия по температурам, при нехватке мощности `N=ceil(Pоб/Pi)` без эскалации серии ради лимита ниток | ✅ |
| `_save_failed_electrical` — upsert записи с ошибкой, не теряем диагностику | ✅ |
| Проверка `cable_mark is None` для batch — автоподбор, не ручной выбор | ✅ |
| Frontend: `isElectricalCalcSuccess` / `electricalCalcError` — отделение успеха от ошибки | ✅ |
| `useElectricalStats` — чистая агрегация без сайд-эффектов | ✅ |

---

## 5. Рекомендации

### P0 — Критические

1. **Починить ТЛТ на резервуаре.** Использовать геометрию для пересчёта `heat_loss_per_m2` в требуемые Вт/м кабеля — по аналогии с ТТ.
2. **Починить длину кабеля для труб с локальными элементами.** Использовать `effective_length` вместо `pipe_length` при наличии `num_local_elements > 0`.

### P1 — Средние

3. **Добавить `skip_manual` в batch.** Не перезаписывать объекты с ручным выбором кабеля при повторном автоподборе.
4. **Унифицировать передачу electrical_params** на фронте — для ТЛТ тоже передавать `supplyVoltage`, `windingCoefficient`, `numberOfThreads`.
5. **Добавить `heat_loss_failed` в ответ batch-расчёта** — показывать количество объектов, исключённых из-за ошибок теплопотерь.
6. **Принудительно `supply_voltage=220` для ТЛТ** — или валидировать соответствие каталогу.
7. **Приоритет `safety_factor`** — всегда из params объекта, overrides только как fallback.

### P2 — Низкие

8. **Документировать контракт K** — где именно и сколько раз применяется safety_factor для каждого типа кабеля.
9. **Добавить тест на tank+TLT с геометрией** — сейчас этот путь, вероятно, не покрыт (согласно комментарию «прежний контракт»).

---

*Аудит выполнен 2026-05-08.*
