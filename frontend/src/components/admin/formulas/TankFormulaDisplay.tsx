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

export function TankFormulaDisplay() {
  return (
    <>
      <FormulaBox accent={C.result}>
        <FL>
          <V c={C.result} bold>Q</V>
          <span> = </span>
          <Frac
            top={<V c={C.temp}>ΔT</V>}
            bot={
              <span className="formula-inline-stack">
                <Frac top={<><V c={C.geom}>δ</V><S>ст</S></>} bot={<><V c={C.coeff}>λ</V><S>ст</S></>} />
                <span> + </span>
                <Frac top={<><V c={C.geom}>δ</V><S>из</S></>} bot={<><V c={C.coeff}>λ</V><S>из</S></>} />
                <span> + </span>
                <Frac top={<>1</>} bot={<><V c={C.coeff}>α</V></>} />
              </span>
            }
          />
          <span>× <V c={C.geom}>S</V> × <V c={C.coeff}>K</V></span>
          <V c={C.unit}>&nbsp;[Вт]</V>
        </FL>
        <FL>
          <span className="formula-line-label">С несколькими слоями:&nbsp;</span>
          <V c={C.resist}>R</V><S>из</S>
          <span> = Σ </span>
          <Frac top={<><V c={C.geom}>δ</V><S>из i</S></>} bot={<><V c={C.coeff}>λ</V><S>из i</S></>} />
        </FL>
      </FormulaBox>

      <SubTitle>Площадь поверхности S</SubTitle>
      <FormulaBox accent={C.geom}>
        <FL><span className="formula-line-label formula-line-label--w160">Цилиндр:</span> <V c={C.geom}>S</V> = π × <V c={C.geom}>d</V> × <V c={C.geom}>H</V> + π × <Frac top={<><V c={C.geom}>d</V><sup className="formula-sup">2</sup></>} bot={<>2</>} /></FL>
        <FL><span className="formula-line-label formula-line-label--w160">Параллелепипед:</span> <V c={C.geom}>S</V> = 2 × (<V c={C.geom}>L</V>×<V c={C.geom}>W</V> + <V c={C.geom}>L</V>×<V c={C.geom}>H</V> + <V c={C.geom}>W</V>×<V c={C.geom}>H</V>)</FL>
        <FL><span className="formula-line-label formula-line-label--w160">Шар:</span> <V c={C.geom}>S</V> = π × <V c={C.geom}>d</V><sup className="formula-sup">2</sup></FL>
      </FormulaBox>

      <SubTitle>Коэффициент теплоотдачи</SubTitle>
      <FormulaBox accent={C.coeff}>
        <FL>
          <V c={C.coeff}>α</V>
          <span> = 11,6 + 7 × √</span>
          <V c={C.geom}>v</V>
          <V c={C.unit}>&nbsp;[Вт/(м²·К)]</V>
        </FL>
        <FL>
          <span className="formula-line-label">Помещение:&nbsp;</span>
          <V c={C.coeff}>α</V>
          <span> = 9,0</span>
        </FL>
      </FormulaBox>

      <SubTitle>Подземный резервуар</SubTitle>
      <FormulaBox accent={C.resist}>
        <FL>
          <V c={C.resist}>R</V><S>гр</S>
          <span> = </span>
          <Frac top={<><V c={C.geom}>h</V><S>загл</S></>} bot={<><V c={C.coeff}>λ</V><S>гр</S></>} />
        </FL>
        <FL>
          <V c={C.result}>q</V><S>возд</S>
          <span> = </span>
          <Frac top={<V c={C.temp}>ΔT</V>} bot={<><V c={C.resist}>R</V><S>ст</S> + <V c={C.resist}>R</V><S>из</S> + <V c={C.resist}>R</V><S>внеш</S></>} />
        </FL>
        <FL>
          <V c={C.result}>q</V><S>гр</S>
          <span> = </span>
          <Frac top={<V c={C.temp}>ΔT</V>} bot={<><V c={C.resist}>R</V><S>ст</S> + <V c={C.resist}>R</V><S>из</S> + <V c={C.resist}>R</V><S>гр</S></>} />
        </FL>
        <FL>
          <V c={C.result} bold>Q</V>
          <span> = (</span>
          <V c={C.result}>q</V><S>возд</S>
          <span> × </span>
          <V c={C.geom}>S</V><S>возд</S>
          <span> + </span>
          <V c={C.result}>q</V><S>гр</S>
          <span> × </span>
          <V c={C.geom}>S</V><S>гр</S>
          <span>) × </span>
          <V c={C.coeff}>K</V>
          <span> + </span>
          <V c={C.result}>Q</V><S>доп</S>
        </FL>
      </FormulaBox>

      <Divider className="formula-display-divider" />
      <VarLegend rows={[
        { sym: <><V c={C.temp}>ΔT</V></>,            color: C.temp,  desc: 'T_продукт − T_окружающая, °C' },
        { sym: <><V c={C.geom}>δ</V><S>ст</S></>,    color: C.geom,  desc: 'толщина стенки резервуара, м' },
        { sym: <><V c={C.coeff}>λ</V><S>ст</S></>,   color: C.coeff, desc: 'теплопроводность стенки, Вт/(м·К)' },
        { sym: <><V c={C.geom}>δ</V><S>из</S></>,    color: C.geom,  desc: 'толщина изоляции, м' },
        { sym: <><V c={C.coeff}>λ</V><S>из</S></>,   color: C.coeff, desc: 'теплопроводность изоляции, Вт/(м·К)' },
        { sym: <><V c={C.coeff}>α</V></>,             color: C.coeff, desc: 'коэф. теплоотдачи, Вт/(м²·К)' },
        { sym: <><V c={C.geom}>S</V></>,              color: C.geom,  desc: 'площадь поверхности резервуара, м²' },
        { sym: <><V c={C.geom}>h</V><S>загл</S></>,   color: C.geom,  desc: 'высота подземной части резервуара, м' },
        { sym: <><V c={C.coeff}>λ</V><S>гр</S></>,    color: C.coeff, desc: 'теплопроводность грунта, Вт/(м·К)' },
        { sym: <><V c={C.result}>Q</V><S>доп</S></>,  color: C.result, desc: 'добавочная мощность, Вт' },
        { sym: <><V c={C.coeff}>K</V></>,             color: C.coeff, desc: 'коэф. запаса (по умолч. 1,1)' },
        { sym: <><V c={C.geom}>v</V></>,              color: C.geom,  desc: 'скорость ветра, м/с' },
      ]} />
    </>
  );
}

// ─── Electrical formula display ───────────────────────────────────────────────

