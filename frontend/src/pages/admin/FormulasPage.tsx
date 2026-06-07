import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
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
import CalcResult from '@/components/admin/formulas/FormulaCalcResult';
import {
  ElecFormulaDisplay,
  PipeFormulaDisplay,
  ResistiveFormulaDisplay,
  TankCableGeometryDisplay,
  TankFormulaDisplay,
  TTFormulaDisplay,
} from '@/components/admin/formulas/FormulaDisplays';

const { Text } = Typography;

type FormulaType =
  | 'pipe'
  | 'tank'
  | 'electrical'
  | 'electrical_tt'
  | 'resistive_single'
  | 'resistive_three'
  | 'tank_cable_geometry';

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
      insulation_temperature_basis: v.insulation_temperature_basis,
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
        <Form form={form} name="pipe_formula_check" layout="vertical" initialValues={{ location: 'outdoor', insulation_temperature_basis: 'outdoor_winter', insulation_material_1: 'mineral_wool_boards_120' }}>
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
                <InputNumber min={0.5} max={3} style={{ width: '100%' }} placeholder="1.5" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="alpha_vnesh" label="α вручную">
                <InputNumber min={7} max={52} style={{ width: '100%' }} placeholder="из ветра" />
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
              <Form.Item name="location" label="Размещение">
                <Select>
                  <Select.Option value="outdoor">Надземное</Select.Option>
                  <Select.Option value="indoor">В помещении</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="insulation_temperature_basis" label="tm изоляции" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="outdoor_winter">Улица, зима</Select.Option>
                  <Select.Option value="outdoor_summer">Улица, лето</Select.Option>
                  <Select.Option value="indoor">Помещение</Select.Option>
                  <Select.Option value="channel">Канал</Select.Option>
                  <Select.Option value="tunnel">Тоннель</Select.Option>
                  <Select.Option value="technical_subfloor">Подполье</Select.Option>
                  <Select.Option value="attic">Чердак</Select.Option>
                  <Select.Option value="basement">Подвал</Select.Option>
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
      insulation_temperature_basis: v.insulation_temperature_basis,
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
        <Form form={form} name="tank_formula_check" layout="vertical" initialValues={{ shape: 'cylindrical', location: 'outdoor', insulation_temperature_basis: 'outdoor_winter', insulation_material_1: 'mineral_wool_boards_120' }}>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="shape" label="Форма" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="cylindrical">Цилиндр</Select.Option>
                  <Select.Option value="rectangular">Параллелепипед</Select.Option>
                  <Select.Option value="spherical">Шар</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="location" label="Размещение">
                <Select>
                  <Select.Option value="outdoor">Надземное</Select.Option>
                  <Select.Option value="indoor">В помещении</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="insulation_temperature_basis" label="tm изоляции" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="outdoor_winter">Улица, зима</Select.Option>
                  <Select.Option value="outdoor_summer">Улица, лето</Select.Option>
                  <Select.Option value="indoor">Помещение</Select.Option>
                  <Select.Option value="channel">Канал</Select.Option>
                  <Select.Option value="tunnel">Тоннель</Select.Option>
                  <Select.Option value="technical_subfloor">Подполье</Select.Option>
                  <Select.Option value="attic">Чердак</Select.Option>
                  <Select.Option value="basement">Подвал</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          {(shape === 'cylindrical' || shape === 'spherical') && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="diameter_mm" label="Диаметр, мм" rules={[{ required: true }]}>
                  <InputNumber min={100} max={30000} style={{ width: '100%' }} placeholder="2000" />
                </Form.Item>
              </Col>
              {shape === 'cylindrical' && (
                <Col span={12}>
                  <Form.Item name="height_mm" label="Высота, мм" rules={[{ required: true }]}>
                    <InputNumber min={100} max={50000} style={{ width: '100%' }} placeholder="3000" />
                  </Form.Item>
                </Col>
              )}
            </Row>
          )}
          {shape === 'rectangular' && (
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="length_mm" label="Длина, мм" rules={[{ required: true }]}>
                  <InputNumber min={100} max={100000} style={{ width: '100%' }} placeholder="5000" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="width_mm" label="Ширина, мм" rules={[{ required: true }]}>
                  <InputNumber min={100} max={100000} style={{ width: '100%' }} placeholder="3000" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="height_mm" label="Высота, мм" rules={[{ required: true }]}>
                  <InputNumber min={100} max={50000} style={{ width: '100%' }} placeholder="4000" />
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
                <InputNumber min={0.5} max={3} style={{ width: '100%' }} placeholder="1.5" />
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
      process_temperature: v.process_temperature,
    };
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
        <Form form={form} name="tlt_formula_check" layout="vertical" initialValues={{ supply_voltage: 220, process_temperature: 80, safety_factor: 1.1, winding_coefficient: 1, number_of_threads: 1 }}>
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
              <Form.Item name="process_temperature" label="T продукта, °C" rules={[{ required: true }]}>
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
            <Form.Item name="tank_diameter_mm" label="Диаметр резервуара, мм" rules={[{ required: true }]}><InputNumber min={100} max={30000} style={{ width: '100%' }} /></Form.Item>
          )}
          {tankShape === 'rectangular' && (
            <Row gutter={12}>
              <Col span={12}><Form.Item name="tank_length_mm" label="Длина резервуара, мм" rules={[{ required: true }]}><InputNumber min={100} max={100000} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="tank_width_mm" label="Ширина резервуара, мм" rules={[{ required: true }]}><InputNumber min={100} max={100000} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
          )}
          {tankShape && (
            <Row gutter={12}>
              <Col span={12}><Form.Item name="heating_height" label="Высота обогрева, м" rules={[{ required: true }]}><InputNumber min={0.001} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="laying_step" label="Шаг укладки, м" rules={[{ required: true }]}><InputNumber min={0.1} max={0.4} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
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
      selection_mode: v.selection_mode ?? 'manual',
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
        <Form form={form} name="resistive_formula_check" layout="vertical" initialValues={{ cable_kind: 'resistive_single', selection_mode: 'manual', connection_type: 'line_1ph', supply_voltage: 220, winding_coefficient: 1, number_of_threads: 1 }}>
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
          <Form.Item name="selection_mode" label="Режим подбора">
            <Select>
              <Select.Option value="manual">Ручная схема</Select.Option>
              <Select.Option value="auto">Auto VSDX U/N/M</Select.Option>
            </Select>
          </Form.Item>
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
          {tankShape === 'cylindrical' && <Form.Item name="tank_diameter_mm" label="Диаметр резервуара, мм" rules={[{ required: true }]}><InputNumber min={100} max={30000} style={{ width: '100%' }} /></Form.Item>}
          {tankShape === 'rectangular' && (
            <Row gutter={12}>
              <Col span={12}><Form.Item name="tank_length_mm" label="Длина резервуара, мм" rules={[{ required: true }]}><InputNumber min={100} max={100000} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="tank_width_mm" label="Ширина резервуара, мм" rules={[{ required: true }]}><InputNumber min={100} max={100000} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
          )}
          {tankShape && (
            <Row gutter={12}>
              <Col span={12}><Form.Item name="heating_height" label="Высота обогрева, м" rules={[{ required: true }]}><InputNumber min={0.001} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="laying_step" label="Шаг укладки, м" rules={[{ required: true }]}><InputNumber min={0.1} max={0.4} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
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
            <Col span={12}><Form.Item name="laying_step" label="Шаг укладки, м" rules={[{ required: true }]}><InputNumber min={0.1} max={0.4} step={0.01} style={{ width: '100%' }} placeholder="0.2" /></Form.Item></Col>
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
