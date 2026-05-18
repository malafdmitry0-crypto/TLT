# AI-Native / Multi-Agent Engineering

Разрабатывал инженерную платформу в AI-native формате, где основная часть кода, тестов, документации и технических улучшений создавалась через управляемую систему AI-агентов. Это был не режим простого code generation, а полноценный **multi-agent engineering workflow**: постановка технических промптов, декомпозиция задач, анализ кодовой базы, реализация, ревью, проверка гипотез, регрессионное тестирование и контроль качества перед merge.

В проекте была выстроена агентная инфраструктура с несколькими специализированными контурами, которые могли работать параллельно:

- **coding agents** — реализация backend/frontend изменений, рефакторинг, тесты, документация;
- **research/codebase agents** — анализ архитектуры, зависимостей, бизнес-логики и технического долга;
- **QA/regression agents** — запуск unit/integration/e2e тестов, flakiness detection, генерация regression backlog;
- **security agents** — локальный defensive audit, SAST/dependency checks, проверка auth/access boundaries;
- **performance agents** — bounded load smoke, performance budgets, trend history и анализ узких мест;
- **business-logic agents** — проверка инженерных формул, бизнес-инвариантов, edge cases для труб и резервуаров;
- **contract/documentation agents** — поиск расхождений между документацией, backend-схемами, frontend JSON-конфигурациями и import/export контрактами.

Отдельно была разработана собственная **QA/engineering-agent инфраструктура**: QA-agent, MCP-интеграции, локальные runners, codebase scanners, генераторы тест-кейсов, business-oracle проверки, audit journal, contract-drift анализ, performance smoke checks, flakiness detector и handoff-механизм для фиксов в отдельных ветках. Результаты разных контуров агрегировались в HTML/JSON-отчеты и журнал аудита, что давало traceability между требованием, найденным риском, тестом, отчетом и последующим fix branch.

Моя роль заключалась в проектировании и управлении этим агентным процессом: формулирование качественных промптов, настройка ограничений и безопасных контуров, распределение задач между агентами, анализ их выводов, принятие архитектурных решений, проверка корректности бизнес-логики и контроль merge-ready состояния. AI-агенты использовались как управляемая инженерная система, а не как автодополнение: каждый результат проходил через тесты, отчеты, ревью и регрессионную проверку.

Проект включал сложную fullstack-логику: расчет теплопотерь трубопроводов и резервуаров, электрообогрев, подбор кабелей, спецификации, импорт/экспорт Excel/CSV, отчеты, административные справочники, гостевые и сотруднические сценарии, аудит действий и защиту пользовательских данных.

**Stack:** FastAPI, PostgreSQL, SQLAlchemy, Redis, background workers, React, TypeScript, Ant Design, Vite, Playwright, Vitest, Pytest, Docker, MCP servers, custom QA-agent, multi-agent workflows.
