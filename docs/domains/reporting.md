# Домен: отчёт (reporting)

## Назначение

HTML-превью состава отчёта и экспорт PDF/DOCX/XLSX (сотрудник/админ).
Печать браузером доступна всем ролям.

## Входы и выходы

| | |
|---|---|
| UI входы | section wizard, ER scope, export format |
| API | preview HTML, export jobs/files |
| Scope | UUID ER (`ER-002`); report jobs UUID-only |
| Выходы | sanitized HTML preview; binary exports |
| Побочные эффекты | backend generation; client DOMPurify on preview |

## Владение данными

- Report composition from project objects + calc + specification of selected ER.
- Generators: `backend/app/reports/`.

## Точки входа

| Слой | Путь |
|---|---|
| UI pages | `frontend/src/pages/ReportPage.tsx`, `ReportWizardPage.tsx` |
| UI parts | `frontend/src/components/reports/ReportPreview.tsx`, `ReportWizard.tsx` |
| API client | `frontend/src/api/reports.ts` |
| Backend | `backend/app/reports/`, report_service |

## Путь выполнения

```text
ReportPage / ReportWizardPage
  → api/reports (preview | export)
  → backend generators
  → ReportPreview (DOMPurify) | file download
```

## Инварианты

- `ER-002`, `AUTH-001` (export role-gated).
- HTML preview always sanitized on client.
- Failed/unsupported calc rows must not look like success totals (business QA).

## Зависимости

**Разрешено:** project, electrical results, specification of same ER.  
**Запрещено:** client-side PDF engines as SoT; skip sanitization.

## Проверка

```bash
cd frontend && npm test -- --run src/__tests__/unit/components/reports
# backend report generator tests
# e2e export paths for employee
```

## Связанное

- Playbook: `docs/playbooks/debug-pdf-export.md`
- API: `docs/api.md` reports section
- Testing UI proof for layout of preview
