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
import '@/components/admin/formulas/formula-primitives.css';

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

