import { useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Input,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { DownloadOutlined, FolderOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createProject,
  deleteProject,
  duplicateProject,
  exportProjectCsv,
  exportProjectsCsvBulk,
  importProjectCsv,
  importProjectsCsvBulk,
  listProjects,
} from '@/api/projects';
import { formatDate } from '@/utils/formatters';
import { useProjectStore } from '@/store/projectStore';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { OBJECT_TYPE_LABELS, type ObjectType } from '@/constants/objectTypes';
import type { Project } from '@/types/project';
import QueryError from '@/components/common/QueryError';

const { Text } = Typography;

type OwnerFilter = 'all' | 'mine';
type StatusFilter = 'all' | 'draft' | 'completed';
/**
 * Тип проекта — вычисляется по составу объектов:
 *   empty   — нет объектов
 *   pipe/tank/pump/platform/other — все объекты одного типа
 *   mixed   — присутствуют объекты разных типов
 */
type ProjectTypeFilter = 'all' | 'empty' | 'mixed' | ObjectType;

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  completed: { text: 'Завершён', color: 'green' },
  draft:     { text: 'Черновик', color: 'default' },
};

function computeProjectType(types: string[]): ProjectTypeFilter | 'other' {
  if (types.length === 0) return 'empty';
  if (types.length > 1) return 'mixed';
  return types[0] as ObjectType;
}

const PROJECT_TYPE_LABEL: Record<string, string> = {
  empty: 'Пустой',
  mixed: 'Смешанный',
  pipe: 'Трубопроводы',
  tank: 'Резервуары',
  pump: 'Насосы',
  platform: 'Площадки',
  other: 'Прочее',
};

