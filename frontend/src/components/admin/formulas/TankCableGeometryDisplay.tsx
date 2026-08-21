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
