import { Fragment, ReactNode, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Tabs,
  Typography,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import { checkFormula } from '@/api/admin';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getInsulation } from '@/api/references';
import { buildInsulationReferenceOptions } from '@/utils/referenceOptions';

const { Text } = Typography;

type FormulaType =
  | 'pipe'
  | 'tank'
  | 'electrical'
  | 'electrical_tt'
  | 'resistive_single'
  | 'resistive_three'
  | 'tank_cable_geometry';

// ─── Цвета переменных ────────────────────────────────────────────────────────
const C = {
  result:  '#1677ff',   // Q, P, I — синий
  temp:    '#c0392b',   // ΔT, температуры — красный
  geom:    '#2c3e50',   // d, L, S — тёмный
  resist:  '#7d3c98',   // R — фиолетовый
  coeff:   '#1a7a4a',   // K, α, λ — зелёный
  unit:    '#888',      // [Вт] — серый
  label:   '#555',
} as const;

// ─── Базовые примитивы ────────────────────────────────────────────────────────

/** Дробь: числитель над знаменателем */
function Frac({ top, bot }: { top: ReactNode; bot: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'middle', margin: '0 3px', lineHeight: 1.25 }}>
      <span style={{ borderBottom: '1.5px solid #333', padding: '0 4px 2px', whiteSpace: 'nowrap', textAlign: 'center' }}>{top}</span>
      <span style={{ padding: '2px 4px 0', whiteSpace: 'nowrap', textAlign: 'center' }}>{bot}</span>
    </span>
  );
}

/** Цветная переменная */
function V({ c, children, bold }: { c: string; children: ReactNode; bold?: boolean }) {
  return <span style={{ color: c, fontWeight: bold ? 700 : 500 }}>{children}</span>;
}

/** Нижний индекс */
function S({ children }: { children: ReactNode }) {
  return <sub style={{ fontSize: '0.72em', lineHeight: 0 }}>{children}</sub>;
}

/** Верхний индекс */
function Sup({ children }: { children: ReactNode }) {
  return <sup style={{ fontSize: '0.7em', lineHeight: 0 }}>{children}</sup>;
}

/** Строка формулы — flex-row с вертикальным центрированием */
function FL({ children, indent }: { children: ReactNode; indent?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2,
      fontSize: 15.5, lineHeight: 2.4,
      marginLeft: indent ? 24 : 0,
    }}>
      {children}
    </div>
  );
}

/** Блок с формулой — рамка с отступом */
function FormulaBox({ children, accent }: { children: ReactNode; accent?: string }) {
  return (
    <div style={{
      background: '#fafafa',
      border: '1px solid #e8e8e8',
      borderLeft: `4px solid ${accent ?? '#1677ff'}`,
      borderRadius: '0 8px 8px 0',
      padding: '14px 20px',
      marginBottom: 12,
      overflowX: 'auto',
    }}>
      {children}
    </div>
  );
}

/** Заголовок вспомогательной формулы */
function SubTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0, margin: '14px 0 4px' }}>
      {children}
    </div>
  );
}

/** Таблица переменных */
function VarLegend({ rows }: { rows: { sym: ReactNode; color?: string; desc: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 12.5, marginTop: 10 }}>
      {rows.map(({ sym, color, desc }, i) => (
        <Fragment key={i}>
          <span key={`s${i}`} style={{ color: color ?? C.label, fontWeight: 600, whiteSpace: 'nowrap' }}>{sym}</span>
          <span key={`d${i}`} style={{ color: C.label }}>{desc}</span>
        </Fragment>
      ))}
    </div>
  );
}

// ─── Pipe formula display ─────────────────────────────────────────────────────

