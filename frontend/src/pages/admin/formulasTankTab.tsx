import { useMemo } from 'react';
import {
 Col,
 Form,
 Row,
 Typography,
} from 'antd';
import { TltAlert, TltButton, TltNumberField, TltSelect } from '@/components/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getInsulation } from '@/api/references';
import { buildInsulationReferenceOptions } from '@/utils/referenceOptions';
import CalcResult from '@/components/admin/formulas/FormulaCalcResult';
import { TankFormulaDisplay } from '@/components/admin/formulas/FormulaDisplays';
import '@/pages/admin/formulas-tabs.css';
import {
 assignIfPresent,
 collectInsulationLayers,
 useFormulaCalc,
} from '@/pages/admin/useFormulaCalc';

const { Title } = Typography;

export function FormulasTankTab() {
 const [form] = Form.useForm();
 const { result, error, loading, run } = useFormulaCalc('tank');
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
 const placement = Form.useWatch('placement', form) ?? 'outdoor';

 const onCalc = async () => {
    const v = await form.validateFields();
    const layers = collectInsulationLayers(v);
    const p: Record<string, unknown> = {
      shape: v.shape,
      insulation_layers: layers,
      process_temperature: v.process_temperature,
      ambient_temperature: v.ambient_temperature,
      placement: v.placement,
      insulation_temperature_basis: v.insulation_temperature_basis,
      safety_factor: v.safety_factor,
      q_additional: v.q_additional,
    };
    assignIfPresent(p, 'wall_thickness', v.wall_thickness_mm, (x) => Number(x) / 1000);
    assignIfPresent(p, 'wall_lambda', v.wall_lambda);
    if (v.placement === 'underground') {
      assignIfPresent(p, 'ground_temperature', v.ground_temperature);
      assignIfPresent(p, 'tank_buried_height', v.tank_buried_height);
      assignIfPresent(p, 'ground_conductivity', v.ground_conductivity);
    }
    assignIfPresent(p, 'wind_speed', v.wind_speed);
    assignIfPresent(p, 'alpha_vnesh', v.alpha_vnesh);
    if (v.shape === 'cylindrical' || v.shape === 'spherical') {
      p.diameter = v.diameter_mm / 1000;
      if (v.shape === 'cylindrical') p.height = v.height_mm / 1000;
    } else {
      p.length = v.length_mm / 1000;
      p.width = v.width_mm / 1000;
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
        <Title level={5}>Проверить расчёт</Title>
        <Form
          form={form}
          name="tank_formula_check"
          layout="vertical"
          initialValues={{
            shape: 'cylindrical',
            placement: 'outdoor',
            insulation_temperature_basis: 'outdoor_winter',
            insulation_material_1: 'mineral_wool_boards_120',
            wind_speed: 0,
            safety_factor: 1.1,
            q_additional: 0,
          }}
        >
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="shape" label="Форма" rules={[{ required: true }]}>
                <TltSelect
                  options={[
                    { value: 'cylindrical', label: 'Цилиндр' },
                    { value: 'rectangular', label: 'Параллелепипед' },
                    { value: 'spherical', label: 'Шар' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="placement" label="Размещение" rules={[{ required: true }]}>
                <TltSelect
                  options={[
                    { value: 'outdoor', label: 'Надземное' },
                    { value: 'indoor', label: 'В помещении' },
                    { value: 'underground', label: 'Частично заглублённое', disabled: shape === 'spherical' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="insulation_temperature_basis" label="tm изоляции" rules={[{ required: true }]}>
                <TltSelect
                  options={[
                    { value: 'outdoor_winter', label: 'Улица, зима' },
                    { value: 'outdoor_summer', label: 'Улица, лето' },
                    { value: 'indoor', label: 'Помещение' },
                    { value: 'channel', label: 'Канал' },
                    { value: 'tunnel', label: 'Тоннель' },
                    { value: 'technical_subfloor', label: 'Подполье' },
                    { value: 'attic', label: 'Чердак' },
                    { value: 'basement', label: 'Подвал' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          {(shape === 'cylindrical' || shape === 'spherical') && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="diameter_mm" label="Диаметр, мм" rules={[{ required: true }]}>
                  <TltNumberField min={100} max={30000} className="tlt-field--fill" placeholder="2000" />
                </Form.Item>
              </Col>
              {shape === 'cylindrical' && (
                <Col span={12}>
                  <Form.Item name="height_mm" label="Высота, мм" rules={[{ required: true }]}>
                    <TltNumberField min={100} max={50000} className="tlt-field--fill" placeholder="3000" />
                  </Form.Item>
                </Col>
              )}
            </Row>
          )}
          {shape === 'rectangular' && (
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="length_mm" label="Длина, мм" rules={[{ required: true }]}>
                  <TltNumberField min={100} max={100000} className="tlt-field--fill" placeholder="5000" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="width_mm" label="Ширина, мм" rules={[{ required: true }]}>
                  <TltNumberField min={100} max={100000} className="tlt-field--fill" placeholder="3000" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="height_mm" label="Высота, мм" rules={[{ required: true }]}>
                  <TltNumberField min={100} max={50000} className="tlt-field--fill" placeholder="4000" />
                </Form.Item>
              </Col>
            </Row>
          )}
          {[1, 2, 3].map((i) => (
            <Row gutter={12} key={i}>
              <Col span={8}>
                <Form.Item name={`insulation_thickness_${i}_mm`} label={`Слой ${i}, мм`} rules={i === 1 ? [{ required: true }] : undefined}>
                <TltNumberField min={1} max={500} className="tlt-field--fill" placeholder="80" />
              </Form.Item>
            </Col>
              <Col span={8}>
                <Form.Item name={`insulation_material_${i}`} label={`Материал изоляции ${i}`} rules={i === 1 ? [{ required: true }] : undefined}>
                <TltSelect
                  placeholder="Выберите материал"
                  options={insulationOptions}
                />
              </Form.Item>
            </Col>
              <Col span={8}>
                <Form.Item name={`insulation_conductivity_${i}`} label={`λ слоя ${i} вручную`}>
                  <TltNumberField min={0.001} max={400} className="tlt-field--fill" placeholder="из справочника" />
                </Form.Item>
              </Col>
            </Row>
          ))}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="process_temperature" label="T продукта, °C" rules={[{ required: true }]}>
                <TltNumberField min={-90} max={600} className="tlt-field--fill" placeholder="60" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ambient_temperature" label="T окружающей среды, °C" rules={[{ required: true }]}>
                <TltNumberField min={-70} max={70} className="tlt-field--fill" placeholder="-20" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="wall_thickness_mm" label="Стенка, мм">
                <TltNumberField min={1} max={500} className="tlt-field--fill" placeholder="8" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="wall_lambda" label="λ стенки">
                <TltNumberField min={0.001} max={400} className="tlt-field--fill" placeholder="45" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="q_additional" label="Qдоп, Вт">
                <TltNumberField min={0} className="tlt-field--fill" placeholder="0" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="wind_speed" label="Скорость ветра, м/с">
                <TltNumberField min={0} max={20} className="tlt-field--fill" placeholder="5" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="alpha_vnesh" label="α вручную">
                <TltNumberField min={7} max={52} className="tlt-field--fill" placeholder="из ветра" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="safety_factor" label="K запаса" rules={[{ required: true }]}>
                <TltNumberField min={1} max={1.7} step={0.05} className="tlt-field--fill" placeholder="1.1" />
              </Form.Item>
            </Col>
          </Row>
          {placement === 'underground' && (
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="ground_temperature" label="T грунта, °C" rules={[{ required: true }]}>
                  <TltNumberField min={-70} max={70} className="tlt-field--fill" placeholder="5" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="tank_buried_height" label="Высота заглублённой части, м" rules={[{ required: true }]}>
                  <TltNumberField min={0.01} max={50} className="tlt-field--fill" placeholder="1" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="ground_conductivity" label="λ грунта" rules={[{ required: true }]}>
                  <TltNumberField min={0.5} max={3} className="tlt-field--fill" placeholder="1.5" />
                </Form.Item>
              </Col>
            </Row>
          )}
          <TltButton variant="primary" onClick={onCalc} loading={loading}>Рассчитать</TltButton>
        </Form>
        {error && <TltAlert className="formulas-tab-alert" tone="danger" title={error} />}
        {result && <CalcResult result={result} type="tank" />}
      </Col>
    </Row>
 );
}

// ─── Вкладка: Электрорасчёт ───────────────────────────────────────────────────
