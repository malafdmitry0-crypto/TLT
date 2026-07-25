import {
 Col,
 Form,
 Row,
 Typography,
} from 'antd';
import CalcResult from '@/components/admin/formulas/FormulaCalcResult';
import { TTFormulaDisplay } from '@/components/admin/formulas/FormulaDisplays';
import { assignIfPresent, useFormulaCalc } from '@/pages/admin/useFormulaCalc';
import { TltAlert, TltButton, TltNumberField, TltSelect, TltTextField } from '@/components/ui-kit';

import '@/pages/admin/formulas-tabs.css';

const { Title } = Typography;

export function FormulasTTTab() {
 const [form] = Form.useForm();
 const { result, error, loading, run } = useFormulaCalc('electrical_tt');
 const tankShape = Form.useWatch('tank_shape', form);

 const onCalc = async () => {
    const v = await form.validateFields();
    const aggressive = v.aggressive_product === true || v.aggressive_product === 'true';
    const p: Record<string, unknown> = {
      required_power_per_meter: v.required_power_per_meter,
      pipe_length: v.pipe_length,
      process_temperature: v.process_temperature,
      maintain_temperature: v.maintain_temperature,
      supply_voltage: v.supply_voltage ?? 220,
      aggressive_product: aggressive,
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
        <Title level={5}>Проверить расчёт ТТ</Title>
        <Form form={form} name="tt_formula_check" layout="vertical" initialValues={{ supply_voltage: 220, aggressive_product: 'false', winding_coefficient: 1.1, safety_factor: 1.1 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="required_power_per_meter" label="Требуемая мощность, Вт/м" rules={[{ required: true }]}>
                <TltNumberField min={0.1} className="tlt-field--fill" placeholder="30" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pipe_length" label="Длина, м" rules={[{ required: true }]}>
                <TltNumberField min={0.1} className="tlt-field--fill" placeholder="50" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="process_temperature" label="T продукта, °C" rules={[{ required: true }]}>
                <TltNumberField min={-90} max={600} className="tlt-field--fill" placeholder="60" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="vapor_temperature" label="T пропарки, °C">
                <TltNumberField className="tlt-field--fill" placeholder="85" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="maintain_temperature" label="T3 поддержания, °C (необяз.)">
                <TltNumberField min={-90} max={600} className="tlt-field--fill" placeholder="по умолчанию T продукта" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="supply_voltage" label="U, В">
                <TltNumberField min={1} className="tlt-field--fill" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="safety_factor" label="K запаса">
                <TltNumberField min={1} max={2} step={0.05} className="tlt-field--fill" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="aggressive_product" label="Среда">
                <TltSelect
                  options={[
                    { value: 'false', label: 'Обычная' },
                    { value: 'true', label: 'Агрессивная' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="winding_coefficient" label="Коэф. укладки">
                <TltNumberField min={1} max={10} step={0.1} className="tlt-field--fill" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="winding_pitch" label="Шаг навива, мм">
                <TltNumberField min={0} className="tlt-field--fill" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="number_of_threads" label="Нитки">
                <TltNumberField min={1} max={100} className="tlt-field--fill" placeholder="авто" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="cable_mark" label="Марка кабеля">
                <TltTextField placeholder="пусто = автоподбор" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tank_shape" label="Геометрия резервуара">
                <TltSelect
                  allowClear
                  placeholder="не использовать"
                  options={[
                    { value: 'cylindrical', label: 'Цилиндр' },
                    { value: 'rectangular', label: 'Параллелепипед' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          {tankShape === 'cylindrical' && (
            <Form.Item name="tank_diameter_mm" label="Диаметр резервуара, мм" rules={[{ required: true }]}>
              <TltNumberField min={100} max={30000} className="tlt-field--fill" />
            </Form.Item>
          )}
          {tankShape === 'rectangular' && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="tank_length_mm" label="Длина резервуара, мм" rules={[{ required: true }]}>
                  <TltNumberField min={100} max={100000} className="tlt-field--fill" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="tank_width_mm" label="Ширина резервуара, мм" rules={[{ required: true }]}>
                  <TltNumberField min={100} max={100000} className="tlt-field--fill" />
                </Form.Item>
              </Col>
            </Row>
          )}
          {tankShape && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="heating_height" label="Высота обогрева, м" rules={[{ required: true }]}>
                  <TltNumberField min={0.001} className="tlt-field--fill" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="laying_step" label="Шаг укладки, м" rules={[{ required: true }]}>
                  <TltNumberField min={0.1} max={0.4} step={0.01} className="tlt-field--fill" />
                </Form.Item>
              </Col>
            </Row>
          )}
          <TltButton variant="primary" onClick={onCalc} loading={loading}>Подобрать кабель</TltButton>
        </Form>
        {error && <TltAlert className="formulas-tab-alert" tone="danger" title={error} />}
        {result && <CalcResult result={result} type="electrical_tt" />}
      </Col>
    </Row>
 );
}
