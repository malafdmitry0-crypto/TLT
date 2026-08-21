import {
 Col,
 Form,
 Row,
 Typography,
} from 'antd';
import CalcResult from '@/components/admin/formulas/FormulaCalcResult';
import { ElecFormulaDisplay } from '@/components/admin/formulas/FormulaDisplays';
import { assignIfPresent, useFormulaCalc } from '@/pages/admin/useFormulaCalc';
import { TltAlert, TltButton, TltNumberField, TltTextField } from '@/components/ui-kit';

import '@/pages/admin/formulas-tabs.css';

const { Text } = Typography;

export function FormulasElecTab() {
 const [form] = Form.useForm();
 const { result, error, loading, run } = useFormulaCalc('electrical');

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
        <div className="formulas-tab-hint">
          Поле «Требуемая мощность» = <Text code className="formulas-tab-hint__code">heat_loss_per_meter_base</Text> (до K) из результата расчёта теплопотерь.
        </div>
      </Col>
      <Col xs={24} lg={12}>
        <div className="formulas-tab-panel-title">Подобрать кабель</div>
        <Form form={form} name="tlt_formula_check" layout="vertical" initialValues={{ supply_voltage: 220, process_temperature: 80, safety_factor: 1.1, winding_coefficient: 1, number_of_threads: 1 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="required_power_per_meter" label="Требуемая мощность, Вт/м" rules={[{ required: true }]}>
                <TltNumberField min={0.1} max={5000} className="tlt-field--fill" placeholder="45" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pipe_length" label="Длина трубопровода, м" rules={[{ required: true }]}>
                <TltNumberField min={0.5} max={200000} className="tlt-field--fill" placeholder="100" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="ambient_temperature" label="T окружающей среды, °C" rules={[{ required: true }]}>
                <TltNumberField min={-70} max={70} className="tlt-field--fill" placeholder="-20" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="process_temperature" label="T продукта, °C" rules={[{ required: true }]}>
                <TltNumberField min={-90} max={600} className="tlt-field--fill" placeholder="80" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="supply_voltage" label="Напряжение питания, В" className="formulas-tab-field--narrow">
            <TltNumberField min={1} max={1000} className="tlt-field--fill" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="cable_mark" label="Марка кабеля">
                <TltTextField placeholder="пусто = автоподбор" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="safety_factor" label="K запаса">
                <TltNumberField min={1} max={2} step={0.05} className="tlt-field--fill" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="winding_coefficient" label="Коэф. навива">
                <TltNumberField min={1} max={10} step={0.1} className="tlt-field--fill" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="winding_pitch" label="Шаг навива, мм">
                <TltNumberField min={0} className="tlt-field--fill" placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="number_of_threads" label="Нитки">
                <TltNumberField min={1} max={3} className="tlt-field--fill" />
              </Form.Item>
            </Col>
          </Row>
          <TltButton variant="primary" onClick={onCalc} loading={loading}>Подобрать кабель</TltButton>
        </Form>
        {error && <TltAlert className="formulas-tab-alert" tone="danger" title={error} />}
        {result && <CalcResult result={result} type="electrical" />}
      </Col>
    </Row>
 );
}
