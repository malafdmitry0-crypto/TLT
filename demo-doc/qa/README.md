# QA Documentation — HeatCalc

## Структура

| Файл | Содержание |
|------|------------|
| [checklist.md](checklist.md) | Быстрый чек-лист перед релизом |
| [test-cases-auth.md](test-cases-auth.md) | TC: Авторизация |
| [test-cases-projects.md](test-cases-projects.md) | TC: Проекты |
| [test-cases-objects.md](test-cases-objects.md) | TC: Объекты и расчёты |
| [test-cases-electrical.md](test-cases-electrical.md) | TC: Электротехнический расчёт |
| [test-cases-specification.md](test-cases-specification.md) | TC: Спецификация |
| [test-cases-reports.md](test-cases-reports.md) | TC: Отчёты |
| [test-cases-admin.md](test-cases-admin.md) | TC: Администрирование |
| [test-cases-references.md](test-cases-references.md) | TC: Справочники |
| [automation-coverage.md](automation-coverage.md) | Покрытие автотестами |
| [environments.md](environments.md) | Тестовые окружения и данные |

## Автоматическое тестирование

```
make test-backend        # 113 тестов: unit + integration
make test-frontend       # Vitest: unit + integration (frontend)
```

Состояние: **✅ 113/113 passing** (backend), **см. automation-coverage.md**

## Быстрый старт мануального тестирования

1. `make dev` — поднять стек
2. Swagger: http://localhost:8000/docs
3. Фронтенд: http://localhost:3003
4. Данные: `make seed` — 76 тестовых записей

**Логины по умолчанию:**
- Admin: `admin@heatcalc.io` / `admin`
- Employee: `petrov@heatcalc.io` / `Employee1!`
- Гость: без авторизации (нажать «Пользователь»)
