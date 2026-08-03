# Frontend follow-up после backend-спецификации

**Дата начала:** 2026-08-03
**Статус:** синхронизация SPEC-SCOPE-01…05 выполнена; оставшиеся продуктовые пробелы ниже не
являются второй ACTIVE frontend-очередью
**Источник backend-контракта:**
[`specification-backend-implementation-prompt.md`](./specification-backend-implementation-prompt.md)

## Зафиксированное решение

Активный frontend и backend используют один канонический V2-контракт. Модальное окно
«Спецификация» различает unset/`false`/`0`, отправляет только явные UUID ЭР и показывает typed
backend diagnostics. Heat-объекты больше не владеют шестью настройками и новые object writes с
legacy-ключами отклоняются backend.

## Уже известно после Slice 1

### Запрос генерации

Frontend отправляет канонический запрос:

```text
variant_ids: non-empty unique list[UUID], max 5
options:
  catalog_id
  catalog_version
  grouping_mode: separate_by_object_type | merge_materials
  Ex
  K1i
  K2i
  Kiu
  L_K2i_m
  R_gr
exclude_unassigned_confirmed: bool
catalog_selections: map[group_key, catalog_item_id]
```

`electrical_variant_ids`, `confirm_partial`, `variant`, `electrical_variant_id` и `mode` не
являются частью generation request. OpenAPI запрещает лишние поля.

### Resolution настроек

- Отсутствующее поле не превращается в mock или UI-default.
- Backend сначала использует явное значение запроса, затем версионированные
  настройки проекта, затем возвращает domain error.
- Frontend должен отличать «пользователь не задал значение» от явного `false`
  или `0`.

### Состояния одного ЭР

Frontend отдельно отображает per-ER статусы:

- `generated`;
- `blocked`;
- `confirmation_required`;
- `selection_required`.

Проблемы также разделены по типам:

- `confirmable` — только исключение `unassigned`-объектов;
- `blocking` — readiness, stale/error/mocked, unsupported и пробелы каталогов;
- `selection_required` — несколько подходящих позиций без сохранённого выбора.

### Ошибки

Frontend должен ветвиться по `detail.code`, а не по тексту сообщения:

```json
{
  "detail": {
    "code": "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
    "message": "...",
    "issues": [],
    "details": {}
  }
}
```

## Оставшиеся продуктовые follow-up

- UI выбора кандидатов для `selection_required` и сохранение `catalog_selections`.
- Переход «Исправить» к `unassigned`-объектам конкретного ЭР.
- Расширенное отображение catalog identity, formula inputs и provenance строк.
- Дальнейшие import/export/report границы исходного backend prompt.

## Уже известно после Slice 2

Frontend/admin-интерфейс каталога должен показывать и сохранять:

- `catalog_key`, immutable `version` и UUID версии;
- `status`: `draft`, `active`, `retired`;
- `authority`: `approved`, `provisional`, `synthetic`, `demo`, `guessed`;
- `source`, `source_checksum`, `payload_checksum`, `schema_version`;
- `item_count`, `is_complete` и typed `validation_issues`.

Активной может стать только полная версия с `authority=approved`. Draft с
неполными клеем/лентами, отсутствующими `Ex`/`R_gr`, duplicate codes,
невалидными Decimal или rounding modes остаётся доступен для диагностики, но
не снимает blocker спецификации. После активации version/items read-only;
активация новой версии переводит применимые спецификации в `stale`.

Для production generation frontend должен корректно показать:

- `SPEC_CATALOG_UNAVAILABLE` — нет полной active-версии;
- `SPEC_CATALOG_VERSION_INACTIVE` — явно запрошенная версия не active;
- `SPEC_CATALOG_VALIDATION_FAILED` — draft нельзя активировать;
- `SPEC_BOX_EX_RGR_MATRIX_MISSING` — отсутствует авторитетная матрица коробок;
- `SPEC_ACCESSORY_CATALOG_INCOMPLETE` — строке не хватает identity/unit/package
  или provenance.

## Уже известно после Slice 3

Frontend должен передавать только явные UUID ЭР в `variant_ids`. Backend
считает каждый ЭР независимо и не использует `variant_number` либо результат с
`electrical_variant_id=null` как fallback. Один blocked ЭР не должен скрывать
ready/confirmation/selection status остальных выбранных ЭР.

Канонический per-ER preflight теперь возвращает:

```text
electrical_variant_id
electrical_variant_name
status: ready | blocked | confirmation_required | selection_required
total_objects
contributing_objects
unassigned_object_ids
excluded_unassigned_object_ids
diagnostics[]
resolved_options
catalog
catalog_selections
fingerprint_schema
input_fingerprint
```

`exclude_unassigned_confirmed=true` подтверждает только полный список
`unassigned_object_ids`, вычисленный backend для данного ЭР. Frontend не
передаёт произвольный список исключений. Подтверждённые UUID появляются в
`excluded_unassigned_object_ids`, но stale/error/mocked/unsupported, ручной или
неконсистентный section plan, невалидная selection и любой catalog gap остаются
blocker.

Frontend должен выбирать отображение по `status` и typed `diagnostics[].kind` /
`diagnostics[].code`, соблюдая backend precedence:

```text
blocking > selection_required > confirmable > ready
```

`ready` всегда содержит парные `fingerprint_schema=specification-preflight/v1`
и `input_fingerprint=sha256:...`. Эти поля предназначены для backend recheck
перед записью; frontend не вычисляет и не исправляет fingerprint. Для
non-ready результата fingerprint отсутствует.

`catalog_selections` принимает только immutable UUID каталожной строки; ключи
group key должны быть непустыми, trimmed и не длиннее 128 символов. Значение
вроде mark/code/`first-row` backend отклоняет. Точную форму candidate choices
и сохранения выбора дополнят Slice 4-6.

## Не переносить во frontend

- формулы количества и округления;
- подбор каталожной позиции;
- полноту и авторитетность справочников;
- решение, можно ли обойти blocker;
- вычисление актуальности snapshot;
- объединение строк спецификации.
