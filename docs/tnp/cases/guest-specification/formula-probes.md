# Воспроизводимые probes BOM

Все команды read-only: они вызывают pure builder в запущенном
`heatcalc_backend`, не пишут в БД и не изменяют файлы.

## Комплекты, ремонт, клей и коробки

```bash
docker exec heatcalc_backend python3 -c 'from app.formulas.specification.full_builder import build_full_specification as b; from app.schemas.specification import SpecificationOptions as O; q=lambda xs:{i.article:i.quantity for i in xs}; base={"cable_mark":"25ТТН2-СТ","cable_type":"self_regulating_tt","num_circuits":9,"installed_cable_length":729.0,"object_id":"o"}; obj={"o":{"outer_diameter":0.060,"pipe_length":729.0}}; print("connector",q(b([base],obj,options=O(end_section_indication=True)))); box={**base,"num_circuits":5,"installed_cable_length":200.0}; print("box_plain",q(b([box],obj))); print("box_k2_kiu",q(b([box],obj,options=O(end_section_indication=True,top_indication=True,min_length_for_end_indication=30)))); d57={**base,"num_circuits":1,"installed_cable_length":30.0}; print("d57",q(b([d57],{"o":{"outer_diameter":0.057,"pipe_length":30.0}})))'
```

Наблюдаемые результаты для проверяемых позиций:

| Case | Current | PDF expected |
|---|---|---|
| 729 м, 9 `num_circuits`, K2 | КСН-1=9, КСН-2=18, КСР-1=5, glue=4, ЛА=15 | При выборе КСН-2: только `ceil(9/2)=5`; repair=5; glue=`ceil((5+5)/7)=2`; ЛА=15. |
| d=60, N=5, flags false | только СКВ1601=2 | СКВ1201=`ceil(5/3)=2` и СКВ1601=`max(floor(5/3),1)=1`. |
| d=60, N=5, K2+Kiu | СКВ1201-С1=2 | СКВ1201-С1=`ceil(5/1)=5`. |
| d=57 | small family СКВ1202 | PDF относит 57 к `d≥57`, то есть large family. |

## Exact package boundary стеклоленты и клей

```bash
docker exec heatcalc_backend python3 -c 'import math; from app.formulas.specification.full_builder import build_full_specification as b; q=lambda xs:{i.article:i.quantity for i in xs}; cable=30*1000*.3/(math.pi*100*2.5*1.1); r={"cable_mark":"25ТТН2-СТ","cable_type":"self_regulating_tt","num_circuits":1,"installed_cable_length":cable,"object_id":"o"}; print("cable_for_exact_30m_tape",cable,"LKS_rolls",q(b([r],{"o":{"outer_diameter":.1,"pipe_length":cable}})).get("ЛКС 12")); r2={**r,"num_circuits":50,"installed_cable_length":1.0}; print("50_connectors",{k:v for k,v in q(b([r2],{"o":{"outer_diameter":.1,"pipe_length":1.0}})).items() if k in {"КСН-1","КСР-1","NEO CONTACT MIX600"}})'
```

| Case | Current | PDF expected |
|---|---|---|
| Формула даёт ровно 30 м стеклоленты | 2 рулона | `ceil(30/30)=1`. Причина: catalog factor `0.0333334` даёт `1.000002`. |
| 50 connector kits + 1 repair kit | glue=7 | `ceil((50+1)/7)=8`; current repair kit исключён из glue base. |

## Вывод

Ремкомплект `ceil(729/150)=5` и алюминиевая лента `ceil(729/50)=15`
совпадают в выбранной точке. Connector, glue, boxes и exact reel boundary
расходятся. Это не разрешает менять current tests: сначала требуется утвердить,
что PDF 07.07 заменяет старый XLSX-contract 29.05.
