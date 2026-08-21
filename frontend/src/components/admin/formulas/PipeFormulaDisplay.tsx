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

export function PipeFormulaDisplay() {
  return (
    <>
      <FormulaBox accent={C.result}>
        <FL>
          <V c={C.result} bold>Q</V>
          <span> = </span>
          <Frac
            top={<V c={C.temp}>ΔT</V>}
            bot={<><V c={C.resist}>R</V><S>ст</S> + Σ<V c={C.resist}>R</V><S>из</S> + <V c={C.resist}>R</V><S>внеш</S></>}
          />
          <span>× <V c={C.geom}>L</V><S>эфф</S> × <V c={C.coeff}>K</V></span>
          <V c={C.unit}>&nbsp;[Вт]</V>
        </FL>
      </FormulaBox>

      <SubTitle>Сопротивление цилиндрического слоя</SubTitle>
      <FormulaBox accent={C.resist}>
        <FL>
          <V c={C.resist}>R</V><S>слоя</S>
          <span> = </span>
          <Frac
            top={<>ln(<V c={C.geom}>d</V><S>нар</S> / <V c={C.geom}>d</V><S>вн</S>)</>}
            bot={<>2π × <V c={C.coeff}>λ</V><S>слоя</S></>}
          />
          <V c={C.unit}>&nbsp;[м·К/Вт на 1 м]</V>
        </FL>
      </FormulaBox>

      <SubTitle>Теплопроводность материала трубы и длина</SubTitle>
      <FormulaBox accent={C.coeff}>
        <FL>
          <V c={C.coeff}>λ</V><S>трубы</S>
          <span>(</span><V c={C.temp}>T</V><S>ср</S><span>) = </span>
          <V c={C.coeff}>A</V>
          <span> + </span>
          <V c={C.coeff}>B</V>
          <span> × (</span>
          <V c={C.temp}>T</V><S>ср</S>
          <span> + 40)</span>
        </FL>
        <FL>
          <V c={C.geom}>L</V><S>эфф</S>
          <span> = </span>
          <V c={C.geom}>L</V>
          <span> + </span>
          <V c={C.geom}>n</V><S>лок</S>
          <span> × </span>
          <V c={C.geom}>L</V><S>экв</S>
        </FL>
      </FormulaBox>

      <SubTitle>Внешнее сопротивление</SubTitle>
      <FormulaBox accent={C.resist}>
        <FL>
          <span className="formula-line-label formula-line-label--gutter">Надземно:</span>
          <V c={C.resist}>R</V><S>внеш</S>
          <span> = </span>
          <Frac
            top={<>1</>}
            bot={<>π × <V c={C.coeff}>α</V> × <V c={C.geom}>d</V><S>нар.из</S></>}
          />
        </FL>
        <FL>
          <span className="formula-line-label formula-line-label--gutter">Подземно:&nbsp;</span>
          <V c={C.resist}>R</V><S>внеш</S>
          <span> = </span>
          <Frac
            top={<>arcch(<V c={C.geom}>H</V> / <V c={C.geom}>r</V><S>нар</S>)</>}
            bot={<>2π × <V c={C.coeff}>λ</V><S>гр</S></>}
          />
        </FL>
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

      <Divider className="formula-display-divider" />
      <VarLegend rows={[
        { sym: <><V c={C.temp}>ΔT</V></>,            color: C.temp,   desc: 'T_продукт − T_окружающая, °C' },
        { sym: <><V c={C.resist}>R</V><S>ст</S></>,  color: C.resist, desc: 'термосопр. стенки трубы, м·К/Вт' },
        { sym: <><V c={C.resist}>R</V><S>из</S></>,  color: C.resist, desc: 'термосопр. слоя изоляции, м·К/Вт' },
        { sym: <><V c={C.resist}>R</V><S>внеш</S></>,color: C.resist, desc: 'внешнее (воздух/грунт) сопр., м·К/Вт' },
        { sym: <><V c={C.geom}>L</V><S>эфф</S></>,   color: C.geom,   desc: 'длина трубы с учётом арматуры, м' },
        { sym: <><V c={C.coeff}>K</V></>,             color: C.coeff,  desc: 'коэф. запаса (по умолч. 1,1)' },
        { sym: <><V c={C.coeff}>λ</V><S>слоя</S></>, color: C.coeff,  desc: 'теплопроводность слоя, Вт/(м·К)' },
        { sym: <><V c={C.coeff}>A</V>, <V c={C.coeff}>B</V></>, color: C.coeff, desc: 'коэффициенты материала трубы из справочника pipe_materials.json' },
        { sym: <><V c={C.coeff}>α</V></>,             color: C.coeff,  desc: 'коэф. теплоотдачи, Вт/(м²·К)' },
        { sym: <><V c={C.geom}>v</V></>,              color: C.geom,   desc: 'скорость ветра, м/с' },
      ]} />
    </>
  );
}

// ─── Tank formula display ─────────────────────────────────────────────────────

