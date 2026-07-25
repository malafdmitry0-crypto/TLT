import { useState } from 'react';
import { Form, Space, Table, Tabs, Typography } from 'antd';
import { appMessage as message } from '@/feedback/appFeedback';
import { TltButton } from '@/components/ui-kit';
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
import {
  buildAccessoryColumns,
  buildCableColumns,
} from '@/pages/admin/databasePageTableModel';
import {
  DatabaseAccessoryModal,
  DatabaseCableModal,
} from '@/pages/admin/DatabaseEntityModals';
import './admin-layout.css';

const { Text } = Typography;
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

  const cableColumns = buildCableColumns({
    onEdit: openCableModal,
    onDelete: (id) => cableDelete.mutate(id),
  });
  const accessoryColumns = buildAccessoryColumns({
    onEdit: openAccessoryModal,
    onDelete: (id) => accessoryDelete.mutate(id),
  });

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

      <DatabaseCableModal
        open={cableModalOpen}
        editing={!!editingCable}
        form={cableForm}
        confirmLoading={cableSave.isPending}
        onCancel={() => setCableModalOpen(false)}
        onSubmit={(values) => cableSave.mutate(values)}
      />
      <DatabaseAccessoryModal
        open={accessoryModalOpen}
        editing={!!editingAccessory}
        form={accessoryForm}
        confirmLoading={accessorySave.isPending}
        onCancel={() => setAccessoryModalOpen(false)}
        onSubmit={(values) => accessorySave.mutate(values)}
      />
    </>
  );
}
