# Playbook: Отладка экспорта отчётов

PDF / DOCX / XLSX-экспорт — отдельные кодовые пути в
`backend/app/reports/`. Ошибки всплывают как HTTP 500 на endpoint
`/api/v1/reports/{id}/export/{format}`.

## Диагностика по формату

### PDF — WeasyPrint

```
docker compose logs backend | grep -A 30 "generate_pdf"
```

Типичные причины:

| Ошибка | Причина | Решение |
|---|---|---|
| `AttributeError: 'super' object has no attribute 'transform'` | `pydyf >= 0.11` с `weasyprint < 63` | Запинить `pydyf==0.10.0` в `requirements.txt` |
| `OSError: cannot load fonts` | Нет `fonts-dejavu` в runtime-образе | Проверить `Dockerfile` runtime-stage |
| Битый HTML, `ValueError: parse` | Шаблон `report.html` выдал невалидный HTML | Запустить `ReportPreview` на UI, посмотреть исходник |

### DOCX — python-docx

```
docker compose logs backend | grep -A 30 "generate_docx"
```

Частая проблема: `KeyError` при обращении к отсутствующему полю контекста.
Проверить, что `report_service.build_context()` возвращает все поля,
которые шаблон использует.

### XLSX — openpyxl

Обычно падает на forbidden-символе в имени листа (длина > 31, запрещённые `:\ / ? *`).

## Общий чеклист

1. Убедиться, что у проекта есть хотя бы один `ProjectObject` с `is_valid=true` и рассчитанным `ElectricalCalculation` (иначе отчёт пустой, а иногда падает на `None`).
2. Сначала проверить **HTML-превью** (`GET /reports/{id}/preview`): если HTML валиден, а PDF падает — проблема в WeasyPrint, не в данных.
3. Если нужно локально воспроизвести: `docker compose exec backend python -c "from app.reports.pdf_generator import generate_pdf; ..."`.
4. Добавить логирование в `report_service.export()` перед вызовом генератора — какой контекст приходит.

## Тест-кейс для регрессии

Если починили баг — добавьте в
`backend/app/tests/integration/api/test_reports.py` тест, который:
- Создаёт минимальный проект + объект + электрорасчёт
- Запрашивает `/export/pdf`, `/export/docx`, `/export/xlsx`
- Проверяет: status 200, размер ответа > 1 КБ

Такой тест уже есть в `scripts/smoke.sh` как часть приёмки.
