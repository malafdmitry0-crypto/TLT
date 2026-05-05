import { ReactNode, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  InputNumber,
  Row,
  Select,
  Tabs,
  Typography,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import { checkFormula } from '@/api/admin';
import { getInsulation } from '@/api/references';

const { Text } = Typography;

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
    <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, margin: '14px 0 4px' }}>
      {children}
    </div>
  );
}

/** Таблица переменных */
function VarLegend({ rows }: { rows: { sym: ReactNode; color?: string; desc: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 12.5, marginTop: 10 }}>
      {rows.map(({ sym, color, desc }, i) => (
        <>
          <span key={`s${i}`} style={{ color: color ?? C.label, fontWeight: 600, whiteSpace: 'nowrap' }}>{sym}</span>
          <span key={`d${i}`} style={{ color: C.label }}>{desc}</span>
        </>
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
          <span> = 11,6 + 7 × </span>
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
          <span> = 11,6 + 7 × </span>
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
        { sym: <><V c={C.temp}>ΔT</V></>,            color: C.temp,  desc: 'T_продукт − T_окружающая, °C' },
        { sym: <><V c={C.geom}>δ</V><S>ст</S></>,    color: C.geom,  desc: 'толщина стенки резервуара, м' },
        { sym: <><V c={C.coeff}>λ</V><S>ст</S></>,   color: C.coeff, desc: 'теплопроводность стенки, Вт/(м·К)' },
        { sym: <><V c={C.geom}>δ</V><S>из</S></>,    color: C.geom,  desc: 'толщина изоляции, м' },
        { sym: <><V c={C.coeff}>λ</V><S>из</S></>,   color: C.coeff, desc: 'теплопроводность изоляции, Вт/(м·К)' },
        { sym: <><V c={C.coeff}>α</V></>,             color: C.coeff, desc: 'коэф. теплоотдачи, Вт/(м²·К)' },
        { sym: <><V c={C.geom}>S</V></>,              color: C.geom,  desc: 'площадь поверхности резервуара, м²' },
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

  // electrical
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

function useCalc(formulaType: 'pipe' | 'tank' | 'electrical') {
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

// ─── Вкладка: Трубопровод ─────────────────────────────────────────────────────

function PipeTab() {
  const [form] = Form.useForm();
  const { result, error, loading, run } = useCalc('pipe');
  const { data: insulation = [] } = useQuery({ queryKey: ['references', 'insulation'], queryFn: getInsulation });

  const onCalc = async () => {
    const v = await form.validateFields();
    const p: Record<string, unknown> = {
      outer_diameter: v.outer_diameter_mm / 1000,
      pipe_length: v.pipe_length,
      insulation_thickness: v.insulation_thickness_mm / 1000,
      insulation_material: v.insulation_material,
      process_temperature: v.process_temperature,
      ambient_temperature: v.ambient_temperature,
      location: v.location ?? 'outdoor',
    };
    if (v.wind_speed != null) p.wind_speed = v.wind_speed;
    run(p);
  };

  return (
    <Row gutter={40}>
      <Col xs={24} lg={12}>
        <PipeFormulaDisplay />
      </Col>
      <Col xs={24} lg={12}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: '#333' }}>Проверить расчёт</div>
        <Form form={form} layout="vertical" initialValues={{ location: 'outdoor' }}>
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
            <Col span={12}>
              <Form.Item name="insulation_thickness_mm" label="Толщина изоляции, мм" rules={[{ required: true }]}>
                <InputNumber min={1} max={500} style={{ width: '100%' }} placeholder="50" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="insulation_material" label="Материал изоляции" rules={[{ required: true }]}>
                <Select placeholder="Выберите материал">
                  {insulation.map((m) => <Select.Option key={m.material} value={m.material}>{m.name}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
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
  const { data: insulation = [] } = useQuery({ queryKey: ['references', 'insulation'], queryFn: getInsulation });
  const shape = Form.useWatch('shape', form) ?? 'cylindrical';

  const onCalc = async () => {
    const v = await form.validateFields();
    const p: Record<string, unknown> = {
      shape: v.shape,
      insulation_thickness: v.insulation_thickness_mm / 1000,
      insulation_material: v.insulation_material,
      process_temperature: v.process_temperature,
      ambient_temperature: v.ambient_temperature,
      location: v.location ?? 'outdoor',
    };
    if (v.wind_speed != null) p.wind_speed = v.wind_speed;
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
        <Form form={form} layout="vertical" initialValues={{ shape: 'cylindrical', location: 'outdoor' }}>
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
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="insulation_thickness_mm" label="Толщина изоляции, мм" rules={[{ required: true }]}>
                <InputNumber min={1} max={500} style={{ width: '100%' }} placeholder="80" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="insulation_material" label="Материал изоляции" rules={[{ required: true }]}>
                <Select placeholder="Выберите материал">
                  {insulation.map((m) => <Select.Option key={m.material} value={m.material}>{m.name}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
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
          <Form.Item name="wind_speed" label="Скорость ветра, м/с" style={{ maxWidth: 200 }}>
            <InputNumber min={0} max={20} style={{ width: '100%' }} placeholder="5" />
          </Form.Item>
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
    if (v.process_temperature != null) p.process_temperature = v.process_temperature;
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
        <Form form={form} layout="vertical" initialValues={{ supply_voltage: 220 }}>
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
          <Button type="primary" onClick={onCalc} loading={loading}>Подобрать кабель</Button>
        </Form>
        {error && <Alert style={{ marginTop: 14 }} type="error" message={error} />}
        {result && <CalcResult result={result} type="electrical" />}
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
          { key: 'pipe',       label: 'Трубопровод',  children: <PipeTab /> },
          { key: 'tank',       label: 'Резервуар',    children: <TankTab /> },
          { key: 'electrical', label: 'Электрорасчёт',children: <ElecTab /> },
        ]}
      />
    </Card>
  );
}
