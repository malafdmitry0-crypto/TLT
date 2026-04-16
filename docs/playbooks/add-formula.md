# Playbook: Добавить новую расчётную формулу

Формулы живут в `backend/app/formulas/` как чистые Python-функции
(без зависимости от БД / ORM). Это ключевой принцип — формулы = математика,
сервисы = оркестрация, API = транспорт.

## Шаги

### 1. Схема входных/выходных данных (Pydantic)

`backend/app/schemas/calculation.py` — добавьте `MyParams(BaseModel)`
с валидаторами (`Field(gt=0, le=10)`). Выходной тип — `MyResult`.

### 2. Сама формула

`backend/app/formulas/<group>/<name>.py`:

```python
def calc_my_thing(
    params: MyParams,
    coefficients: dict[str, float] | None = None,
) -> MyResult:
    """Человекочитаемое описание + ссылка на formules.md."""
    coefficients = coefficients or {}
    # ... чистая арифметика ...
    return MyResult(...)
```

Правила:
- **Нет** `async def` — формулы синхронные.
- **Нет** `import` из `models/` / `services/` / SQLAlchemy.
- Коэффициенты — через словарь, сервисный слой достаёт их из БД.
- Обязательные негативные кейсы: нулевые/отрицательные входы → `ValueError` с текстом на русском.

### 3. Тесты — TDD

`backend/app/tests/unit/formulas/test_<name>.py`:
- Типовой случай (параметры из `formules.md`) — сверка с эталонным значением `pytest.approx(val, rel=0.01)`.
- Граничные значения: минимум, максимум, нулевая изоляция и т.п.
- `ValidationError` на негативных входах.
- Применение коэффициентов (если принимает).

Запуск только ваших тестов:
```
docker exec heatcalc_backend pytest app/tests/unit/formulas/test_<name>.py -v
```

### 4. Сервисный слой

`backend/app/services/calculation_service.py` — метод `async def calc_my(...)`
который:
- достаёт коэффициенты из БД,
- вызывает формулу,
- обновляет `project_object.results` / создаёт/апсертит `electrical_calculations`,
- возвращает результат.

### 5. API endpoint

`backend/app/api/v1/calculations.py`:
```python
@router.post("/my-calc", response_model=MyResult, status_code=200,
             summary="Расчёт ...", tags=["calc"])
async def my_calc(params: MyParams, ...): ...
```

### 6. Документация

- `formules.md` — добавьте блок с текстовым описанием и численным примером.
- `docs/api.md` — строку в таблице endpoint'ов.
- `docs/qa/test-cases-electrical.md` или аналогичный — минимум 1 TC.

### 7. Frontend (если это фичу ищет юзер)

- `frontend/src/api/calculations.ts` — обёртка над endpoint.
- `frontend/src/types/calculation.ts` — TS-типы (совпадают с Pydantic).
- Компонент / интеграция в существующий wizard (`ObjectWizard.tsx`).

## Чеклист

- [ ] Формула — чистая функция, unit-тесты ≥ 4 случаев
- [ ] Сервис покрыт integration-тестом
- [ ] Swagger показывает новый endpoint с response_model
- [ ] `formules.md` содержит формулу и пример
- [ ] В CLAUDE.MD §10 добавлена строка, если это формула верхнего уровня
