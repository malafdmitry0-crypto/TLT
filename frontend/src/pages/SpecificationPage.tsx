import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Typography,
  message,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  generateSpecification,
  getSpecification,
  listAccessoriesExtended,
  saveSpecificationItems,
  type AccessoryExtendedInfo,
} from '@/api/specifications';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import SpecTable from '@/components/specification/SpecTable';
import EmptyProjectState from '@/components/common/EmptyProjectState';
import { ROUTES } from '@/routes/routes';
import type { SpecificationItem } from '@/types/specification';

const { Text } = Typography;

type GroupBy = 'none' | 'category' | 'unit';

export default function SpecificationPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const isEmployee = role === 'employee' || role === 'admin';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [variant, setVariant] = useState<number>(1);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedAccessoryId, setSelectedAccessoryId] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);

  const { data: spec, refetch } = useQuery({
    queryKey: ['spec', project?.id, variant],
    queryFn: () => getSpecification(project!.id, variant),
    enabled: !!project,
  });

  const { data: accessories = [] } = useQuery({
    queryKey: referenceQueryKeys.accessoriesExtended,
    queryFn: listAccessoriesExtended,
    enabled: isEmployee,
    ...referenceQueryOptions,
  });

  const mut = useMutation({
    mutationFn: () => generateSpecification(project!.id, variant),
    onSuccess: () => {
      message.success(`Спецификация для CO${variant} сгенерирована`);
      refetch();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (items: SpecificationItem[]) =>
      saveSpecificationItems(project!.id, items, variant),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spec', project?.id, variant] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const items: SpecificationItem[] = useMemo(
    () => (spec?.items as SpecificationItem[]) ?? [],
    [spec]
  );

  if (!project) {
    return (
      <EmptyProjectState
        icon={<UnorderedListOutlined style={{ marginRight: 8 }} />}
        title="Спецификация"
        description="Шаг 3 из 4. Автоматическое формирование перечня оборудования и материалов на основе расчётов."
      />
    );
  }

  const hasItems = items.length > 0;

  const handleAdd = () => {
    const acc = accessories.find((a) => a.id === selectedAccessoryId);
    if (!acc || !qty || qty <= 0) return;
    const newItem: SpecificationItem = {
      category: acc.category,
      name: acc.name,
      article: acc.article,
      unit: 'шт.',
      quantity: qty,
      params: { source_id: acc.id },
      source: 'manual',
    };
    saveMut.mutate([...items, newItem], {
      onSuccess: () => {
        message.success('Позиция добавлена');
        setAddOpen(false);
        setSelectedAccessoryId(null);
        setQty(1);
      },
    });
  };

  const handleDelete = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    saveMut.mutate(next, {
      onSuccess: () => message.success('Позиция удалена'),
    });
  };

  const categoriesCount = new Set(items.map((i) => i.category)).size;

  return (
    <>
      <Row className="specification-page-layout" gutter={12} align="top">
        <Col className="specification-page-sidebar" flex="0 0 240px">
          <Card size="small" style={{ height: '100%' }}>
            <div style={{ marginBottom: 10 }}>
              <Text strong style={{ fontSize: 13 }}>
                <UnorderedListOutlined style={{ marginRight: 5, color: '#1a5276' }} />
                Спецификация
              </Text>
            </div>

            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                block
                size="small"
                loading={mut.isPending}
                onClick={() => mut.mutate()}
              >
                {hasItems ? 'Пересчитать' : 'Сформировать'}
              </Button>

              {isEmployee && (
                <Button
                  icon={<PlusOutlined />}
                  block
                  size="small"
                  disabled={!hasItems}
                  onClick={() => setAddOpen(true)}
                >
                  Добавить из БД
                </Button>
              )}

              <div>
                <Text style={{ fontSize: 11, color: '#888' }}>Группировка</Text>
                <Segmented<GroupBy>
                  block
                  size="small"
                  value={groupBy}
                  onChange={setGroupBy}
                  options={[
                    { label: 'Нет', value: 'none' },
                    { label: 'Кат.', value: 'category' },
                    { label: 'Ед.', value: 'unit' },
                  ]}
                  style={{ marginTop: 4 }}
                />
              </div>

              <div
                style={{
                  marginTop: 6,
                  padding: '6px 8px',
                  background: '#f6f8fa',
                  borderRadius: 6,
                  border: '1px solid #e8e8e8',
                }}
              >
                <Text style={{ fontSize: 11, display: 'block' }}>
                  Позиций: <strong>{items.length}</strong>
                </Text>
                <Text style={{ fontSize: 11, display: 'block' }}>
                  Категорий: <strong>{categoriesCount}</strong>
                </Text>
                {isEmployee && (
                  <Text style={{ fontSize: 11, color: '#722ed1' }}>
                    Ручных: <strong>
                      {items.filter((i) => i.source === 'manual').length}
                    </strong>
                  </Text>
                )}
              </div>
            </Space>
          </Card>
        </Col>

        <Col className="specification-page-main" flex="1" style={{ minWidth: 0 }}>
          <Card
            size="small"
            title={<Text strong>Окно спецификаций</Text>}
            styles={{ body: { paddingTop: 8 } }}
          >
            {!hasItems && (
              <Alert
                className="specification-empty-alert"
                type="warning"
                showIcon
                message="Спецификация не сформирована"
                description="Убедитесь, что для всех объектов выполнен электрорасчёт (шаг 2), затем нажмите «Сформировать»."
                style={{ marginBottom: 16 }}
                action={
                  <Button
                    size="small"
                    icon={<ThunderboltOutlined />}
                    onClick={() => navigate(ROUTES.elecCalc)}
                  >
                    К электрорасчёту
                  </Button>
                }
              />
            )}

            <SpecTable
              items={items}
              groupBy={groupBy}
              canDelete={isEmployee && hasItems}
              onDelete={handleDelete}
            />

            {/* Переключатель вариантов системы (по эскизу Прил. 4 Рис. 3) */}
            <div
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: '1px solid #e8e8e8',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 11, color: '#888' }}>Вариант системы:</Text>
              <Segmented<number>
                value={variant}
                onChange={(v) => setVariant(Number(v))}
                size="small"
                options={[1, 2, 3, 4].map((n) => ({ label: `СО${n}`, value: n }))}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                Спецификация и расчёт сохраняются отдельно для каждого варианта.
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      <Modal
        title="Добавить позицию из расширенной БД"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={handleAdd}
        confirmLoading={saveMut.isPending}
        okText="Добавить"
        cancelText="Отмена"
        okButtonProps={{ disabled: !selectedAccessoryId || qty <= 0 }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select<string>
            showSearch
            placeholder="Выберите аксессуар"
            value={selectedAccessoryId ?? undefined}
            onChange={setSelectedAccessoryId}
            style={{ width: '100%' }}
            optionFilterProp="label"
            options={accessories.map((a: AccessoryExtendedInfo) => ({
              value: a.id,
              label: `${a.category} · ${a.name}${a.article ? ` (${a.article})` : ''}`,
            }))}
          />
          <InputNumber
            min={0.1}
            step={1}
            value={qty}
            onChange={(v) => setQty(Number(v ?? 1))}
            style={{ width: '100%' }}
            placeholder="Количество"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Ручные позиции помечены тегом «ручная». При пересчёте они удаляются — добавьте
            заново после генерации.
          </Text>
        </Space>
      </Modal>
    </>
  );
}
