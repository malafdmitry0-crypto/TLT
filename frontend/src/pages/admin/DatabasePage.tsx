import { useState } from 'react';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdminAccessory,
  createAdminCable,
  deleteAdminAccessory,
  deleteAdminCable,
  listAdminAccessories,
  listAdminCables,
  updateAdminAccessory,
  updateAdminCable,
} from '@/api/admin';
import type {
  AccessoryExtended,
  AccessoryExtendedPayload,
  CableExtended,
  CableExtendedPayload,
} from '@/types/admin';

const { Paragraph, Text } = Typography;
const { TextArea } = Input;

type CableFormValues = Partial<Omit<CableExtendedPayload, 'params'>> & {
  params_json?: string;
  conductor_section_mm2?: number | null;
};
type AccessoryFormValues = Partial<Omit<AccessoryExtendedPayload, 'params'>> & {
  params_json?: string;
};

const CABLE_QUERY_KEY = ['admin', 'cables'];
const ACCESSORY_QUERY_KEY = ['admin', 'accessories'];

function emptyToNull(value: unknown) {
  return value === '' || value === undefined ? null : value;
}

function parseParamsJson(value: string | undefined): Record<string, unknown> | null {
  if (!value || !value.trim()) return null;
  const parsed = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('params должен быть JSON-объектом');
  }
  return parsed as Record<string, unknown>;
}

function formatParamsJson(value: Record<string, unknown> | null | undefined) {
  return value ? JSON.stringify(value, null, 2) : '';
}

