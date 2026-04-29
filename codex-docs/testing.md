# Тестирование

## Быстрые команды

```bash
make test-backend
make test-frontend
```

E2E:

```bash
cd e2e
npx playwright test
```

Через Docker из README:

```bash
docker exec -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  heatcalc_backend python3 -m pytest app/tests/

docker exec heatcalc_frontend npm test -- --run
```

## Что запускать по типу изменения

| Изменение | Минимум |
|---|---|
| Формула | unit-тесты формул backend |
| Endpoint/service | backend unit + integration API по модулю |
| Модель/миграция | migration/db tests + зависимые integration |
| UI-компонент | Vitest/RTL по компоненту |
| Страница рабочего потока | frontend integration + релевантный Playwright |
| Импорт/экспорт | backend import/export tests + e2e при изменении UI |
| Отчёты | report service/generator tests + frontend ReportPage tests |
| Роли/доступ | security boundary tests + frontend guards |

## Текущие ориентиры покрытия

README фиксирует актуальные счётчики автотестов в AUTO-блоке. После массовых
изменений документацию можно синхронизировать через:

```bash
python scripts/sync-docs.py
```

## Проверка перед финальным ответом

- Все затронутые тесты запущены или явно указано, почему не запускались.
- Если менялся API, проверена обратная совместимость frontend/backend.
- Если менялась схема БД, есть миграция и тест миграций.
- Если менялся UX, нет регресса ролей гостя/сотрудника/админа.
- Документация обновлена в том же изменении.

