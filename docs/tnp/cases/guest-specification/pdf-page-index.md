# Постраничный индекс PDF

Индекс составлен по `pdftotext -layout` и визуальному просмотру всех 81
отрендеренных страниц. Это навигационный слой; нормативные атомарные требования
находятся в [pdf-requirements.md](pdf-requirements.md).

| Стр. | Содержание / извлечённый смысл |
|---:|---|
| 1 | Титул: «1 Кейс — Расчёт спецификации для неавторизованных пользователей». |
| 2 | Лист согласования, редакция 4, дата 07.07.2026. |
| 3 | Оглавление: начало разделов 1–3. |
| 4 | Оглавление: проекты и исходные данные. |
| 5 | Оглавление: электротехнический расчёт и lifecycle ЭР. |
| 6 | Оглавление: specification/BOM §7.11–7.15. |
| 7 | Общее положение, назначение, возможности/ограничения гостя. |
| 8 | Термины: объект, тепловые потери, электротехнический расчёт и связанные понятия. |
| 9 | Термины: ручная корректировка, stale/актуальность и specification concepts. |
| 10 | NFR: web/Docker, browsers, начало performance requirements. |
| 11 | Performance: save/open/object/batch/spec; масштабы 500 объектов, 5 ЭР; reliability. |
| 12 | Сохранность, backup/restore, обновления и security requirements. |
| 13 | Session management: guest TTL 3 дня; UX/progress/error requirements. |
| 14 | Валидация, запрет расчёта без inputs, logging/audit requirements. |
| 15 | Deployment/docs/testing/maintenance requirements. |
| 16 | Работа с проектами; guest entry, auto temporary project, local save/open. |
| 17 | Registered employee login и создание проекта. |
| 18 | Открытие/сохранение списка зарегистрированных проектов. |
| 19 | Удаление проекта и project business rules. |
| 20 | Начало алгоритма создания объекта обогрева. |
| 21 | Макет экрана исходных данных и три группы параметров. |
| 22 | Основные разделы проекта и назначение блоков input form. |
| 23 | Перечень вопросов/полей, которые должны попасть в проект, отчёт и specification. |
| 24 | Таблица бизнес-параметров: первая часть полей объекта. |
| 25 | Таблица бизнес-параметров: продолжение, вопросы и влияние на расчёт. |
| 26 | Таблица бизнес-параметров: продолжение cable/installation context. |
| 27 | Таблица параметров specification и требований бизнеса. |
| 28 | Работа с объектами: типы, add/edit/remove и состояние form. |
| 29 | Save/edit и import scenario, валидация и recalculation. |
| 30 | Создание объекта на основании и массовое копирование. |
| 31 | Group correction, table settings и DnD order. |
| 32 | Открытие/сохранение проекта локальным файлом, atomic parse failure. |
| 33 | `Далее. Электротехнический расчёт`: readiness gate и первый ЭР. |
| 34 | Введение в электротехнический расчёт и понятие ЭР. |
| 35 | Макет страницы ЭР с variants, system tabs, tables и summaries. |
| 36 | Состав экрана и общие правила самостоятельных ЭР. |
| 37 | Переключение variants и создание нового ЭР. |
| 38 | Create from existing, copy semantics и удаление ЭР. |
| 39 | Просмотр `Нераспределённые` и выбор objects. |
| 40 | Assignment objects в system, исчезновение из unassigned, начало Самрег. |
| 41 | Алгоритм подбора cable: source data и последовательность. |
| 42 | Обозначения и формульные переменные cable selection. |
| 43 | Технические ограничения, structured failure/no suitable mark. |
| 44 | Commercial stock policy и выбор доступной позиции. |
| 45 | Installed/order length, 10% reserve и commercial rounding. |
| 46 | Передача длины в specification и влияние на report. |
| 47 | §6.14: `Lток`, `Lогр`, floor и формирование числа sections. |
| 48 | Equal auto-sections, `N=ceil`, последняя не remainder. |
| 49 | Макет hierarchy object→sections и section/object summaries. |
| 50 | System-tab interface, selection и manual cable correction. |
| 51 | Manual laying step; automatic recalculation cable length/sections/currents. |
| 52 | Return to unassigned с confirm и scoped deletion assignment/cable/sections. |
| 53 | `Всё равно сформировать`: partial specification сразу для всех ЭР. |
| 54 | Stale object per ЭР и explicit per-row recalculation. |
| 55 | Inline rename ЭР: Enter/Esc/empty-name и sync со specification. |
| 56 | §7: титул и макет страницы specification. |
| 57 | Specification tabs, Settings/Refresh, filter/sort, sections Pipe/Barrel/Common. |
| 58 | Readiness warning; actions `Исправить` и `Всё равно сформировать`. |
| 59 | Nomenclature base, split/merge по object types и generation settings. |
| 60 | Переключение specification tabs, scoped update и business rules. |
| 61 | Report composition и начало cable position rule. |
| 62 | Cable quantity `Lsection×Nsection`, aggregation и manual-section ambiguity. |
| 63 | §7.10 connector kits: goal, inputs и temperature-group selection. |
| 64 | Connector main scenario, matching rows и engineer selection. |
| 65 | Connector oracle: КСН-2, code, 9 sections/2 → 5 items. |
| 66 | §7.11 repair kits: goal, inputs и candidate selection. |
| 67 | Repair formula по cable length per kit; oracle 729/150 → 5. |
| 68 | §7.12 glue/sealant: goal, inputs и selection. |
| 69 | Glue formula по connector+repair kits; oracle `(9+5)/7 → 2`. |
| 70 | §7.13 glass-fiber tape: inputs и geometric consumption formula. |
| 71 | Tape formula completion, reel conversion; PDF oracle ≈8939/30 → 298. |
| 72 | §7.14 aluminium tape: inputs, consumption per cable meter. |
| 73 | Aluminium reel conversion and output fields; 729/50 → 15. |
| 74 | §7.15 data-driven junction boxes: goal and catalog row model. |
| 75 | Tri-state application conditions: diameter, K1i/K2i/Kiu, length, count, Ex/Rгр. |
| 76 | Junction-box table: code, conditions, divider, up/down rounding. |
| 77 | Input values K1i/K2i/Kiu/Ex/Rгр и row filtering sequence. |
| 78 | `quantity=max(calculated,min_quantity)`, min=1; first worked example. |
| 79 | Worked conditions for СКВ1601 and multi-row matching. |
| 80 | Worked `round_down(2/3)=0`, then min quantity makes 1. |
| 81 | Worked СКВ1201-С1 result 5 и closing business rules. |

## Связь с evidence

Текстовая extraction сохранена во временном audit workspace как
`tmp/pdfs/guest-spec-case-audit/extracted-layout.txt`; 81 page PNG — в
`tmp/pdfs/guest-spec-case-audit/pages/`. В отчётной папке оставлены только
четыре ключевых визуальных страницы, чтобы не дублировать исходный PDF целиком.
