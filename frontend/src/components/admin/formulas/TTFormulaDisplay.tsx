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
          <V c={C.req} bold>P</V><S>треб</S>
          <span> = </span>
          <V c={C.result}>q</V>
          <span> × </span>
          <V c={C.coeff}>K</V>
          <V c={C.unit}>&nbsp;[Вт/м]</V>
        </FL>
      </FormulaBox>

      <SubTitle>Температурный допуск марки</SubTitle>
      <FormulaBox accent={C.coeff}>
        <FL><V c={C.temp}>T</V><S>среды</S><span> ≥ </span><V c={C.temp}>T</V><S>min паспорта</S></FL>
        <FL><V c={C.temp}>T</V><S>продукта</S><span> ≤ </span><V c={C.temp}>T</V><S>max паспорта</S></FL>
      </FormulaBox>

      <SubTitle>Паспортная мощность и нитки</SubTitle>
      <FormulaBox accent={C.result}>
        <FL>
          <V c={C.result}>P</V><S>уст/м</S>
          <span> = </span>
          <V c={C.result}>P</V><S>паспорт</S>
          <span> × </span>
          <V c={C.coeff}>K</V><S>нав</S>
          <span> × </span>
          <V c={C.geom}>N</V>
          <span> ≥ </span>
          <V c={C.req}>P</V><S>треб</S>
        </FL>
        <FL>
          <V c={C.geom}>N</V><span> ∈ {'{'}1, 2, 3{'}'}</span>
        </FL>
      </FormulaBox>

      <SubTitle>Навив трубы</SubTitle>
      <FormulaBox accent={C.coeff}>
        <FL>
          <V c={C.coeff}>K</V><S>нав</S>
          <span> = √(1 + (π</span><V c={C.geom}>D</V><span> / </span><V c={C.geom}>S</V><span>)²), </span>
          <V c={C.geom}>S</V><span> &gt; </span><V c={C.geom}>D</V>
        </FL>
        <FL><span>D &lt; 57 → 1,0; D = 57 → 1,1; 57 &lt; D ≤ 75 → 1,2</span></FL>
        <FL><span>75 &lt; D ≤ 89 → 1,3; 89 &lt; D ≤ 108 → 1,4; D &gt; 108 → 1,5</span></FL>
      </FormulaBox>

      <SubTitle>Базовая длина резервуара</SubTitle>
      <FormulaBox accent={C.geom}>
        <FL><span>Цилиндр: </span><V c={C.geom}>Периметр</V><span> = π</span><V c={C.geom}>D</V></FL>
        <FL><span>Прямоугольный: </span><V c={C.geom}>Периметр</V><span> = 2 × (</span><V c={C.geom}>L</V><span> + </span><V c={C.geom}>W</V><span>)</span></FL>
        <FL>
          <V c={C.geom}>L</V><S>баз</S>
          <span> = (</span><V c={C.geom}>Периметр</V><span> / 2) × (</span>
          <V c={C.geom}>h</V><span> / </span><V c={C.geom}>шаг</V><span>)</span>
        </FL>
        <FL>
          <V c={C.result}>q</V>
          <span> = </span>
          <Frac top={<><V c={C.req}>Q</V><S>резервуара без повторного K</S></>} bot={<><V c={C.geom}>L</V><S>баз</S></>} />
        </FL>
      </FormulaBox>

      <SubTitle>Техническая сортировка</SubTitle>
      <FormulaBox accent={C.coeff}>
        <FL><span className="formula-line-label formula-line-label--w72">1.</span><V c={C.geom}>N</V><span> — по возрастанию</span></FL>
        <FL><span className="formula-line-label formula-line-label--w72">2.</span><V c={C.result}>P</V><S>паспорт</S><span> — по возрастанию</span></FL>
        <FL><span className="formula-line-label formula-line-label--w72">3.</span><V c={C.result}>P</V><S>паспорт</S><span> × </span><V c={C.geom}>N</V><span> — по возрастанию</span></FL>
        <FL><span className="formula-line-label formula-line-label--w72">4.</span><span>полная марка — по алфавиту</span></FL>
      </FormulaBox>

      <SubTitle>Длины, мощность и ток</SubTitle>
      <FormulaBox accent={C.result}>
        <FL>
          <V c={C.geom}>L</V><S>уст</S>
          <span> = </span>
          <V c={C.geom}>L</V><S>баз</S>
          <span> × </span>
          <V c={C.coeff}>K</V><S>нав</S>
          <span> × </span>
          <V c={C.geom}>N</V>
        </FL>
        <FL>
          <V c={C.geom}>L</V><S>заказ</S>
          <span> = </span>
          <V c={C.geom}>L</V><S>уст</S>
          <span> × 1,1</span>
        </FL>
        <FL>
          <V c={C.result} bold>P</V><S>общ</S>
          <span> = </span>
          <V c={C.result}>P</V><S>паспорт</S>
          <span> × </span>
          <V c={C.geom}>L</V><S>уст</S>
        </FL>
        <FL>
          <V c={C.result} bold>I</V>
          <span> = </span>
          <Frac top={<><V c={C.result}>P</V><S>общ</S></>} bot={<V c={C.geom}>U</V>} />
        </FL>
      </FormulaBox>

      <VarLegend rows={[
        { sym: <><V c={C.result}>q</V>, <V c={C.coeff}>K</V></>, color: C.coeff, desc: 'теплопотери объекта и коэффициент запаса' },
        { sym: <><V c={C.result}>P</V><S>паспорт</S></>, color: C.result, desc: 'паспортная линейная мощность точной марки, Вт/м' },
        { sym: <><V c={C.temp}>T</V><S>среды</S>, <V c={C.temp}>T</V><S>продукта</S></>, color: C.temp, desc: 'температуры объекта для проверки паспортного допуска, °C' },
        { sym: <><V c={C.coeff}>K</V><S>нав</S></>, color: C.coeff, desc: 'коэффициент укладки: 1 для прямой прокладки или расчётный для навива' },
        { sym: <><V c={C.geom}>L</V><S>баз</S></>, color: C.geom, desc: 'длина трубы или расчётная длина укладки на резервуаре, м' },
        { sym: <V c={C.geom}>U</V>, color: C.geom, desc: 'рабочее напряжение, В; влияет на ток после выбора кабеля' },
      ]} />
    </>
  );
}
