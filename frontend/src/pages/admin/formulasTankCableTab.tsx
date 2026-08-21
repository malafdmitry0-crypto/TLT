import {
 Col,
 Form,
 Row,
} from 'antd';
import CalcResult from '@/components/admin/formulas/FormulaCalcResult';
import { TankCableGeometryDisplay } from '@/components/admin/formulas/FormulaDisplays';
import { assignIfPresent, useFormulaCalc } from '@/pages/admin/useFormulaCalc';
import { TltAlert, TltButton, TltNumberField, TltSelect } from '@/components/ui-kit';

import '@/pages/admin/formulas-tabs.css';

export function FormulasTankCableTab() {
 const [form] = Form.useForm();
 const shape = Form.useWatch('shape', form) ?? 'cylindrical';
 const { result, error, loading, run } = useFormulaCalc('tank_cable_geometry');

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
        <div className="formulas-tab-panel-title">Проверить геометрию укладки</div>
        <Form form={form} name="tank_cable_formula_check" layout="vertical" initialValues={{ shape: 'cylindrical' }}>
          <Form.Item name="shape" label="Форма" rules={[{ required: true }]}>
            <TltSelect
              options={[
                { value: 'cylindrical', label: 'Цилиндр' },
                { value: 'rectangular', label: 'Параллелепипед' },
              ]}
            />
          </Form.Item>
          {shape === 'cylindrical' ? (
            <Form.Item name="diameter_mm" label="Диаметр, мм" rules={[{ required: true }]}>
              <TltNumberField min={1} className="tlt-field--fill" placeholder="2000" />
            </Form.Item>
          ) : (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="length_mm" label="Длина, мм" rules={[{ required: true }]}>
                  <TltNumberField min={1} className="tlt-field--fill" placeholder="5000" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="width_mm" label="Ширина, мм" rules={[{ required: true }]}>
                  <TltNumberField min={1} className="tlt-field--fill" placeholder="3000" />
                </Form.Item>
              </Col>
            </Row>
          )}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="heating_height" label="Высота обогрева, м" rules={[{ required: true }]}>
                <TltNumberField min={0.001} className="tlt-field--fill" placeholder="2" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="laying_step" label="Шаг укладки, м" rules={[{ required: true }]}>
                <TltNumberField min={0.1} max={0.4} step={0.01} className="tlt-field--fill" placeholder="0.2" />
              </Form.Item>
            </Col>
          </Row>
          <TltButton variant="primary" onClick={onCalc} loading={loading}>Рассчитать</TltButton>
        </Form>
        {error && <TltAlert className="formulas-tab-alert" tone="danger" title={error} />}
        {result && <CalcResult result={result} type="tank_cable_geometry" />}
      </Col>
    </Row>
 );
}
