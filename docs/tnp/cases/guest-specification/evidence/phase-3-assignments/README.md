# Phase 3 — UI evidence назначения объектов по ЭР

Дата проверки: 18.07.2026.

Контур: гостевой проект, пять динамических ЭР, один объект типа
`Трубопровод`. Проверка выполнена через реальный UI на
`http://localhost:5173` с backend API на `http://localhost:8000`.

## До изменения

- `before-five-er-desktop.png` / `.md` / `-geometry.json`;
- `before-five-er-mobile.png` / `.md` / `-geometry.json`.

Базовый снимок подтверждает пять именованных ЭР и отсутствие панели
распределения объектов.

## После изменения

- `after-er5-desktop.png` / `.md` / `-geometry.json`;
- `after-er5-mobile.png` / `.md` / `-geometry.json`.

На ЭР5 видны отдельное назначение `Самрег1`, состояние
`Требуется пересчёт` и fail-closed сообщение для ещё не подключённого
UUID-расчётного контура. На desktop нет горизонтального overflow страницы,
неожиданного clipping, overlap или выхода controls за viewport. На mobile
страница также не имеет горизонтального overflow; длинное имя ЭР остаётся
полностью доступным через aria-label и строку выбранного ЭР, а таблица и
навигация используют локальные scroll/overflow-контейнеры.

## Совместимость типа системы

- `fresh-resistive-single-core-desktop.png`;
- `fresh-resistive-single-core-desktop.md`;
- `fresh-resistive-single-core-desktop-geometry.json`.

При назначении объекта в `Резистив` модальное окно `Подбор` открылось с
типом `Однож. пост. мощн.` и схемой `Линия`, хотя до открытия общий тип
был `Саморегулирующийся`. Геометрия фиксирует отсутствие page overflow.

## Снятие назначения и сохранение

- `unassign-confirm-desktop.png` / `.md` — подтверждение явно сообщает,
  что удаляется только электрический граф выбранного ЭР, а теплорасчёт и
  параметры объекта сохраняются;
- `after-unassign-reload.md` — после reload сохранены
  `Нераспределённые1` и `Резистив0`, объект остаётся в проекте;
- `assign-er1-request.json` / `assign-er1-response.json`;
- `unassign-er1-request.json` / `unassign-er1-response.json`;
- `assignment-network-list.txt` — PATCH назначения, POST снятия назначения,
  повторные GET и UUID-scoped electrical query завершились HTTP 200.

## Консоль

`console-clean-assignment-flow.txt` получен после повторного полного
assign → confirm unassign потока: **0 errors, 0 warnings**. Обнаруженные при
первой ручной проверке static `message`/`Modal` предупреждения Ant Design
устранены переходом панели на context-bound API.

Итог UI-proof: **pass** для Phase 3.
