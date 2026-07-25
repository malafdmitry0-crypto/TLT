import {
  C,
  FL,
  Frac,
  FormulaBox,
  S,
  SubTitle,
  Sup,
  V,
  VarLegend,
} from '@/components/admin/formulas/formulaPrimitives';
import { Divider } from 'antd';

import '@/components/admin/formulas/formula-primitives.css';

// ─── Pipe formula display ─────────────────────────────────────────────────────

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

export function TTFormulaDisplay() {
  return (
    <>
      <FormulaBox accent={C.req}>
        <FL>
          <V c={C.req} bold>q</V><S>треб</S>
          <span> = </span>
          <V c={C.result}>q</V><S>потерь</S>
          <span> × </span>
          <V c={C.coeff}>K</V>
        </FL>
        <FL>
          <V c={C.result}>q</V><S>б</S>
          <span>(</span><V c={C.temp}>T3</V><span>) = </span>
          <V c={C.coeff}>q</V><S>1</S>
          <span> × </span>
          <V c={C.temp}>T3</V>
          <span> + </span>
          <V c={C.coeff}>q</V><S>2</S>
          <V c={C.unit}>&nbsp;[Вт/м]</V>
        </FL>
      </FormulaBox>

      <SubTitle>Выбор серии ТТН / ТТВ / ТТХ</SubTitle>
      <FormulaBox accent={C.coeff}>
        <FL><span className="formula-line-label formula-line-label--w72">ТТН:</span><V c={C.temp}>T1</V> ≤ 65°C; <V c={C.temp}>T2</V> ≤ 85°C</FL>
        <FL><span className="formula-line-label formula-line-label--w72">ТТВ:</span><V c={C.temp}>T1</V> ≤ 120°C; <V c={C.temp}>T2</V> ≤ 210°C</FL>
        <FL><span className="formula-line-label formula-line-label--w72">ТТХ:</span><V c={C.temp}>T1</V> ≤ 150°C; <V c={C.temp}>T2</V> ≤ 250°C</FL>
      </FormulaBox>

      <SubTitle>Количество ниток и мощность</SubTitle>
      <FormulaBox accent={C.result}>
        <FL>
          <V c={C.geom}>N</V><S>ниток</S>
          <span> = ceil(</span>
          <Frac top={<><V c={C.req}>q</V><S>треб</S></>} bot={<><V c={C.result}>q</V><S>б</S></>} />
          <span>)</span>
        </FL>
        <FL>
          <V c={C.result}>q</V><S>уст</S>
          <span> = </span>
          <V c={C.result}>q</V><S>б</S>
          <span> × </span>
          <V c={C.geom}>N</V><S>ниток</S>
          <span> ≥ </span>
          <V c={C.req}>q</V><S>треб</S>
        </FL>
        <FL>
          <V c={C.result} bold>P</V>
          <span> = </span>
          <V c={C.result}>q</V><S>б</S>
          <span> × </span>
          <V c={C.geom}>L</V><S>баз</S>
          <span> × </span>
          <V c={C.coeff}>k</V><S>навива</S>
          <span> × </span>
          <V c={C.geom}>N</V><S>ниток</S>
        </FL>
        <FL>
          <V c={C.result} bold>I</V>
          <span> = </span>
          <Frac top={<V c={C.result}>P</V>} bot={<V c={C.geom}>U</V>} />
        </FL>
      </FormulaBox>

      <VarLegend rows={[
        { sym: <><V c={C.coeff}>q</V><S>1</S>, <V c={C.coeff}>q</V><S>2</S></>, color: C.coeff, desc: 'коэффициенты модели из справочника cables_tt.json' },
        { sym: <><V c={C.temp}>T</V><S>ж</S></>, color: C.temp, desc: 'температура жилы/продукта, °C' },
        { sym: <><V c={C.coeff}>k</V><S>навива</S></>, color: C.coeff, desc: 'коэффициент навива' },
        { sym: <><V c={C.geom}>L</V><S>баз</S></>, color: C.geom, desc: 'длина трубы или расчётная длина укладки на резервуаре, м' },
      ]} />
    </>
  );
}