function numberParam(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cableConductorSection(params: Record<string, unknown> | null | undefined): number | null {
  return numberParam(params?.conductor_section_mm2 ?? params?.conductor_cross_section);
}

function normalizeCablePayload(values: CableFormValues): Partial<CableExtendedPayload> {
  const parsedParams = parseParamsJson(values.params_json) ?? {};
  const conductorSection = emptyToNull(values.conductor_section_mm2);
  if (conductorSection !== null) {
    parsedParams.conductor_section_mm2 = conductorSection;
  }
  const params = Object.keys(parsedParams).length > 0 ? parsedParams : null;

  return {
    cable_type: values.cable_type ?? 'self_regulating',
    brand: String(values.brand ?? '').trim(),
    model: String(values.model ?? '').trim(),
    power_per_meter: emptyToNull(values.power_per_meter) as number | null,
    max_temperature: emptyToNull(values.max_temperature) as number | null,
    min_temperature: emptyToNull(values.min_temperature) as number | null,
    resistance_per_meter: emptyToNull(values.resistance_per_meter) as number | null,
    supplier_name: emptyToNull(values.supplier_name) as string | null,
    article: emptyToNull(values.article) as string | null,
    currency: (emptyToNull(values.currency) as string | null) ?? 'RUB',
    price_per_meter: emptyToNull(values.price_per_meter) as number | null,
    stock_quantity_m: emptyToNull(values.stock_quantity_m) as number | null,
    stock_status: emptyToNull(values.stock_status) as CableExtendedPayload['stock_status'],
    lead_time_days: emptyToNull(values.lead_time_days) as number | null,
    supplier_priority: emptyToNull(values.supplier_priority) as number | null,
    is_preferred: Boolean(values.is_preferred),
    order_multiple_m: emptyToNull(values.order_multiple_m) as number | null,
    min_order_quantity_m: emptyToNull(values.min_order_quantity_m) as number | null,
    is_discontinued: Boolean(values.is_discontinued),
    replacement_group: emptyToNull(values.replacement_group) as string | null,
    price_updated_at: emptyToNull(values.price_updated_at) as string | null,
    stock_updated_at: emptyToNull(values.stock_updated_at) as string | null,
    commercial_data_source: emptyToNull(values.commercial_data_source) as string | null,
    params,
    is_active: values.is_active ?? true,
  };
}

function normalizeAccessoryPayload(
  values: AccessoryFormValues
): Partial<AccessoryExtendedPayload> {
  return {
    category: String(values.category ?? '').trim(),
    name: String(values.name ?? '').trim(),
    article: emptyToNull(values.article) as string | null,
    params: parseParamsJson(values.params_json),
    is_active: values.is_active ?? true,
  };
}

export default function DatabasePage() {
  const qc = useQueryClient();
  const [cableForm] = Form.useForm<CableFormValues>();
  const [accessoryForm] = Form.useForm<AccessoryFormValues>();
  const [editingCable, setEditingCable] = useState<CableExtended | null>(null);
  const [editingAccessory, setEditingAccessory] = useState<AccessoryExtended | null>(null);
  const [cableModalOpen, setCableModalOpen] = useState(false);
  const [accessoryModalOpen, setAccessoryModalOpen] = useState(false);

  const { data: cables = [], isFetching: cablesLoading } = useQuery({
    queryKey: CABLE_QUERY_KEY,
    queryFn: listAdminCables,
  });
  const { data: accessories = [], isFetching: accessoriesLoading } = useQuery({
    queryKey: ACCESSORY_QUERY_KEY,
    queryFn: listAdminAccessories,
  });

  const invalidateCables = () => qc.invalidateQueries({ queryKey: CABLE_QUERY_KEY });
  const invalidateAccessories = () => qc.invalidateQueries({ queryKey: ACCESSORY_QUERY_KEY });

  const cableSave = useMutation({
    mutationFn: (values: CableFormValues) => {
      const payload = normalizeCablePayload(values);
      return editingCable
        ? updateAdminCable(editingCable.id, payload)
        : createAdminCable(payload as CableExtendedPayload);
    },
    onSuccess: () => {
      invalidateCables();
      setCableModalOpen(false);
      message.success('Кабель сохранён');
    },
    onError: (error) => message.error(error instanceof Error ? error.message : 'Ошибка сохранения'),
  });
  const cableDelete = useMutation({
    mutationFn: deleteAdminCable,
    onSuccess: () => {
      invalidateCables();
      message.success('Кабель удалён');
    },
  });
  const accessorySave = useMutation({
    mutationFn: (values: AccessoryFormValues) => {
      const payload = normalizeAccessoryPayload(values);
      return editingAccessory
        ? updateAdminAccessory(editingAccessory.id, payload)
        : createAdminAccessory(payload as AccessoryExtendedPayload);
    },
    onSuccess: () => {
      invalidateAccessories();
      setAccessoryModalOpen(false);
      message.success('Аксессуар сохранён');
    },
    onError: (error) => message.error(error instanceof Error ? error.message : 'Ошибка сохранения'),
  });
  const accessoryDelete = useMutation({
    mutationFn: deleteAdminAccessory,
    onSuccess: () => {
      invalidateAccessories();
      message.success('Аксессуар удалён');
    },
  });

  const openCableModal = (row?: CableExtended) => {
    setEditingCable(row ?? null);
    cableForm.setFieldsValue(
      row
        ? {
            ...row,
            conductor_section_mm2: cableConductorSection(row.params),
            params_json: formatParamsJson(row.params),
          }
        : {
            cable_type: 'self_regulating',
            currency: 'RUB',
            stock_status: 'unknown',
            is_active: true,
            is_preferred: false,
            is_discontinued: false,
            params_json: '',
          }
    );
    setCableModalOpen(true);
  };

  const openAccessoryModal = (row?: AccessoryExtended) => {
    setEditingAccessory(row ?? null);
    accessoryForm.setFieldsValue(
      row
        ? { ...row, params_json: formatParamsJson(row.params) }
        : { is_active: true, params_json: '' }
    );
    setAccessoryModalOpen(true);
  };

  const cableColumns = [
      {
        title: 'Тип',
        dataIndex: 'cable_type',
        width: 130,
        render: (value: string) => <Tag>{value}</Tag>,
      },
      { title: 'Марка', dataIndex: 'model', width: 150 },
      { title: 'Бренд', dataIndex: 'brand', width: 120 },
      { title: 'Вт/м', dataIndex: 'power_per_meter', width: 90 },
      { title: 'Ом/м', dataIndex: 'resistance_per_meter', width: 90 },
      {
        title: 'Сечение',
        dataIndex: ['params', 'conductor_section_mm2'],
        width: 90,
        render: (_: unknown, row: CableExtended) =>
          cableConductorSection(row.params)?.toString() ?? '—',
      },
      { title: 'Поставщик', dataIndex: 'supplier_name', width: 150 },
      { title: 'Артикул', dataIndex: 'article', width: 130 },
      { title: 'Цена/м', dataIndex: 'price_per_meter', width: 100 },
      { title: 'Валюта', dataIndex: 'currency', width: 80 },
      { title: 'Остаток, м', dataIndex: 'stock_quantity_m', width: 110 },
      { title: 'Статус', dataIndex: 'stock_status', width: 110 },
      { title: 'Срок, дн.', dataIndex: 'lead_time_days', width: 90 },
      { title: 'Приоритет', dataIndex: 'supplier_priority', width: 100 },
      {
        title: 'Активен',
        dataIndex: 'is_active',
        width: 90,
        render: (value: boolean) => (value ? 'Да' : 'Нет'),
      },
      {
        title: 'Действия',
        key: 'actions',
        fixed: 'right' as const,
        width: 160,
        render: (_: unknown, row: CableExtended) => (
          <Space>
            <Button size="small" onClick={() => openCableModal(row)}>
              Изм.
            </Button>
            <Popconfirm title="Удалить кабель?" onConfirm={() => cableDelete.mutate(row.id)}>
              <Button size="small" danger>
                Удалить
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
  ];

  const accessoryColumns = [
      { title: 'Категория', dataIndex: 'category', width: 160 },
      { title: 'Наименование', dataIndex: 'name', width: 240 },
      { title: 'Артикул', dataIndex: 'article', width: 140 },
      {
        title: 'Активен',
        dataIndex: 'is_active',
        width: 90,
        render: (value: boolean) => (value ? 'Да' : 'Нет'),
      },
      {
        title: 'Commercial params',
        dataIndex: 'params',
        render: (value: Record<string, unknown> | null) =>
          value ? <Text code>{Object.keys(value).join(', ')}</Text> : '—',
      },
      {
        title: 'Действия',
        key: 'actions',
        fixed: 'right' as const,
        width: 160,
        render: (_: unknown, row: AccessoryExtended) => (
          <Space>
            <Button size="small" onClick={() => openAccessoryModal(row)}>
              Изм.
            </Button>
            <Popconfirm
              title="Удалить аксессуар?"
              onConfirm={() => accessoryDelete.mutate(row.id)}
            >
              <Button size="small" danger>
                Удалить
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
  ];

  return (
    <>
      <Tabs
        items={[
          {
            key: 'cables',
            label: `Кабели (${cables.length})`,
            children: (
              <>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Button type="primary" onClick={() => openCableModal()}>
                    Добавить кабель
                  </Button>
                  <Text type="secondary">
                    Commercial fields используются в public catalog и deterministic ranking.
                  </Text>
                </Space>
                <Table<CableExtended>
                  size="small"
                  rowKey="id"
                  loading={cablesLoading}
                  dataSource={cables}
                  columns={cableColumns}
                  scroll={{ x: 1700 }}
                  pagination={{ pageSize: 20, showSizeChanger: true }}
                />
              </>
            ),
          },
          {
            key: 'accessories',
            label: `Аксессуары (${accessories.length})`,
            children: (
              <>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Button type="primary" onClick={() => openAccessoryModal()}>
                    Добавить аксессуар
                  </Button>
                  <Text type="secondary">
                    Стоимость аксессуаров задаётся через params и не подменяет бизнес-правила.
                  </Text>
                </Space>
                <Table<AccessoryExtended>
                  size="small"
                  rowKey="id"
                  loading={accessoriesLoading}
                  dataSource={accessories}
                  columns={accessoryColumns}
                  scroll={{ x: 900 }}
                  pagination={{ pageSize: 20, showSizeChanger: true }}
                />
              </>
            ),
          },
        ]}
      />

      <Modal
        title={editingCable ? 'Редактировать кабель' : 'Добавить кабель'}
        open={cableModalOpen}
        onCancel={() => setCableModalOpen(false)}
        onOk={() => cableForm.submit()}
        confirmLoading={cableSave.isPending}
        width={920}
      >
        <Paragraph type="secondary">
          Для резистивного кабеля сопротивление хранится как <Text code>Ом/м</Text>,
          а сечение жилы сохраняется в params как <Text code>conductor_section_mm2</Text>.
          Дополнительные технические поля: <Text code>diameter_mm</Text>,
          <Text code>nominal_size_mm</Text>. Аксессуарная оценка:
          {' '}<Text code>accessory_total_cost</Text>.
        </Paragraph>
        <Form form={cableForm} layout="vertical" onFinish={(values) => cableSave.mutate(values)}>
          <Space align="start" wrap>
            <Form.Item name="cable_type" label="Тип" rules={[{ required: true }]}>
              <Select
                style={{ width: 180 }}
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
              <Input style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="model" label="Марка" rules={[{ required: true }]}>
              <Input style={{ width: 190 }} />
            </Form.Item>
            <Form.Item name="power_per_meter" label="Вт/м">
              <InputNumber min={0} style={{ width: 110 }} />
            </Form.Item>
            <Form.Item name="resistance_per_meter" label="Ом/м">
              <InputNumber min={0} step={0.001} style={{ width: 110 }} />
            </Form.Item>
            <Form.Item name="conductor_section_mm2" label="Сечение, мм²">
              <InputNumber min={0} step={0.1} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="min_temperature" label="T min">
              <InputNumber style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="max_temperature" label="T max">
              <InputNumber style={{ width: 100 }} />
            </Form.Item>
          </Space>
          <Space align="start" wrap>
            <Form.Item name="supplier_name" label="Поставщик">
              <Input style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="article" label="Артикул">
              <Input style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="price_per_meter" label="Цена/м">
              <InputNumber min={0} step={0.01} style={{ width: 110 }} />
            </Form.Item>
            <Form.Item name="currency" label="Валюта">
              <Input style={{ width: 90 }} />
            </Form.Item>
            <Form.Item name="stock_quantity_m" label="Остаток, м">
              <InputNumber min={0} step={1} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="stock_status" label="Статус">
              <Select
                style={{ width: 130 }}
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
              <InputNumber min={0} precision={0} style={{ width: 110 }} />
            </Form.Item>
            <Form.Item name="supplier_priority" label="Приоритет">
              <InputNumber min={0} precision={0} style={{ width: 110 }} />
            </Form.Item>
          </Space>
          <Space align="start" wrap>
            <Form.Item name="order_multiple_m" label="Кратность, м">
              <InputNumber min={0} step={1} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="min_order_quantity_m" label="Мин. заказ, м">
              <InputNumber min={0} step={1} style={{ width: 130 }} />
            </Form.Item>
            <Form.Item name="replacement_group" label="Группа замены">
              <Input style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="price_updated_at" label="Цена обновлена">
              <Input style={{ width: 200 }} placeholder="ISO datetime" />
            </Form.Item>
            <Form.Item name="stock_updated_at" label="Склад обновлён">
              <Input style={{ width: 200 }} placeholder="ISO datetime" />
            </Form.Item>
            <Form.Item name="commercial_data_source" label="Источник">
              <Input style={{ width: 140 }} />
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
            <TextArea rows={6} spellCheck={false} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingAccessory ? 'Редактировать аксессуар' : 'Добавить аксессуар'}
        open={accessoryModalOpen}
        onCancel={() => setAccessoryModalOpen(false)}
        onOk={() => accessoryForm.submit()}
        confirmLoading={accessorySave.isPending}
        width={720}
      >
        <Form
          form={accessoryForm}
          layout="vertical"
          onFinish={(values) => accessorySave.mutate(values)}
        >
          <Space align="start" wrap>
            <Form.Item name="category" label="Категория" rules={[{ required: true }]}>
              <Input style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="name" label="Наименование" rules={[{ required: true }]}>
              <Input style={{ width: 260 }} />
            </Form.Item>
            <Form.Item name="article" label="Артикул">
              <Input style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="is_active" label="Активен" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Form.Item name="params_json" label="params JSON">
            <TextArea rows={6} spellCheck={false} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
