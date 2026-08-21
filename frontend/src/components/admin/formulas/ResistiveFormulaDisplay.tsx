import {
  C,
  FL,
  Frac,
  FormulaBox,
  S,
  SubTitle,
  Sup,
  V,
} from '@/components/admin/formulas/formulaPrimitives';
import '@/components/admin/formulas/formula-primitives.css';

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

