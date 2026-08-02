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
import { PipeFormulaDisplay } from '@/components/admin/formulas/FormulaDisplays';
import {
 assignIfPresent,
 collectInsulationLayers,
 useFormulaCalc,
} from '@/pages/admin/useFormulaCalc';

import '@/pages/admin/formulas-tabs.css';

const { Title } = Typography;

export function FormulasPipeTab() {
 const [form] = Form.useForm();
 const { result, error, loading, run } = useFormulaCalc('pipe');
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
    const layers = collectInsulationLayers(v);
    const p: Record<string, unknown> = {
      outer_diameter: v.outer_diameter_mm / 1000,
      pipe_length: v.pipe_length,
      insulation_layers: layers,
      process_temperature: v.process_temperature,
      placement: v.placement ?? 'outdoor',
      insulation_temperature_basis: v.insulation_temperature_basis,
    };
    if (p.placement !== 'underground') assignIfPresent(p, 'ambient_temperature', v.ambient_temperature);
    assignIfPresent(p, 'wall_thickness', v.wall_thickness_mm, (x) => Number(x) / 1000);
    if (v.pipe_lambda != null) assignIfPresent(p, 'pipe_lambda', v.pipe_lambda);
    else assignIfPresent(p, 'pipe_material', v.pipe_material);
    if (p.placement === 'underground') {
      assignIfPresent(p, 'ground_temperature', v.ground_temperature);
      assignIfPresent(p, 'pipe_centerline_depth', v.pipe_centerline_depth);
      assignIfPresent(p, 'ground_conductivity', v.ground_conductivity);
    }
    assignIfPresent(p, 'num_local_elements', v.num_local_elements);
    assignIfPresent(p, 'local_element_equiv_length', v.local_element_equiv_length);
    if (p.placement !== 'underground') {
      assignIfPresent(p, 'wind_speed', v.wind_speed);
      assignIfPresent(p, 'alpha_vnesh', v.alpha_vnesh);
    }
    assignIfPresent(p, 'safety_factor', v.safety_factor);
    run(p);
 };

 return (
    <Row gutter={40}>
      <Col xs={24} lg={12}>
        <PipeFormulaDisplay />
      </Col>
      <Col xs={24} lg={12}>
        <Title level={5}>Проверить расчёт</Title>
        <Form form={form} name="pipe_formula_check" layout="vertical" initialValues={{ placement: 'outdoor', insulation_temperature_basis: 'outdoor_winter', insulation_material_1: 'mineral_wool_boards_120' }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="outer_diameter_mm" label="Нар. диаметр трубы, мм" rules={[{ required: true }]}>
                <TltNumberField min={11} max={3000} className="tlt-field--fill" placeholder="108" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pipe_length" label="Длина трубопровода, м" rules={[{ required: true }]}>
                <TltNumberField min={0.5} max={200000} className="tlt-field--fill" placeholder="100" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="wall_thickness_mm" label="Стенка, мм">
                <TltNumberField min={0.1} max={40} className="tlt-field--fill" placeholder="4" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="pipe_material" label="Материал трубы">
                <TltSelect
                  allowClear
                  placeholder="Справочник"
                  options={[
                    { value: 'carbon_steel', label: 'Сталь углеродистая' },
                    { value: 'stainless_304', label: 'Нерж. сталь 304' },
                    { value: 'copper', label: 'Медь' },
                    { value: 'aluminum', label: 'Алюминий' },
                    { value: 'plastic', label: 'Пластик' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="pipe_lambda" label="λ трубы вручную">
                <TltNumberField min={0.001} max={400} className="tlt-field--fill" placeholder="45" />
              </Form.Item>
            </Col>
          </Row>
          {[1, 2, 3].map((i) => (
            <Row gutter={12} key={i}>
              <Col span={8}>
                <Form.Item name={`insulation_thickness_${i}_mm`} label={`Слой ${i}, мм`} rules={i === 1 ? [{ required: true }] : undefined}>
                <TltNumberField min={1} max={500} className="tlt-field--fill" placeholder="50" />
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
                <TltNumberField min={-90} max={600} className="tlt-field--fill" placeholder="80" />
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
              <Form.Item name="pipe_centerline_depth" label="Глубина оси трубы, м">
                <TltNumberField min={0} max={200} className="tlt-field--fill" placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ground_conductivity" label="λ грунта">
                <TltNumberField min={0.5} max={3} className="tlt-field--fill" placeholder="1.5" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ground_temperature" label="T грунта, °C">
                <TltNumberField min={-70} max={70} className="tlt-field--fill" placeholder="5" />
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
              <Form.Item name="placement" label="Размещение">
                <TltSelect
                  options={[
                    { value: 'outdoor', label: 'Надземное' },
                    { value: 'indoor', label: 'В помещении' },
                    { value: 'underground', label: 'Подземное' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="alpha_vnesh" label="α вручную">
                <TltNumberField min={7} max={52} className="tlt-field--fill" placeholder="из ветра" />
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
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="num_local_elements" label="Лок. элементы, шт">
                <TltNumberField min={0} max={100} className="tlt-field--fill" placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="local_element_equiv_length" label="Lэкв, м">
                <TltNumberField min={0.1} max={6.9} className="tlt-field--fill" placeholder="1" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="safety_factor" label="K запаса">
                <TltNumberField min={1.05} max={1.7} step={0.05} className="tlt-field--fill" placeholder="1.1" />
              </Form.Item>
            </Col>
          </Row>
          <TltButton variant="primary" onClick={onCalc} loading={loading}>Рассчитать</TltButton>
        </Form>
        {error && <TltAlert className="formulas-tab-alert" tone="danger" title={error} />}
        {result && <CalcResult result={result} type="pipe" />}
      </Col>
    </Row>
 );
}

// ─── Вкладка: Резервуар ───────────────────────────────────────────────────────