export default function ProjectsPage() {
  const [search, setSearch]         = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [ownerFilter, setOwner]     = useState<OwnerFilter>('all');
  const [statusFilter, setStatus]   = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<ProjectTypeFilter>('all');
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all');
  const [containsType, setContainsType] = useState<ObjectType | 'all'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName]       = useState('');
  const [newTaskNumber, setNewTaskNumber] = useState('');

  const qc         = useQueryClient();
  const navigate   = useNavigate();
  const setCurrent = useProjectStore((s) => s.setCurrentProject);
  const { user, role } = useAuthStore();

  const {
    data: projects = [],
    isError: projectsError,
    error: projectsErrorObj,
    refetch: refetchProjects,
    isFetching: projectsFetching,
  } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
    onError: (e: Error) => message.error(e.message),
  });

  const duplicateMut = useMutation({
    mutationFn: (id: string) => duplicateProject(id),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      message.success(`Проект «${project.name}» создан`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const singleFileInputRef = useRef<HTMLInputElement>(null);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportOne = async (p: Project) => {
    try {
      const blob = await exportProjectCsv(p.id);
      downloadBlob(blob, `${p.task_number ? p.task_number + '_' : ''}${p.name}.tlt.csv`);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const exportBulk = async () => {
    const ids = selectedIds.length ? selectedIds : projects.map((p) => p.id);
    if (!ids.length) {
      message.warning('Нет проектов для экспорта');
      return;
    }
    try {
      const blob = await exportProjectsCsvBulk(ids);
      downloadBlob(blob, 'projects_export.csv');
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const importSingleMut = useMutation({
    mutationFn: (file: File) => importProjectCsv(file),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      message.success(`Импортирован проект «${p.name}»`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const importBulkMut = useMutation({
    mutationFn: (file: File) => importProjectsCsvBulk(file),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      if (res.errors.length) {
        message.warning(`Импортировано ${res.imported}, ошибок: ${res.errors.length}`);
      } else {
        message.success(`Импортировано проектов: ${res.imported}`);
      }
    },
    onError: (e: Error) => message.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createProject({
        name: newName.trim(),
        task_number: newTaskNumber.trim() || null,
      }),
    onSuccess: (project) => {
      setCurrent(project);
      qc.invalidateQueries({ queryKey: ['projects'] });
      message.success('Проект создан');
      setCreateOpen(false);
      setNewName('');
      setNewTaskNumber('');
      navigate('/workspace/heat-calc');
    },
    onError: (e: Error) => message.error(e.message),
  });

  const isEmployee = role === 'employee' || role === 'admin';

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const p of projects) set.add(new Date(p.created_at).getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [projects]);

  const filtered = projects.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (taskSearch) {
      const tn = (p.task_number ?? '').toLowerCase();
      if (!tn.includes(taskSearch.toLowerCase())) return false;
    }
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (isEmployee && ownerFilter === 'mine' && p.user_id !== user?.id) return false;

    if (typeFilter !== 'all') {
      const computed = computeProjectType(p.object_types);
      if (computed !== typeFilter) return false;
    }
    if (containsType !== 'all' && !p.object_types.includes(containsType)) return false;

    if (yearFilter !== 'all') {
      if (new Date(p.created_at).getFullYear() !== yearFilter) return false;
    }
    return true;
  });

  const filtersDirty =
    ownerFilter !== 'all' ||
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    containsType !== 'all' ||
    yearFilter !== 'all' ||
    !!search ||
    !!taskSearch;

  const resetFilters = () => {
    setOwner('all');
    setStatus('all');
    setTypeFilter('all');
    setContainsType('all');
    setYearFilter('all');
    setSearch('');
    setTaskSearch('');
  };

  const columns = [
    {
      title: 'Название',
      dataIndex: 'name',
      sorter: (a: Project, b: Project) => a.name.localeCompare(b.name),
    },
    {
      title: '№ задачи',
      dataIndex: 'task_number',
      render: (v: string | null) =>
        v ? <Tag color="blue">{v}</Tag> : <span style={{ color: '#595959' }}>—</span>,
      sorter: (a: Project, b: Project) =>
        (a.task_number ?? '').localeCompare(b.task_number ?? ''),
    },
    {
      title: 'Тип',
      dataIndex: 'object_types',
      render: (types: string[]) => {
        const computed = computeProjectType(types ?? []);
        const label = PROJECT_TYPE_LABEL[computed] ?? computed;
        const color =
          computed === 'empty' ? 'default' :
          computed === 'mixed' ? 'purple' :
          computed === 'pipe' ? 'orange' :
          computed === 'tank' ? 'cyan' :
          'geekblue';
        return (
          <Tag color={color} style={computed === 'pipe' ? { color: '#873800' } : undefined}>
            {label}
          </Tag>
        );
      },
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      render: (s: string) => {
        const info = STATUS_LABEL[s] ?? { text: s, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: 'Владелец',
      dataIndex: 'owner_email',
      render: (email: string | null) =>
        email ? email : <span style={{ color: '#595959' }}>гость</span>,
      sorter: (a: Project, b: Project) =>
        (a.owner_email ?? '').localeCompare(b.owner_email ?? ''),
    },
    {
      title: 'Обновлён',
      dataIndex: 'updated_at',
      render: (v: string) => formatDate(v),
      sorter: (a: Project, b: Project) =>
        new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Действия',
      render: (_: unknown, p: Project) => (
        <Space>
          <Button
            type="link"
            onClick={() => {
              setCurrent(p);
              navigate('/workspace/heat-calc');
            }}
          >
            Открыть
          </Button>
          {isEmployee && (
            <Button
              type="link"
              loading={duplicateMut.isPending && duplicateMut.variables === p.id}
              onClick={() => duplicateMut.mutate(p.id)}
            >
              Дублировать
            </Button>
          )}
          <Button type="link" onClick={() => exportOne(p)}>
            Скачать
          </Button>
          <Popconfirm
            title="Удалить проект?"
            description="Все объекты, расчёты и спецификации проекта будут удалены безвозвратно."
            okText="Удалить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            onConfirm={() => delMut.mutate(p.id)}
          >
            <Button type="link" danger>Удалить</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Row className="projects-page-layout" gutter={12} align="top">
        <Col className="projects-page-sidebar" flex="0 0 240px">
          <Card size="small" style={{ height: '100%' }}>
            <div style={{ marginBottom: 10 }}>
              <Text strong style={{ fontSize: 13 }}>
                <FolderOutlined style={{ marginRight: 5, color: '#1a5276' }} />
                Проекты
              </Text>
            </div>

            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                block
                size="small"
                onClick={() => setCreateOpen(true)}
              >
                Новый проект
              </Button>

              {isEmployee && (
                <div>
                  <Text style={{ fontSize: 11, color: '#595959' }}>Владелец</Text>
                  <Segmented<OwnerFilter>
                    block
                    size="small"
                    value={ownerFilter}
                    onChange={setOwner}
                    options={[
                      { label: 'Все', value: 'all' },
                      { label: 'Мои', value: 'mine' },
                    ]}
                    style={{ marginTop: 4 }}
                  />
                </div>
              )}

              <div>
                <Text style={{ fontSize: 11, color: '#595959' }}>Тип проекта</Text>
                <Select<ProjectTypeFilter>
                  aria-label="Тип проекта"
                  value={typeFilter}
                  onChange={setTypeFilter}
                  size="small"
                  style={{ width: '100%', marginTop: 4 }}
                  options={[
                    { label: 'Все типы', value: 'all' },
                    { label: 'Пустые', value: 'empty' },
                    { label: 'Смешанные', value: 'mixed' },
                    { label: OBJECT_TYPE_LABELS.pipe, value: 'pipe' },
                    { label: OBJECT_TYPE_LABELS.tank, value: 'tank' },
                    { label: OBJECT_TYPE_LABELS.pump, value: 'pump' },
                    { label: OBJECT_TYPE_LABELS.platform, value: 'platform' },
                  ]}
                />
              </div>

              <div>
                <Text style={{ fontSize: 11, color: '#595959' }}>Содержит объект</Text>
                <Select<ObjectType | 'all'>
                  aria-label="Содержит объект"
                  value={containsType}
                  onChange={setContainsType}
                  size="small"
                  style={{ width: '100%', marginTop: 4 }}
                  options={[
                    { label: 'Любой', value: 'all' },
                    { label: OBJECT_TYPE_LABELS.pipe, value: 'pipe' },
                    { label: OBJECT_TYPE_LABELS.tank, value: 'tank' },
                    { label: OBJECT_TYPE_LABELS.pump, value: 'pump' },
                    { label: OBJECT_TYPE_LABELS.platform, value: 'platform' },
                  ]}
                />
              </div>

              <div>
                <Text style={{ fontSize: 11, color: '#595959' }}>Год создания</Text>
                <Select<number | 'all'>
                  aria-label="Год создания"
                  value={yearFilter}
                  onChange={setYearFilter}
                  size="small"
                  style={{ width: '100%', marginTop: 4 }}
                  options={[
                    { label: 'Все годы', value: 'all' },
                    ...availableYears.map((y) => ({ label: String(y), value: y })),
                  ]}
                />
              </div>

              <div>
                <Text style={{ fontSize: 11, color: '#595959' }}>Статус</Text>
                <Select<StatusFilter>
                  aria-label="Статус"
                  value={statusFilter}
                  onChange={setStatus}
                  size="small"
                  style={{ width: '100%', marginTop: 4 }}
                  options={[
                    { label: 'Все статусы', value: 'all' },
                    { label: 'Черновик',    value: 'draft' },
                    { label: 'Завершён',    value: 'completed' },
                  ]}
                />
              </div>

              <div>
                <Text style={{ fontSize: 11, color: '#595959' }}>№ задачи</Text>
                <Input.Search
                  placeholder="Поиск"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  allowClear
                  size="small"
                  style={{ marginTop: 4 }}
                />
              </div>

              <div>
                <Text style={{ fontSize: 11, color: '#595959' }}>Название</Text>
                <Input.Search
                  placeholder="По названию"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  allowClear
                  size="small"
                  style={{ marginTop: 4 }}
                />
              </div>

              {filtersDirty && (
                <Button size="small" block onClick={resetFilters}>
                  Сбросить фильтры
                </Button>
              )}
            </Space>

            <div
              style={{
                marginTop: 12,
                padding: '6px 8px',
                background: '#f6f8fa',
                borderRadius: 6,
                border: '1px solid #e8e8e8',
              }}
            >
              <Text style={{ fontSize: 11, display: 'block' }}>
                Всего: <strong>{projects.length}</strong>
              </Text>
              {filtersDirty && (
                <Text style={{ fontSize: 11, color: '#1a5276' }}>
                  Показано: <strong>{filtered.length}</strong>
                </Text>
              )}
            </div>
          </Card>
        </Col>

        <Col className="projects-page-main" flex="1" style={{ minWidth: 0 }}>
          <Card
            size="small"
            title={(
              <Space className="projects-list-title" size={8}>
                <Text strong>Список проектов</Text>
                <Text type="secondary">
                  {filtered.length} из {projects.length}
                </Text>
              </Space>
            )}
            styles={{ body: { paddingTop: 0 } }}
            extra={
              <Space className="projects-page-card-actions">
                <Button
                  size="small"
                  icon={<UploadOutlined />}
                  aria-label="Загрузить CSV"
                  loading={importSingleMut.isPending}
                  onClick={() => singleFileInputRef.current?.click()}
                >
                  Загрузить CSV
                </Button>
                {isEmployee && (
                  <>
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      aria-label={selectedIds.length
                        ? `Экспорт выбранных (${selectedIds.length})`
                        : 'Экспорт всех'}
                      onClick={exportBulk}
                    >
                      {selectedIds.length
                        ? `Экспорт выбранных (${selectedIds.length})`
                        : 'Экспорт всех'}
                    </Button>
                    <Button
                      size="small"
                      icon={<UploadOutlined />}
                      aria-label="Пакетная загрузка"
                      loading={importBulkMut.isPending}
                      onClick={() => bulkFileInputRef.current?.click()}
                    >
                      Пакетная загрузка
                    </Button>
                  </>
                )}
                <input
                  ref={singleFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importSingleMut.mutate(f);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={bulkFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importBulkMut.mutate(f);
                    e.target.value = '';
                  }}
                />
              </Space>
            }
          >
            {projectsError && projects.length === 0 && (
              <div style={{ marginBottom: 16 }}>
                <QueryError
                  error={projectsErrorObj}
                  title="Не удалось загрузить список проектов"
                  onRetry={() => refetchProjects()}
                  retrying={projectsFetching}
                />
              </div>
            )}
            <Table<Project>
              rowKey="id"
              columns={columns}
              dataSource={filtered}
              size="small"
              pagination={{ pageSize: 20, showSizeChanger: false }}
              locale={{ emptyText: 'Проекты не найдены' }}
              rowSelection={
                isEmployee
                  ? {
                      selectedRowKeys: selectedIds,
                      onChange: (keys) => setSelectedIds(keys as string[]),
                      getCheckboxProps: (record) => ({
                        title: `Выбрать проект ${record.name}`,
                      }),
                    }
                  : undefined
              }
              scroll={{ x: 980 }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title="Создать проект"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          setNewName('');
          setNewTaskNumber('');
        }}
        onOk={() => createMut.mutate()}
        confirmLoading={createMut.isPending}
        okText="Создать"
        cancelText="Отмена"
        okButtonProps={{ disabled: !newName.trim() }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input
            placeholder="Название проекта"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={() => newName.trim() && createMut.mutate()}
            autoFocus
          />
          <Input
            placeholder="Номер задачи (необязательно)"
            value={newTaskNumber}
            onChange={(e) => setNewTaskNumber(e.target.value)}
            maxLength={64}
          />
        </Space>
      </Modal>
    </>
  );
}