function PipeFormulaDisplay() {
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
          <span style={{ color: C.label, marginRight: 8 }}>Надземно:</span>
          <V c={C.resist}>R</V><S>внеш</S>
          <span> = </span>
          <Frac
            top={<>1</>}
            bot={<>π × <V c={C.coeff}>α</V> × <V c={C.geom}>d</V><S>нар.из</S></>}
          />
        </FL>
        <FL>
          <span style={{ color: C.label, marginRight: 8 }}>Подземно:&nbsp;</span>
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
          <span style={{ color: C.label }}>Помещение:&nbsp;</span>
          <V c={C.coeff}>α</V>
          <span> = 9,0</span>
        </FL>
      </FormulaBox>

      <Divider style={{ margin: '10px 0' }} />
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

function TankFormulaDisplay() {
  return (
    <>
      <FormulaBox accent={C.result}>
        <FL>
          <V c={C.result} bold>Q</V>
          <span> = </span>
          <Frac
            top={<V c={C.temp}>ΔT</V>}
            bot={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
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
          <span style={{ color: C.label }}>С несколькими слоями:&nbsp;</span>
          <V c={C.resist}>R</V><S>из</S>
          <span> = Σ </span>
          <Frac top={<><V c={C.geom}>δ</V><S>из i</S></>} bot={<><V c={C.coeff}>λ</V><S>из i</S></>} />
        </FL>
      </FormulaBox>

      <SubTitle>Площадь поверхности S</SubTitle>
      <FormulaBox accent={C.geom}>
        <FL><span style={{ color: C.label, width: 160 }}>Цилиндр:</span> <V c={C.geom}>S</V> = π × <V c={C.geom}>d</V> × <V c={C.geom}>H</V> + π × <Frac top={<><V c={C.geom}>d</V><sup style={{ fontSize: '0.7em' }}>2</sup></>} bot={<>2</>} /></FL>
        <FL><span style={{ color: C.label, width: 160 }}>Параллелепипед:</span> <V c={C.geom}>S</V> = 2 × (<V c={C.geom}>L</V>×<V c={C.geom}>W</V> + <V c={C.geom}>L</V>×<V c={C.geom}>H</V> + <V c={C.geom}>W</V>×<V c={C.geom}>H</V>)</FL>
        <FL><span style={{ color: C.label, width: 160 }}>Шар:</span> <V c={C.geom}>S</V> = π × <V c={C.geom}>d</V><sup style={{ fontSize: '0.7em' }}>2</sup></FL>
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
          <span style={{ color: C.label }}>Помещение:&nbsp;</span>
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

      <Divider style={{ margin: '10px 0' }} />
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

function ElecFormulaDisplay() {
  return (
    <>
      <FormulaBox accent="#fa8c16">
        <FL>
          <V c="#fa8c16" bold>q</V><S>треб</S>
          <span> = </span>
          <V c={C.result}>q</V><S>потерь</S>
          <span> × </span>
          <V c={C.coeff}>K</V>
          <V c={C.unit}>&nbsp;[Вт/м]</V>
        </FL>
      </FormulaBox>

      <SubTitle>Критерии выбора кабеля из каталога ТЛТ</SubTitle>
      <FormulaBox accent={C.resist}>
        <FL><V c={C.result}>p</V><S>кабеля</S><span> ≥ </span><V c="#fa8c16">q</V><S>треб</S></FL>
        <FL><V c={C.coeff}>T</V><S>мин</S><span> ≤ </span><V c={C.temp}>T</V><S>окр</S></FL>
        <FL><V c={C.coeff}>T</V><S>макс</S><span> ≥ </span><V c={C.temp}>T</V><S>продукта</S><span style={{ color: C.unit }}> (если задана)</span></FL>
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

      <Divider style={{ margin: '10px 0' }} />
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

function TTFormulaDisplay() {
  return (
    <>
      <FormulaBox accent="#fa8c16">
        <FL>
          <V c="#fa8c16" bold>q</V><S>треб</S>
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
        <FL><span style={{ color: C.label, width: 72 }}>ТТН:</span><V c={C.temp}>T1</V> ≤ 65°C; <V c={C.temp}>T2</V> ≤ 85°C</FL>
        <FL><span style={{ color: C.label, width: 72 }}>ТТВ:</span><V c={C.temp}>T1</V> ≤ 120°C; <V c={C.temp}>T2</V> ≤ 210°C</FL>
        <FL><span style={{ color: C.label, width: 72 }}>ТТХ:</span><V c={C.temp}>T1</V> ≤ 150°C; <V c={C.temp}>T2</V> ≤ 250°C</FL>
      </FormulaBox>

      <SubTitle>Количество ниток и мощность</SubTitle>
      <FormulaBox accent={C.result}>
        <FL>
          <V c={C.geom}>N</V><S>ниток</S>
          <span> = ceil(</span>
          <Frac top={<><V c="#fa8c16">q</V><S>треб</S></>} bot={<><V c={C.result}>q</V><S>б</S></>} />
          <span>)</span>
        </FL>
        <FL>
          <V c={C.result}>q</V><S>уст</S>
          <span> = </span>
          <V c={C.result}>q</V><S>б</S>
          <span> × </span>
          <V c={C.geom}>N</V><S>ниток</S>
          <span> ≥ </span>
          <V c="#fa8c16">q</V><S>треб</S>
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

function ResistiveFormulaDisplay() {
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
        <FL><span style={{ color: C.label, width: 92 }}>Линия 220В:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><V c={C.geom}>U</V><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × <V c={C.geom}>N</V></FL>
        <FL><span style={{ color: C.label, width: 92 }}>Петля 220В:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><V c={C.geom}>U</V><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × 2<V c={C.geom}>N</V></FL>
        <FL><span style={{ color: C.label, width: 92 }}>Звезда 380В:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><span>(</span><V c={C.geom}>U</V> / √3<span>)</span><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × 3<V c={C.geom}>N</V></FL>
      </FormulaBox>

      <SubTitle>ТТ Р3 — трёхжильный кабель</SubTitle>
      <FormulaBox accent={C.resist}>
        <FL><span style={{ color: C.label, width: 118 }}>Линия:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><V c={C.geom}>U</V><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × <V c={C.geom}>N</V> / 3</FL>
        <FL><span style={{ color: C.label, width: 118 }}>Петля 2×3ж:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><V c={C.geom}>U</V><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × 2<V c={C.geom}>N</V> / 3</FL>
        <FL><span style={{ color: C.label, width: 118 }}>Петля 1×3ж:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><V c={C.geom}>U</V><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × 3<V c={C.geom}>N</V></FL>
        <FL><span style={{ color: C.label, width: 118 }}>Звезда 3×3ж:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><span>(</span><V c={C.geom}>U</V> / √3<span>)</span><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × 3<V c={C.geom}>N</V> / 3</FL>
        <FL><span style={{ color: C.label, width: 118 }}>Звезда 1×3ж:</span><V c={C.resist}>S</V><S>к</S> = <Frac top={<><V c={C.result}>Q</V></>} bot={<><span>(</span><V c={C.geom}>U</V> / √3<span>)</span><Sup>2</Sup></>} /> × <V c={C.coeff}>ρ</V><S>T</S> × 3<V c={C.geom}>N</V></FL>
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

function TankCableGeometryDisplay() {
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
        <FL><span style={{ color: C.label, width: 140 }}>Цилиндр:</span><V c={C.geom}>P</V><S>периметр</S> = π × <V c={C.geom}>d</V></FL>
        <FL><span style={{ color: C.label, width: 140 }}>Параллелепипед:</span><V c={C.geom}>P</V><S>периметр</S> = 2 × (<V c={C.geom}>L</V> + <V c={C.geom}>W</V>)</FL>
      </FormulaBox>
      <VarLegend rows={[
        { sym: <><V c={C.geom}>H</V><S>укл</S></>, color: C.geom, desc: 'высота зоны обогрева, м' },
        { sym: <><V c={C.geom}>w</V><S>шаг</S></>, color: C.geom, desc: 'шаг укладки, 0,05–0,5 м' },
      ]} />
    </>
  );
}

// ─── Результат расчёта ────────────────────────────────────────────────────────

function CalcResult({ result, type }: { result: Record<string, unknown>; type: string }) {
  if (type === 'pipe') {
    return (
      <Card
        size="small"
        style={{ marginTop: 16, borderColor: '#1677ff' }}
        styles={{ header: { background: '#e6f4ff', borderBottom: '1px solid #91caff' } }}
        title={<span style={{ color: C.result }}>Результат расчёта трубопровода</span>}
      >
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label={<><V c={C.result}>q</V> — теплопотери, Вт/м</>}>
            <Text strong style={{ color: C.result, fontSize: 16 }}>{Number(result.heat_loss_per_meter).toFixed(2)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<><V c={C.result}>Q</V> — суммарные теплопотери, Вт</>}>
            <Text strong style={{ color: C.result, fontSize: 16 }}>{Number(result.total_heat_loss).toFixed(0)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<><V c={C.geom}>L</V><sub>эфф</sub> — расчётная длина, м</>}>
            {Number(result.effective_length).toFixed(2)}
          </Descriptions.Item>
          <Descriptions.Item label={<>Σ<V c={C.resist}>R</V> — сумм. терм. сопр., м·К/Вт</>}>
            {Number(result.thermal_resistance).toFixed(4)}
          </Descriptions.Item>
          {result.alpha_vnesh != null && (
            <Descriptions.Item label={<><V c={C.coeff}>α</V> — коэф. теплоотдачи, Вт/(м²·К)</>}>
              {Number(result.alpha_vnesh).toFixed(2)}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>
    );
  }

  if (type === 'tank') {
    return (
      <Card
        size="small"
        style={{ marginTop: 16, borderColor: '#1677ff' }}
        styles={{ header: { background: '#e6f4ff', borderBottom: '1px solid #91caff' } }}
        title={<span style={{ color: C.result }}>Результат расчёта резервуара</span>}
      >
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label={<><V c={C.result}>q</V> — теплопотери, Вт/м²</>}>
            <Text strong style={{ color: C.result, fontSize: 16 }}>{Number(result.heat_loss_per_m2).toFixed(2)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<><V c={C.result}>Q</V> — суммарные теплопотери, Вт</>}>
            <Text strong style={{ color: C.result, fontSize: 16 }}>{Number(result.total_heat_loss).toFixed(0)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<><V c={C.geom}>S</V> — площадь поверхности, м²</>}>
            {Number(result.surface_area).toFixed(2)}
          </Descriptions.Item>
          {result.alpha_vnesh != null && (
            <Descriptions.Item label={<><V c={C.coeff}>α</V> — коэф. теплоотдачи, Вт/(м²·К)</>}>
              {Number(result.alpha_vnesh).toFixed(2)}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>
    );
  }

  if (type === 'tank_cable_geometry') {
    return (
      <Card
        size="small"
        style={{ marginTop: 16, borderColor: '#1677ff' }}
        styles={{ header: { background: '#e6f4ff', borderBottom: '1px solid #91caff' } }}
        title={<span style={{ color: C.result }}>Результат расчёта укладки</span>}
      >
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label={<><V c={C.geom}>L</V><sub>кабеля</sub> — длина, м</>}>
            <Text strong style={{ color: C.result, fontSize: 16 }}>{Number(result.cable_length).toFixed(3)}</Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>
    );
  }

  return (
    <Card
      size="small"
      style={{ marginTop: 16, borderColor: '#fa8c16' }}
      styles={{ header: { background: '#fff7e6', borderBottom: '1px solid #ffd591' } }}
      title={<span style={{ color: '#fa8c16' }}>Результат подбора кабеля</span>}
    >
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="Выбранный кабель">
          <Text strong style={{ color: '#fa8c16', fontSize: 16 }}>{String(result.selected_cable)}</Text>
        </Descriptions.Item>
        <Descriptions.Item label={<><V c={C.geom}>L</V><sub>кабеля</sub> — длина, м</>}>
          {Number(result.cable_length).toFixed(1)}
        </Descriptions.Item>
        <Descriptions.Item label={<><V c={C.result} bold>P</V> — суммарная мощность, Вт</>}>
          <Text strong>{Number(result.total_power).toFixed(0)}</Text>
        </Descriptions.Item>
        <Descriptions.Item label={<><V c={C.result} bold>I</V> — ток секции, А</>}>
          {Number(result.current).toFixed(2)}
        </Descriptions.Item>
        <Descriptions.Item label={<><V c={C.geom}>U</V> — напряжение, В</>}>
          {Number(result.voltage).toFixed(0)}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

// ─── Общая логика калькулятора ────────────────────────────────────────────────

function useCalc(formulaType: FormulaType) {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (params: Record<string, unknown>) => {
    setError(null);
    setLoading(true);
    try {
      setResult(await checkFormula(formulaType, params));
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(detail ? String(detail) : (e instanceof Error ? e.message : 'Ошибка расчёта'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return { result, error, loading, run };
}

function collectLayers(v: Record<string, unknown>) {
  return [1, 2, 3]
    .map((i) => ({
      thickness: Number(v[`insulation_thickness_${i}_mm`]) / 1000,
      material: v[`insulation_material_${i}`],
      conductivity: v[`insulation_conductivity_${i}`],
    }))
    .filter((layer) => layer.thickness > 0 && typeof layer.material === 'string')
    .map((layer) => ({
      thickness: layer.thickness,
      material: layer.material,
      ...(layer.conductivity != null ? { conductivity: Number(layer.conductivity) } : {}),
    }));
}

function assignIfPresent(target: Record<string, unknown>, key: string, value: unknown, transform?: (v: unknown) => unknown) {
  if (value !== undefined && value !== null && value !== '') {
    target[key] = transform ? transform(value) : value;
  }
}

// ─── Вкладка: Трубопровод ─────────────────────────────────────────────────────

function PipeTab() {
  const [form] = Form.useForm();
  const { result, error, loading, run } = useCalc('pipe');
  const { data: insulation = [] } = useQuery({
    queryKey: referenceQueryKeys.insulation,
    queryFn: getInsulation,
    ...referenceQueryOptions,
  });
  const insulationOptions = useMemo(
    () => buildInsulationReferenceOptions(insulation),
    [insulation],
  );

  const onCalc = async () => {
    const v = await form.validateFields();
    const layers = collectLayers(v);
    const p: Record<string, unknown> = {
      outer_diameter: v.outer_diameter_mm / 1000,
      pipe_length: v.pipe_length,
      insulation_layers: layers,
      process_temperature: v.process_temperature,
      ambient_temperature: v.ambient_temperature,
      location: v.location ?? 'outdoor',
    };
    assignIfPresent(p, 'wall_thickness', v.wall_thickness_mm, (x) => Number(x) / 1000);
    assignIfPresent(p, 'pipe_material', v.pipe_material);
    assignIfPresent(p, 'pipe_lambda', v.pipe_lambda);
    assignIfPresent(p, 'burial_depth', v.burial_depth);
    assignIfPresent(p, 'ground_conductivity', v.ground_conductivity);
    assignIfPresent(p, 'num_local_elements', v.num_local_elements);
    assignIfPresent(p, 'local_element_equiv_length', v.local_element_equiv_length);
    assignIfPresent(p, 'wind_speed', v.wind_speed);
    assignIfPresent(p, 'alpha_vnesh', v.alpha_vnesh);
    assignIfPresent(p, 'safety_factor', v.safety_factor);
    run(p);
  };

  return (
    <Row gutter={40}>
      <Col xs={24} lg={12}>
        <PipeFormulaDisplay />
      </Col>
      <Col xs={24} lg={12}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: '#333' }}>Проверить расчёт</div>
        <Form form={form} name="pipe_formula_check" layout="vertical" initialValues={{ location: 'outdoor', insulation_material_1: 'mineral_wool' }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="outer_diameter_mm" label="Нар. диаметр трубы, мм" rules={[{ required: true }]}>
                <InputNumber min={11} max={3000} style={{ width: '100%' }} placeholder="108" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pipe_length" label="Длина трубопровода, м" rules={[{ required: true }]}>
                <InputNumber min={0.5} max={200000} style={{ width: '100%' }} placeholder="100" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="wall_thickness_mm" label="Стенка, мм">
                <InputNumber min={0.1} max={40} style={{ width: '100%' }} placeholder="4" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="pipe_material" label="Материал трубы">
                <Select allowClear placeholder="Справочник">
                  <Select.Option value="carbon_steel">Сталь углеродистая</Select.Option>
                  <Select.Option value="stainless_304">Нерж. сталь 304</Select.Option>
                  <Select.Option value="copper">Медь</Select.Option>
                  <Select.Option value="aluminum">Алюминий</Select.Option>
                  <Select.Option value="plastic">Пластик</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="pipe_lambda" label="λ трубы вручную">
                <InputNumber min={0.001} max={400} style={{ width: '100%' }} placeholder="45" />
              </Form.Item>
            </Col>
          </Row>
          {[1, 2, 3].map((i) => (
            <Row gutter={12} key={i}>
              <Col span={8}>
                <Form.Item name={`insulation_thickness_${i}_mm`} label={`Слой ${i}, мм`} rules={i === 1 ? [{ required: true }] : undefined}>
                <InputNumber min={1} max={500} style={{ width: '100%' }} placeholder="50" />
              </Form.Item>
            </Col>
              <Col span={8}>
                <Form.Item name={`insulation_material_${i}`} label={`Материал изоляции ${i}`} rules={i === 1 ? [{ required: true }] : undefined}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Выберите материал"
                  options={insulationOptions}
                />
              </Form.Item>
            </Col>
              <Col span={8}>
                <Form.Item name={`insulation_conductivity_${i}`} label={`λ слоя ${i} вручную`}>
                  <InputNumber min={0.001} max={400} style={{ width: '100%' }} placeholder="из справочника" />
                </Form.Item>
              </Col>
            </Row>
          ))}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="process_temperature" label="T продукта, °C" rules={[{ required: true }]}>
                <InputNumber min={-90} max={600} style={{ width: '100%' }} placeholder="80" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ambient_temperature" label="T окружающей среды, °C" rules={[{ required: true }]}>
                <InputNumber min={-70} max={70} style={{ width: '100%' }} placeholder="-20" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="burial_depth" label="Глубина, м">
                <InputNumber min={0} max={200} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ground_conductivity" label="λ грунта">
                <InputNumber min={0.8} max={3} style={{ width: '100%' }} placeholder="1.5" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="alpha_vnesh" label="α вручную">
                <InputNumber min={7} max={52} style={{ width: '100%' }} placeholder="из ветра" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="wind_speed" label="Скорость ветра, м/с">
                <InputNumber min={0} max={20} style={{ width: '100%' }} placeholder="5" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="location" label="Размещение">
                <Select>
                  <Select.Option value="outdoor">Надземное</Select.Option>
                  <Select.Option value="indoor">В помещении</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="num_local_elements" label="Лок. элементы, шт">
                <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="local_element_equiv_length" label="Lэкв, м">
                <InputNumber min={0.1} max={6.9} style={{ width: '100%' }} placeholder="1" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="safety_factor" label="K запаса">
                <InputNumber min={1.05} max={1.7} step={0.05} style={{ width: '100%' }} placeholder="1.1" />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" onClick={onCalc} loading={loading}>Рассчитать</Button>
        </Form>
        {error && <Alert style={{ marginTop: 14 }} type="error" message={error} />}
        {result && <CalcResult result={result} type="pipe" />}
      </Col>
    </Row>
  );
}

// ─── Вкладка: Резервуар ───────────────────────────────────────────────────────

function TankTab() {
  const [form] = Form.useForm();
  const { result, error, loading, run } = useCalc('tank');
  const { data: insulation = [] } = useQuery({
    queryKey: referenceQueryKeys.insulation,
    queryFn: getInsulation,
    ...referenceQueryOptions,
  });
  const insulationOptions = useMemo(
    () => buildInsulationReferenceOptions(insulation),
    [insulation],
  );
  const shape = Form.useWatch('shape', form) ?? 'cylindrical';

  const onCalc = async () => {
    const v = await form.validateFields();
    const layers = collectLayers(v);
    const p: Record<string, unknown> = {
      shape: v.shape,
      insulation_thickness: layers[0]?.thickness,
      insulation_material: layers[0]?.material,
      insulation_layers: layers,
      process_temperature: v.process_temperature,
      ambient_temperature: v.ambient_temperature,
      location: v.location ?? 'outdoor',
    };
    assignIfPresent(p, 'wall_thickness', v.wall_thickness_mm, (x) => Number(x) / 1000);
    assignIfPresent(p, 'wall_lambda', v.wall_lambda);
    assignIfPresent(p, 'burial_depth', v.burial_depth);
    assignIfPresent(p, 'ground_conductivity', v.ground_conductivity);
    assignIfPresent(p, 'wind_speed', v.wind_speed);
    assignIfPresent(p, 'alpha_vnesh', v.alpha_vnesh);
    assignIfPresent(p, 'safety_factor', v.safety_factor);
    assignIfPresent(p, 'q_additional', v.q_additional);
    if (v.shape === 'cylindrical' || v.shape === 'spherical') {
      p.diameter = v.diameter_mm / 1000;
      if (v.shape === 'cylindrical') p.height = v.height_mm / 1000;
    } else {
      p.length = v.length_mm / 1000;
      p.width  = v.width_mm  / 1000;
      p.height = v.height_mm / 1000;
    }
    run(p);
  };

  return (
    <Row gutter={40}>
      <Col xs={24} lg={12}>
        <TankFormulaDisplay />
      </Col>
      <Col xs={24} lg={12}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: '#333' }}>Проверить расчёт</div>
        <Form form={form} name="tank_formula_check" layout="vertical" initialValues={{ shape: 'cylindrical', location: 'outdoor', insulation_material_1: 'mineral_wool' }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="shape" label="Форма" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="cylindrical">Цилиндр</Select.Option>
                  <Select.Option value="rectangular">Параллелепипед</Select.Option>
                  <Select.Option value="spherical">Шар</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="location" label="Размещение">
                <Select>
                  <Select.Option value="outdoor">Надземное</Select.Option>
                  <Select.Option value="indoor">В помещении</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          {(shape === 'cylindrical' || shape === 'spherical') && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="diameter_mm" label="Диаметр, мм" rules={[{ required: true }]}>
                  <InputNumber min={11} max={3000} style={{ width: '100%' }} placeholder="2000" />
                </Form.Item>
              </Col>
              {shape === 'cylindrical' && (
                <Col span={12}>
                  <Form.Item name="height_mm" label="Высота, мм" rules={[{ required: true }]}>
                    <InputNumber min={500} max={200000} style={{ width: '100%' }} placeholder="3000" />
                  </Form.Item>
                </Col>
              )}
            </Row>
          )}
          {shape === 'rectangular' && (
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="length_mm" label="Длина, мм" rules={[{ required: true }]}>
                  <InputNumber min={1} style={{ width: '100%' }} placeholder="5000" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="width_mm" label="Ширина, мм" rules={[{ required: true }]}>
                  <InputNumber min={1} style={{ width: '100%' }} placeholder="3000" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="height_mm" label="Высота, мм" rules={[{ required: true }]}>
                  <InputNumber min={1} style={{ width: '100%' }} placeholder="4000" />
                </Form.Item>
              </Col>
            </Row>
          )}
          {[1, 2, 3].map((i) => (
            <Row gutter={12} key={i}>
              <Col span={8}>
                <Form.Item name={`insulation_thickness_${i}_mm`} label={`Слой ${i}, мм`} rules={i === 1 ? [{ required: true }] : undefined}>
                <InputNumber min={1} max={500} style={{ width: '100%' }} placeholder="80" />
              </Form.Item>
            </Col>
              <Col span={8}>
                <Form.Item name={`insulation_material_${i}`} label={`Материал изоляции ${i}`} rules={i === 1 ? [{ required: true }] : undefined}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Выберите материал"
                  options={insulationOptions}
                />
              </Form.Item>
            </Col>
              <Col span={8}>
                <Form.Item name={`insulation_conductivity_${i}`} label={`λ слоя ${i} вручную`}>
                  <InputNumber min={0.001} max={400} style={{ width: '100%' }} placeholder="из справочника" />
                </Form.Item>
              </Col>
            </Row>
          ))}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="process_temperature" label="T продукта, °C" rules={[{ required: true }]}>
                <InputNumber min={-90} max={600} style={{ width: '100%' }} placeholder="60" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ambient_temperature" label="T окружающей среды, °C" rules={[{ required: true }]}>
                <InputNumber min={-70} max={70} style={{ width: '100%' }} placeholder="-20" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="wall_thickness_mm" label="Стенка, мм">
                <InputNumber min={1} max={500} style={{ width: '100%' }} placeholder="8" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="wall_lambda" label="λ стенки">
                <InputNumber min={0.001} max={400} style={{ width: '100%' }} placeholder="45" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="q_additional" label="Qдоп, Вт">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="wind_speed" label="Скорость ветра, м/с">
                <InputNumber min={0} max={20} style={{ width: '100%' }} placeholder="5" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="alpha_vnesh" label="α вручную">
                <InputNumber min={7} max={52} style={{ width: '100%' }} placeholder="из ветра" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="safety_factor" label="K запаса">
                <InputNumber min={1.05} max={1.7} step={0.05} style={{ width: '100%' }} placeholder="1.1" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="burial_depth" label="Высота подземной части, м">
                <InputNumber min={0} max={200} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ground_conductivity" label="λ грунта">
                <InputNumber min={0.8} max={3} style={{ width: '100%' }} placeholder="1.5" />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" onClick={onCalc} loading={loading}>Рассчитать</Button>
        </Form>
        {error && <Alert style={{ marginTop: 14 }} type="error" message={error} />}
        {result && <CalcResult result={result} type="tank" />}
      </Col>
    </Row>
  );
}

// ─── Вкладка: Электрорасчёт ───────────────────────────────────────────────────

function ElecTab() {
  const [form] = Form.useForm();
  const { result, error, loading, run } = useCalc('electrical');

  const onCalc = async () => {
    const v = await form.validateFields();
    const p: Record<string, unknown> = {
      required_power_per_meter: v.required_power_per_meter,
      pipe_length: v.pipe_length,
      ambient_temperature: v.ambient_temperature,
      supply_voltage: v.supply_voltage ?? 220,
    };
    assignIfPresent(p, 'process_temperature', v.process_temperature);
    assignIfPresent(p, 'cable_mark', v.cable_mark);
    assignIfPresent(p, 'safety_factor', v.safety_factor);
    assignIfPresent(p, 'winding_coefficient', v.winding_coefficient);
    assignIfPresent(p, 'winding_pitch', v.winding_pitch);
    assignIfPresent(p, 'number_of_threads', v.number_of_threads);
    run(p);
  };

  return (
    <Row gutter={40}>
      <Col xs={24} lg={12}>
        <ElecFormulaDisplay />
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, fontSize: 12, color: '#555' }}>
          Поле «Требуемая мощность» = <Text code style={{ fontSize: 11 }}>heat_loss_per_meter</Text> из результата расчёта теплопотерь.
        </div>
      </Col>
      <Col xs={24} lg={12}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: '#333' }}>Подобрать кабель</div>
        <Form form={form} name="tlt_formula_check" layout="vertical" initialValues={{ supply_voltage: 220, safety_factor: 1.1, winding_coefficient: 1, number_of_threads: 1 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="required_power_per_meter" label="Требуемая мощность, Вт/м" rules={[{ required: true }]}>
                <InputNumber min={0.1} max={5000} style={{ width: '100%' }} placeholder="45" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pipe_length" label="Длина трубопровода, м" rules={[{ required: true }]}>
                <InputNumber min={0.5} max={200000} style={{ width: '100%' }} placeholder="100" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="ambient_temperature" label="T окружающей среды, °C" rules={[{ required: true }]}>
                <InputNumber min={-70} max={70} style={{ width: '100%' }} placeholder="-20" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="process_temperature" label="T продукта, °C (необяз.)">
                <InputNumber min={-90} max={600} style={{ width: '100%' }} placeholder="80" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="supply_voltage" label="Напряжение питания, В" style={{ maxWidth: 200 }}>
            <InputNumber min={1} max={1000} style={{ width: '100%' }} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="cable_mark" label="Марка кабеля">
                <Input placeholder="пусто = автоподбор" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="safety_factor" label="K запаса">
                <InputNumber min={1} max={2} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="winding_coefficient" label="Коэф. навива">
                <InputNumber min={1} max={10} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="winding_pitch" label="Шаг навива, мм">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="number_of_threads" label="Нитки">
                <InputNumber min={1} max={3} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" onClick={onCalc} loading={loading}>Подобрать кабель</Button>
        </Form>
        {error && <Alert style={{ marginTop: 14 }} type="error" message={error} />}
        {result && <CalcResult result={result} type="electrical" />}
      </Col>
    </Row>
  );
}

function TTTab() {
  const [form] = Form.useForm();
  const { result, error, loading, run } = useCalc('electrical_tt');
  const tankShape = Form.useWatch('tank_shape', form);

  const onCalc = async () => {
    const v = await form.validateFields();
    const p: Record<string, unknown> = {
      required_power_per_meter: v.required_power_per_meter,
      pipe_length: v.pipe_length,
      process_temperature: v.process_temperature,
      maintain_temperature: v.maintain_temperature,
      supply_voltage: v.supply_voltage ?? 220,
      aggressive_product: v.aggressive_product ?? false,
      winding_coefficient: v.winding_coefficient ?? 1.1,
      safety_factor: v.safety_factor ?? 1.1,
    };
    assignIfPresent(p, 'vapor_temperature', v.vapor_temperature);
    assignIfPresent(p, 'cable_mark', v.cable_mark);
    assignIfPresent(p, 'winding_pitch', v.winding_pitch);
    assignIfPresent(p, 'number_of_threads', v.number_of_threads);
    assignIfPresent(p, 'tank_shape', v.tank_shape);
    assignIfPresent(p, 'tank_diameter', v.tank_diameter_mm, (x) => Number(x) / 1000);
    assignIfPresent(p, 'tank_length', v.tank_length_mm, (x) => Number(x) / 1000);
    assignIfPresent(p, 'tank_width', v.tank_width_mm, (x) => Number(x) / 1000);
    assignIfPresent(p, 'heating_height', v.heating_height);
    assignIfPresent(p, 'laying_step', v.laying_step);
    run(p);
  };

  return (
    <Row gutter={40}>
      <Col xs={24} lg={12}><TTFormulaDisplay /></Col>
      <Col xs={24} lg={12}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: '#333' }}>Проверить расчёт ТТ</div>
        <Form form={form} name="tt_formula_check" layout="vertical" initialValues={{ supply_voltage: 220, aggressive_product: false, winding_coefficient: 1.1, safety_factor: 1.1 }}>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="required_power_per_meter" label="Требуемая мощность, Вт/м" rules={[{ required: true }]}><InputNumber min={0.1} style={{ width: '100%' }} placeholder="30" /></Form.Item></Col>
            <Col span={12}><Form.Item name="pipe_length" label="Длина, м" rules={[{ required: true }]}><InputNumber min={0.1} style={{ width: '100%' }} placeholder="50" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="process_temperature" label="T продукта, °C" rules={[{ required: true }]}><InputNumber min={-90} max={600} style={{ width: '100%' }} placeholder="60" /></Form.Item></Col>
            <Col span={12}><Form.Item name="vapor_temperature" label="T пропарки, °C"><InputNumber style={{ width: '100%' }} placeholder="85" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="maintain_temperature" label="T3 поддержания, °C (необяз.)"><InputNumber min={-90} max={600} style={{ width: '100%' }} placeholder="по умолчанию T продукта" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="supply_voltage" label="U, В"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="safety_factor" label="K запаса"><InputNumber min={1} max={2} step={0.05} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="aggressive_product" label="Среда"><Select><Select.Option value={false}>Обычная</Select.Option><Select.Option value={true}>Агрессивная</Select.Option></Select></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="winding_coefficient" label="Коэф. укладки"><InputNumber min={1} max={10} step={0.1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="winding_pitch" label="Шаг навива, мм"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="number_of_threads" label="Нитки"><InputNumber min={1} max={100} style={{ width: '100%' }} placeholder="авто" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="cable_mark" label="Марка кабеля"><Input placeholder="пусто = автоподбор" /></Form.Item></Col>
            <Col span={12}><Form.Item name="tank_shape" label="Геометрия резервуара"><Select allowClear placeholder="не использовать"><Select.Option value="cylindrical">Цилиндр</Select.Option><Select.Option value="rectangular">Параллелепипед</Select.Option></Select></Form.Item></Col>
          </Row>
          {tankShape === 'cylindrical' && (
            <Form.Item name="tank_diameter_mm" label="Диаметр резервуара, мм" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          )}
          {tankShape === 'rectangular' && (
            <Row gutter={12}>
              <Col span={12}><Form.Item name="tank_length_mm" label="Длина резервуара, мм" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="tank_width_mm" label="Ширина резервуара, мм" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
          )}
          {tankShape && (
            <Row gutter={12}>
              <Col span={12}><Form.Item name="heating_height" label="Высота обогрева, м" rules={[{ required: true }]}><InputNumber min={0.001} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="laying_step" label="Шаг укладки, м" rules={[{ required: true }]}><InputNumber min={0.05} max={0.5} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
          )}
          <Button type="primary" onClick={onCalc} loading={loading}>Подобрать кабель</Button>
        </Form>
        {error && <Alert style={{ marginTop: 14 }} type="error" message={error} />}
        {result && <CalcResult result={result} type="electrical_tt" />}
      </Col>
    </Row>
  );
}

function ResistiveTab() {
  const [form] = Form.useForm();
  const cableKind = Form.useWatch('cable_kind', form) ?? 'resistive_single';
  const tankShape = Form.useWatch('tank_shape', form);
  const { result, error, loading, run } = useCalc(cableKind);

  const onCalc = async () => {
    const v = await form.validateFields();
    const p: Record<string, unknown> = {
      required_heat_loss: v.required_heat_loss,
      pipe_length: v.pipe_length,
      add_length: v.add_length ?? 0,
      process_temperature: v.process_temperature,
      supply_voltage: v.supply_voltage ?? 220,
      connection_type: v.connection_type,
      winding_coefficient: v.winding_coefficient ?? 1,
      number_of_threads: v.number_of_threads ?? 1,
    };
    assignIfPresent(p, 'winding_pitch', v.winding_pitch);
    assignIfPresent(p, 'tank_shape', v.tank_shape);
    assignIfPresent(p, 'tank_diameter', v.tank_diameter_mm, (x) => Number(x) / 1000);
    assignIfPresent(p, 'tank_length', v.tank_length_mm, (x) => Number(x) / 1000);
    assignIfPresent(p, 'tank_width', v.tank_width_mm, (x) => Number(x) / 1000);
    assignIfPresent(p, 'heating_height', v.heating_height);
    assignIfPresent(p, 'laying_step', v.laying_step);
    run(p);
  };

  return (
    <Row gutter={40}>
      <Col xs={24} lg={12}><ResistiveFormulaDisplay /></Col>
      <Col xs={24} lg={12}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: '#333' }}>Проверить резистивный кабель</div>
        <Form form={form} name="resistive_formula_check" layout="vertical" initialValues={{ cable_kind: 'resistive_single', connection_type: 'line_1ph', supply_voltage: 220, winding_coefficient: 1, number_of_threads: 1 }}>
          <Form.Item name="cable_kind" label="Тип кабеля">
            <Select>
              <Select.Option value="resistive_single">ТТ Р1 одножильный</Select.Option>
              <Select.Option value="resistive_three">ТТ Р3 трёхжильный</Select.Option>
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="required_heat_loss" label="Q треб., Вт" rules={[{ required: true }]}><InputNumber min={0.1} style={{ width: '100%' }} placeholder="1000" /></Form.Item></Col>
            <Col span={12}><Form.Item name="pipe_length" label="Длина, м" rules={[{ required: true }]}><InputNumber min={0.1} style={{ width: '100%' }} placeholder="50" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="add_length" label="Lдоп, м"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item></Col>
            <Col span={8}><Form.Item name="process_temperature" label="T продукта, °C" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} placeholder="60" /></Form.Item></Col>
            <Col span={8}><Form.Item name="supply_voltage" label="U, В"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="connection_type" label="Схема подключения">
            {cableKind === 'resistive_single' ? (
              <Select>
                <Select.Option value="line_1ph">Линия 220В</Select.Option>
                <Select.Option value="loop_1ph">Петля 220В</Select.Option>
                <Select.Option value="star_3ph">Звезда 380В</Select.Option>
              </Select>
            ) : (
              <Select>
                <Select.Option value="line_1ph">Линия</Select.Option>
                <Select.Option value="loop_2x3">Петля 2×3ж</Select.Option>
                <Select.Option value="loop_1x3">Петля 1×3ж</Select.Option>
                <Select.Option value="star_3x3">Звезда 3×3ж</Select.Option>
                <Select.Option value="star_1x3">Звезда 1×3ж</Select.Option>
              </Select>
            )}
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="winding_coefficient" label="Коэф. навива"><InputNumber min={1} max={10} step={0.1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="winding_pitch" label="Шаг навива, мм"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="number_of_threads" label="Нитки"><InputNumber min={1} max={3} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="tank_shape" label="Геометрия резервуара">
            <Select allowClear placeholder="не использовать">
              <Select.Option value="cylindrical">Цилиндр</Select.Option>
              <Select.Option value="rectangular">Параллелепипед</Select.Option>
            </Select>
          </Form.Item>
          {tankShape === 'cylindrical' && <Form.Item name="tank_diameter_mm" label="Диаметр резервуара, мм" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>}
          {tankShape === 'rectangular' && (
            <Row gutter={12}>
              <Col span={12}><Form.Item name="tank_length_mm" label="Длина резервуара, мм" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="tank_width_mm" label="Ширина резервуара, мм" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
          )}
          {tankShape && (
            <Row gutter={12}>
              <Col span={12}><Form.Item name="heating_height" label="Высота обогрева, м" rules={[{ required: true }]}><InputNumber min={0.001} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="laying_step" label="Шаг укладки, м" rules={[{ required: true }]}><InputNumber min={0.05} max={0.5} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
          )}
          <Button type="primary" onClick={onCalc} loading={loading}>Подобрать кабель</Button>
        </Form>
        {error && <Alert style={{ marginTop: 14 }} type="error" message={error} />}
        {result && <CalcResult result={result} type={cableKind} />}
      </Col>
    </Row>
  );
}

function TankCableTab() {
  const [form] = Form.useForm();
  const shape = Form.useWatch('shape', form) ?? 'cylindrical';
  const { result, error, loading, run } = useCalc('tank_cable_geometry');

  const onCalc = async () => {
    const v = await form.validateFields();
    const p: Record<string, unknown> = {
      shape: v.shape,
      heating_height: v.heating_height,
      laying_step: v.laying_step,
    };
    assignIfPresent(p, 'diameter', v.diameter_mm, (x) => Number(x) / 1000);
    assignIfPresent(p, 'length', v.length_mm, (x) => Number(x) / 1000);
    assignIfPresent(p, 'width', v.width_mm, (x) => Number(x) / 1000);
    run(p);
  };

  return (
    <Row gutter={40}>
      <Col xs={24} lg={12}><TankCableGeometryDisplay /></Col>
      <Col xs={24} lg={12}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: '#333' }}>Проверить геометрию укладки</div>
        <Form form={form} name="tank_cable_formula_check" layout="vertical" initialValues={{ shape: 'cylindrical' }}>
          <Form.Item name="shape" label="Форма" rules={[{ required: true }]}><Select><Select.Option value="cylindrical">Цилиндр</Select.Option><Select.Option value="rectangular">Параллелепипед</Select.Option></Select></Form.Item>
          {shape === 'cylindrical' ? (
            <Form.Item name="diameter_mm" label="Диаметр, мм" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} placeholder="2000" /></Form.Item>
          ) : (
            <Row gutter={12}>
              <Col span={12}><Form.Item name="length_mm" label="Длина, мм" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} placeholder="5000" /></Form.Item></Col>
              <Col span={12}><Form.Item name="width_mm" label="Ширина, мм" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} placeholder="3000" /></Form.Item></Col>
            </Row>
          )}
          <Row gutter={12}>
            <Col span={12}><Form.Item name="heating_height" label="Высота обогрева, м" rules={[{ required: true }]}><InputNumber min={0.001} style={{ width: '100%' }} placeholder="2" /></Form.Item></Col>
            <Col span={12}><Form.Item name="laying_step" label="Шаг укладки, м" rules={[{ required: true }]}><InputNumber min={0.05} max={0.5} step={0.01} style={{ width: '100%' }} placeholder="0.2" /></Form.Item></Col>
          </Row>
          <Button type="primary" onClick={onCalc} loading={loading}>Рассчитать</Button>
        </Form>
        {error && <Alert style={{ marginTop: 14 }} type="error" message={error} />}
        {result && <CalcResult result={result} type="tank_cable_geometry" />}
      </Col>
    </Row>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function FormulasPage() {
  return (
    <Card title="Расчётные формулы">
      <Tabs
        items={[
          { key: 'pipe', label: 'Трубопровод', children: <PipeTab /> },
          { key: 'tank', label: 'Резервуар', children: <TankTab /> },
          { key: 'electrical', label: 'Саморег. ТЛТ', children: <ElecTab /> },
          { key: 'tt', label: 'Саморег. ТТ', children: <TTTab /> },
          { key: 'resistive', label: 'Резистивный', children: <ResistiveTab /> },
          { key: 'tank-cable', label: 'Укладка на резервуар', children: <TankCableTab /> },
        ]}
      />
    </Card>
  );
}
