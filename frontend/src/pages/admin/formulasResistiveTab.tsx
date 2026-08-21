import {
 Col,
 Form,
 Row,
} from 'antd';
import CalcResult from '@/components/admin/formulas/FormulaCalcResult';
import { ResistiveFormulaDisplay } from '@/components/admin/formulas/FormulaDisplays';
import { assignIfPresent, useFormulaCalc } from '@/pages/admin/useFormulaCalc';
import { TltAlert, TltButton, TltNumberField, TltSelect } from '@/components/ui-kit';

import '@/pages/admin/formulas-tabs.css';

export function FormulasResistiveTab() {
 const [form] = Form.useForm();
 const cableKind = Form.useWatch('cable_kind', form) ?? 'resistive_single';
 const tankShape = Form.useWatch('tank_shape', form);
 const { result, error, loading, run } = useFormulaCalc(cableKind);

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
        <div className="formulas-tab-panel-title">Проверить резистивный кабель</div>
        <Form form={form} name="resistive_formula_check" layout="vertical" initialValues={{ cable_kind: 'resistive_single', selection_mode: 'manual', connection_type: 'line_1ph', supply_voltage: 220, winding_coefficient: 1, number_of_threads: 1 }}>
          <Form.Item name="cable_kind" label="Тип кабеля">
            <TltSelect
              options={[
                { value: 'resistive_single', label: 'ТТ Р1 одножильный' },
                { value: 'resistive_three', label: 'ТТ Р3 трёхжильный' },
              ]}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="required_heat_loss" label="Q треб., Вт" rules={[{ required: true }]}>
                <TltNumberField min={0.1} className="tlt-field--fill" placeholder="1000" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pipe_length" label="Длина, м" rules={[{ required: true }]}>
                <TltNumberField min={0.1} className="tlt-field--fill" placeholder="50" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="selection_mode" label="Режим подбора">
            <TltSelect
              options={[
                { value: 'manual', label: 'Ручная схема' },
                { value: 'auto', label: 'Auto VSDX U/N/M' },
              ]}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="add_length" label="Lдоп, м">
                <TltNumberField min={0} className="tlt-field--fill" placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="process_temperature" label="T продукта, °C" rules={[{ required: true }]}>
                <TltNumberField className="tlt-field--fill" placeholder="60" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="supply_voltage" label="U, В">
                <TltNumberField min={1} className="tlt-field--fill" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="connection_type" label="Схема подключения">
            {cableKind === 'resistive_single' ? (
              <TltSelect
                options={[
                  { value: 'line_1ph', label: 'Линия 220В' },
                  { value: 'loop_1ph', label: 'Петля 220В' },
                  { value: 'star_3ph', label: 'Звезда 380В' },
                ]}
              />
            ) : (
              <TltSelect
                options={[
                  { value: 'line_1ph', label: 'Линия' },
                  { value: 'loop_2x3', label: 'Петля 2×3ж' },
                  { value: 'loop_1x3', label: 'Петля 1×3ж' },
                  { value: 'star_3x3', label: 'Звезда 3×3ж' },
                  { value: 'star_1x3', label: 'Звезда 1×3ж' },
                ]}
              />
            )}
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="winding_coefficient" label="Коэф. навива">
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
                <TltNumberField min={1} max={3} className="tlt-field--fill" />
              </Form.Item>
            </Col>
          </Row>
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
        {result && <CalcResult result={result} type={cableKind} />}
      </Col>
    </Row>
 );
}