export function ResistiveFormulaDisplay() {
  return (
    <>
      <FormulaBox accent={C.coeff}>
        <FL>
          <V c={C.coeff}>ρ</V><S>T</S>
          <span> = 0,0175 × (1 + 0,0042 × (</span>
          <V c={C.temp}>T</V><S>ж</S>
          <span> − 20))</span>
          <V c={C.unit}>&nbsp;[Ом·мм²/м]</V>
        </FL>
        <FL>
          <V c={C.geom}>N</V>
          <span> = (</span>
          <V c={C.geom}>L</V>
          <span> + </span>
          <V c={C.geom}>L</V><S>доп</S>
          <span>) × </span>
          <V c={C.coeff}>k</V><S>навива</S>
          <span> × </span>
          <V c={C.geom}>N</V><S>ниток</S>
        </FL>
      </FormulaBox>

      <SubTitle>ТТ Р1 — одножильный кабель</SubTitle>
      <FormulaBox accent={C.resist}>
        <FL><span className="formula-line-label formula-line-label--w92">Линия 220В:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><V c={C.geom}>U</V><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × <V c={C.geom}>N</V></FL>
        <FL><span className="formula-line-label formula-line-label--w92">Петля 220В:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><V c={C.geom}>U</V><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × 2<V c={C.geom}>N</V></FL>
        <FL><span className="formula-line-label formula-line-label--w92">Звезда 380В:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><span>(</span><V c={C.geom}>U</V> / √3<span>)</span><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × 3<V c={C.geom}>N</V></FL>
      </FormulaBox>

      <SubTitle>ТТ Р3 — трёхжильный кабель</SubTitle>
      <FormulaBox accent={C.resist}>
        <FL><span className="formula-line-label formula-line-label--w118">Линия:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><V c={C.geom}>U</V><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × <V c={C.geom}>N</V> / 3</FL>
        <FL><span className="formula-line-label formula-line-label--w118">Петля 2×3ж:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><V c={C.geom}>U</V><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × 2<V c={C.geom}>N</V> / 3</FL>
        <FL><span className="formula-line-label formula-line-label--w118">Петля 1×3ж:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><V c={C.geom}>U</V><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × 3<V c={C.geom}>N</V></FL>
        <FL><span className="formula-line-label formula-line-label--w118">Звезда 3×3ж:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><span>(</span><V c={C.geom}>U</V> / √3<span>)</span><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × 3<V c={C.geom}>N</V> / 3</FL>
        <FL><span className="formula-line-label formula-line-label--w118">Звезда 1×3ж:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><span>(</span><V c={C.geom}>U</V> / √3<span>)</span><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × 3<V c={C.geom}>N</V></FL>
      </FormulaBox>

      <SubTitle>Подбор</SubTitle>
      <FormulaBox accent={C.result}>
        <FL><V c={C.resist}>S</V><S>справ</S> ≥ <V c={C.resist}>S</V><S>к</S></FL>
        <FL><V c={C.result}>P</V><S>факт</S> = f(<V c={C.resist}>S</V><S>справ</S>, <V c={C.coeff}>ρ</V><S>T</S>, <V c={C.geom}>N</V>, <V c={C.geom}>U</V>)</FL>
        <FL><V c={C.result}>I</V> = <V c={C.result}>P</V><S>факт</S> / <V c={C.geom}>U</V></FL>
      </FormulaBox>
    </>
  );
}

export function TankCableGeometryDisplay() {
  return (
    <>
      <FormulaBox accent={C.geom}>
        <FL>
          <V c={C.geom}>L</V><S>каб</S>
          <span> = </span>
          <Frac
            top={<><V c={C.geom}>P</V><S>периметр</S></>}
            bot={<>2</>}
          />
          <span> × </span>
          <Frac
            top={<><V c={C.geom}>H</V><S>укл</S></>}
            bot={<><V c={C.geom}>w</V><S>шаг</S></>}
          />
        </FL>
      </FormulaBox>
      <SubTitle>Периметр</SubTitle>
      <FormulaBox accent={C.geom}>
        <FL><span className="formula-line-label formula-line-label--w140">Цилиндр:</span><V c={C.geom}>P</V><S>периметр</S> = π × <V c={C.geom}>d</V></FL>
        <FL><span className="formula-line-label formula-line-label--w140">Параллелепипед:</span><V c={C.geom}>P</V><S>периметр</S> = 2 × (<V c={C.geom}>L</V> + <V c={C.geom}>W</V>)</FL>
      </FormulaBox>
      <VarLegend rows={[
        { sym: <><V c={C.geom}>H</V><S>укл</S></>, color: C.geom, desc: 'высота зоны обогрева, м' },
        { sym: <><V c={C.geom}>w</V><S>шаг</S></>, color: C.geom, desc: 'шаг укладки, 0,05–0,5 м' },
      ]} />
    </>
  );
}
