# TLT Agent Routing

Этот каталог задает repo-local маршрутизацию для Codex/agent-mode задач. Он не
заменяет `AGENTS.md`: сначала всегда читается `AGENTS.md`, затем
`.agents/routing.yaml`, затем профиль конкретной роли из `.agents/roles/`.

## Как пользоваться

1. Определи scope и режим задачи: `/audit-only`, `/fix-focused`, `/ui-proof`
   или `/release-gate`.
2. Найди подходящую роль в `.agents/routing.yaml`.
3. Прочитай профиль роли в `.agents/roles/*.md`.
4. Если текущий runtime не поддерживает sub-agents или пользователь не разрешил
   delegation, применяй выбранную роль локально.
5. Если delegation разрешен, назначай одного lead agent и только независимые
   sidecar roles с явным write set или read-only scope.

## Инварианты

- `AGENTS.md` сильнее любого role-файла.
- In-scope evidence нельзя переносить в residual risk.
- Для code-edit worker задач write set должен быть явным и узким.
- Несколько агентов не должны писать в одни и те же файлы.
- Формулы, API units, golden values и persistence меняются только с источником
  правды и тестовым evidence.
- UI/layout задачи требуют before/after screenshot и программный verifier.

## Быстрый выбор роли

| Scope | Primary role |
|---|---|
| Требование неясно или есть риск drift | `docs_contract` |
| Проверка фичи end-to-end | `functional_accuracy` |
| Формулы, коэффициенты, кабельный подбор | `formula_oracle` |
| Backend/API/RBAC/persistence | `backend_business` |
| React page, layout, screenshots | `frontend_ui_proof` |
| Регрессии, flaky gates, CI evidence | `qa_regression` |
| Auth, tenancy, permissions | `security_rbac` |
| N+1, full scan, batch/import scale | `performance_db` |
