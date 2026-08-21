import {
  C,
  FL,
  Frac,
  FormulaBox,
  S,
  SubTitle,
  V,
  VarLegend,
} from '@/components/admin/formulas/formulaPrimitives';
import { Divider } from 'antd';

import '@/components/admin/formulas/formula-primitives.css';

export function ElecFormulaDisplay() {
  return (
    <>
      <FormulaBox accent={C.req}>
        <FL>
          <V c={C.req} bold>q</V><S>треб</S>
          <span> = </span>
          <V c={C.result}>q</V><S>потерь</S>
          <span> × </span>
          <V c={C.coeff}>K</V>
          <V c={C.unit}>&nbsp;[Вт/м]</V>
        </FL>
      </FormulaBox>

      <SubTitle>Критерии выбора кабеля из каталога ТЛТ</SubTitle>
      <FormulaBox accent={C.resist}>
        <FL><V c={C.result}>p</V><S>кабеля</S><span> ≥ </span><V c={C.req}>q</V><S>треб</S></FL>
        <FL><V c={C.coeff}>T</V><S>мин</S><span> ≤ </span><V c={C.temp}>T</V><S>окр</S></FL>
        <FL><V c={C.coeff}>T</V><S>макс</S><span> ≥ </span><V c={C.temp}>T</V><S>продукта</S><span className="formula-line-note"> (если задана)</span></FL>
      </FormulaBox>

      <SubTitle>Длина и мощность секции</SubTitle>
      <FormulaBox accent={C.geom}>
        <FL>
          <V c={C.geom}>L</V><S>кабеля</S>
          <span> = </span>
          <V c={C.geom}>L</V><S>трубы</S>
          <span> × 1,1</span>
          <V c={C.unit}>&nbsp;(+10% запас)</V>
        </FL>
        <FL>
          <V c={C.result} bold>P</V>
          <span> = </span>
          <V c={C.result}>p</V><S>кабеля</S>
          <span> × </span>
          <V c={C.geom}>L</V><S>кабеля</S>
          <V c={C.unit}>&nbsp;[Вт]</V>
        </FL>
        <FL>
          <V c={C.result} bold>I</V>
          <span> = </span>
          <Frac top={<V c={C.result}>P</V>} bot={<V c={C.geom}>U</V>} />
          <V c={C.unit}>&nbsp;[А]</V>
        </FL>
      </FormulaBox>

      <Divider className="formula-display-divider" />
      <VarLegend rows={[
        { sym: <><V c={C.result}>q</V><S>потерь</S></>, color: C.result,  desc: 'теплопотери трубы, Вт/м (из расчёта тепл.)' },
        { sym: <><V c={C.coeff}>K</V></>,               color: C.coeff,   desc: 'коэф. запаса (по умолч. 1,1)' },
        { sym: <><V c={C.result}>p</V><S>кабеля</S></>, color: C.result,  desc: 'мощность выбранного кабеля, Вт/м' },
        { sym: <><V c={C.coeff}>T</V><S>мин/макс</S></>,color: C.coeff,   desc: 'температурный диапазон кабеля, °C' },
        { sym: <><V c={C.geom}>L</V><S>кабеля</S></>,  color: C.geom,    desc: 'длина кабеля с запасом, м' },
        { sym: <><V c={C.result} bold>P</V></>,          color: C.result,  desc: 'суммарная мощность секции, Вт' },
        { sym: <><V c={C.result} bold>I</V></>,          color: C.result,  desc: 'ток секции, А' },
        { sym: <><V c={C.geom}>U</V></>,                color: C.geom,    desc: 'напряжение питания, В' },
      ]} />
    </>
  );
}

