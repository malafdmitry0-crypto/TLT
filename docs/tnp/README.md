# ТНП Source Markdown

Этот раздел содержит Markdown-конвертацию исходной документации ТНП и внутренних
справочников. Цель — сделать формулы, алгоритмы и таблицы пригодными для
поиска, ревью и подключения к QA-agent.

## Блок теплопотери и выбор кабеля

- [Теплопотери в трубопроводах и выбор кабеля](block-heat-loss-and-cable-selection/pipe-heat-loss-and-cable-selection.md)
- [Теплопотери в резервуарах и выбор кабеля](block-heat-loss-and-cable-selection/tank-heat-loss-and-cable-selection.md)
- [Переменные трубопроводов](block-heat-loss-and-cable-selection/pipe-variables.md)
- [Переменные резервуаров](block-heat-loss-and-cable-selection/tank-variables.md)

## ТНП: Блок теплопотери

- [Карта конверсии и статус источников](tnp-block-heat-loss/README.md)
- [ТНП: теплопотери в трубопроводах](tnp-block-heat-loss/pipe-heat-loss.md)
- [ТНП: теплопотери в резервуарах](tnp-block-heat-loss/tank-heat-loss.md)
- [ТНП: переменные трубопроводов](tnp-block-heat-loss/pipe-variables.md)
- [ТНП: переменные резервуаров](tnp-block-heat-loss/tank-variables.md)
- [ТНП: формулы теплопроводности материалов](tnp-block-heat-loss/material-conductivity-formulas.md)

## Алгоритмы

- [Климат и коэффициент запаса](algorithms/climate.md)
- [Максимальный коэффициент навива](algorithms/winding.md)
- [Выбор саморегулирующегося кабеля для трубопровода](algorithms/self-regulating-pipe-selection.md)
- [Подбор резистивного кабеля](algorithms/resistive-selection.md)

Эти документы сгенерированы из исходных `Алгоритмы/*.vsdx`, а не из PDF-картинок.
Для каждой схемы дополнительно создаются:

- `docs/tnp/algorithms/generated/*.json` — узлы, координаты, типы фигур и связи;
- `docs/tnp/algorithms/generated/*.mmd` — Mermaid flowchart.

Команда регенерации:

```bash
python3 scripts/convert-vsdx-algorithms.py
```

## Внутренние справочники

- [Карта папки `ТНП/Внутренние справочники777`](internal-references-777/README.md)
- [Климатические параметры](internal-references/climate-parameters.md)
- [Теплоизоляция](internal-references/insulation.md)
- [Теплопроводность грунта](internal-references/soil-conductivity.md)
- [Формулы теплопроводности материалов](internal-references/material-conductivity-formulas.md)
- [Справочник толщины стенки трубопроводов](internal-references/pipe-wall-thickness.md)
- [Саморегулирующиеся нагревательные кабели](internal-references/self-regulating-cables.md)
- [Полный перечень продукции для спецификаций](internal-references/full-product-catalog.md)
- [Резистивный кабель ТТ Р1](internal-references/resistive-cable-r1.md)
- [Резистивный кабель ТТ Р3](internal-references/resistive-cable-r3.md)
- [ТНП: климат](tnp-internal-references/climate.md)

## Сверка

- [Сверка корректности ТНП-документации](correctness-review.md)
- [Сверка ТНП с проектной документацией и кодом](project-reconciliation-audit.md)
- [Сверка качества парсинга алгоритмов](algorithm-parsing-coverage-audit.md)

## Ограничения конвертации

- DOCX-формулы извлечены из Office MathML. Скобки сохранены насколько возможно,
  но спорные места вынесены в сверку.
- XLSX-таблицы конвертированы в Markdown таблицы. Формулы ячеек сохранены в
  виде `=FORMULA (cached_value)`.
- PDF-файлы алгоритмов используются как визуальное превью. Машинное описание
  схем берется из `VSDX`.
- PDF-справочники резистивных кабелей без надежного текстового слоя подключены
  как PNG-thumbnail; для полной табличной конвертации нужен OCR или исходник с
  текстовым слоем.
