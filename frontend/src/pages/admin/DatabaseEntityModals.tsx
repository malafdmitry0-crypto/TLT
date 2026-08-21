/**
 * Admin DatabasePage create/edit modals (P-BAND-02).
 */
import { Form, Modal, Space, Switch, Typography } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { TltNumberField, TltSelect, TltTextField } from '@/components/ui-kit';
import type { AccessoryFormValues, CableFormValues } from '@/pages/admin/databasePagePayloadModel';

const { Paragraph, Text } = Typography;

type CableModalProps = {
  open: boolean;
  editing: boolean;
  form: FormInstance<CableFormValues>;
  confirmLoading: boolean;
  onCancel: () => void;
  onSubmit: (values: CableFormValues) => void;
};

type AccessoryModalProps = {
  open: boolean;
  editing: boolean;
  form: FormInstance<AccessoryFormValues>;
  confirmLoading: boolean;
  onCancel: () => void;
  onSubmit: (values: AccessoryFormValues) => void;
};

export function DatabaseCableModal({
  open,
  editing,
  form,
  confirmLoading,
  onCancel,
  onSubmit,
}: CableModalProps) {
  return (
    <Modal
      title={editing ? 'Редактировать кабель' : 'Добавить кабель'}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={confirmLoading}
      width={920}
    >
      <Paragraph type="secondary">
        Для резистивного кабеля сопротивление хранится как <Text code>Ом/м</Text>,
        а сечение жилы сохраняется в params как <Text code>conductor_section_mm2</Text>.
        Дополнительные технические поля: <Text code>diameter_mm</Text>,
        <Text code>nominal_size_mm</Text>. Аксессуарная оценка:
        {' '}<Text code>accessory_total_cost</Text>.
      </Paragraph>
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Space align="start" wrap>
          <Form.Item name="cable_type" label="Тип" rules={[{ required: true }]}>
            <TltSelect className="tlt-field--w180"
              options={[
                { value: 'self_regulating', label: 'ТЛТ' },
                { value: 'single_core', label: 'ТТ Р1' },
                { value: 'three_core', label: 'ТТ Р3' },
                { value: 'mineral', label: 'Минеральный' },
                { value: 'skin', label: 'Skin' },
              ]}
            />
          </Form.Item>
          <Form.Item name="brand" label="Бренд" rules={[{ required: true }]}>
            <TltTextField className="tlt-field--w160" />
          </Form.Item>
          <Form.Item name="model" label="Марка" rules={[{ required: true }]}>
            <TltTextField className="tlt-field--w190" />
          </Form.Item>
          <Form.Item name="power_per_meter" label="Вт/м">
            <TltNumberField min={0} className="tlt-field--w110" />
          </Form.Item>
          <Form.Item name="resistance_per_meter" label="Ом/м">
            <TltNumberField min={0} step={0.001} className="tlt-field--w110" />
          </Form.Item>
          <Form.Item name="conductor_section_mm2" label="Сечение, мм²">
            <TltNumberField min={0} step={0.1} className="tlt-field--w120" />
          </Form.Item>
          <Form.Item name="min_temperature" label="T min">
            <TltNumberField className="tlt-field--w100" />
          </Form.Item>
          <Form.Item name="max_temperature" label="T max">
            <TltNumberField className="tlt-field--w100" />
          </Form.Item>
        </Space>
        <Space align="start" wrap>
          <Form.Item name="supplier_name" label="Поставщик">
            <TltTextField className="tlt-field--w180" />
          </Form.Item>
          <Form.Item name="article" label="Артикул">
            <TltTextField className="tlt-field--w150" />
          </Form.Item>
          <Form.Item name="price_per_meter" label="Цена/м">
            <TltNumberField min={0} step={0.01} className="tlt-field--w110" />
          </Form.Item>
          <Form.Item name="currency" label="Валюта">
            <TltTextField className="tlt-field--w90" />
          </Form.Item>
          <Form.Item name="stock_quantity_m" label="Остаток, м">
            <TltNumberField min={0} step={1} className="tlt-field--w120" />
          </Form.Item>
          <Form.Item name="stock_status" label="Статус">
            <TltSelect className="tlt-field--w130"
              allowClear
              options={[
                { value: 'in_stock', label: 'in_stock' },
                { value: 'limited', label: 'limited' },
                { value: 'on_order', label: 'on_order' },
                { value: 'unknown', label: 'unknown' },
              ]}
            />
          </Form.Item>
          <Form.Item name="lead_time_days" label="Срок, дн.">
            <TltNumberField min={0} className="tlt-field--w110" />
          </Form.Item>
          <Form.Item name="supplier_priority" label="Приоритет">
            <TltNumberField min={0} className="tlt-field--w110" />
          </Form.Item>
        </Space>
        <Space align="start" wrap>
          <Form.Item name="order_multiple_m" label="Кратность, м">
            <TltNumberField min={0} step={1} className="tlt-field--w120" />
          </Form.Item>
          <Form.Item name="min_order_quantity_m" label="Мин. заказ, м">
            <TltNumberField min={0} step={1} className="tlt-field--w130" />
          </Form.Item>
          <Form.Item name="replacement_group" label="Группа замены">
            <TltTextField className="tlt-field--w160" />
          </Form.Item>
          <Form.Item name="price_updated_at" label="Цена обновлена">
            <TltTextField className="tlt-field--w200" placeholder="ISO datetime" />
          </Form.Item>
          <Form.Item name="stock_updated_at" label="Склад обновлён">
            <TltTextField className="tlt-field--w200" placeholder="ISO datetime" />
          </Form.Item>
          <Form.Item name="commercial_data_source" label="Источник">
            <TltTextField className="tlt-field--w140" />
          </Form.Item>
        </Space>
        <Space align="start" wrap>
          <Form.Item name="is_preferred" label="Preferred" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="is_discontinued" label="Снят" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="is_active" label="Активен" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Space>
        <Form.Item name="params_json" label="params JSON">
          <textarea className="admin-db-textarea" rows={6} spellCheck={false} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function DatabaseAccessoryModal({
  open,
  editing,
  form,
  confirmLoading,
  onCancel,
  onSubmit,
}: AccessoryModalProps) {
  return (
    <Modal
      title={editing ? 'Редактировать аксессуар' : 'Добавить аксессуар'}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={confirmLoading}
      width={720}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Space align="start" wrap>
          <Form.Item name="category" label="Категория" rules={[{ required: true }]}>
            <TltTextField className="tlt-field--w180" />
          </Form.Item>
          <Form.Item name="name" label="Наименование" rules={[{ required: true }]}>
            <TltTextField className="tlt-field--w260" />
          </Form.Item>
          <Form.Item name="article" label="Артикул">
            <TltTextField className="tlt-field--w160" />
          </Form.Item>
          <Form.Item name="is_active" label="Активен" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Space>
        <Form.Item name="params_json" label="params JSON">
          <textarea className="admin-db-textarea" rows={6} spellCheck={false} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
