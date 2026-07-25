import { useState } from 'react';
import {
  Form,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tabs,
  Typography,
  message,
} from 'antd';
import { TltBadge, TltButton, TltNumberField, TltSelect, TltTextField } from '@/components/ui-kit';
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
import {
  cableConductorSection,
  formatParamsJson,
  normalizeAccessoryPayload,
  normalizeCablePayload,
  type AccessoryFormValues,
  type CableFormValues,
} from '@/pages/admin/databasePagePayloadModel';
import './admin-layout.css';

const { Paragraph, Text } = Typography;
const CABLE_QUERY_KEY = ['admin', 'cables'];
const ACCESSORY_QUERY_KEY = ['admin', 'accessories'];

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
        render: (value: string) => <TltBadge>{value}</TltBadge>,
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
            <TltButton size="compact" onClick={() => openCableModal(row)}>
              Изм.
            </TltButton>
            <Popconfirm title="Удалить кабель?" onConfirm={() => cableDelete.mutate(row.id)}>
              <TltButton size="compact" variant="danger">
                Удалить
              </TltButton>
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
            <TltButton size="compact" onClick={() => openAccessoryModal(row)}>
              Изм.
            </TltButton>
            <Popconfirm
              title="Удалить аксессуар?"
              onConfirm={() => accessoryDelete.mutate(row.id)}
            >
              <TltButton size="compact" variant="danger">
                Удалить
              </TltButton>
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
                <Space className="admin-db-toolbar" wrap>
                  <TltButton variant="primary" onClick={() => openCableModal()}>
                    Добавить кабель
                  </TltButton>
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
                <Space className="admin-db-toolbar" wrap>
                  <TltButton variant="primary" onClick={() => openAccessoryModal()}>
                    Добавить аксессуар
                  </TltButton>
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
    </>
  );
}
