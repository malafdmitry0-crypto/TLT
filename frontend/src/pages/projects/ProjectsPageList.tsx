import { useRef } from 'react';
import {
  Col,
  Popconfirm,
  Space,
  Table,
  Typography,
} from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { formatDate } from '@/utils/formatters';
import type { Project } from '@/types/project';
import QueryError from '@/components/common/QueryError';
import { TltBadge, TltButton, TltCard } from '@/components/ui-kit';
import {
  PROJECT_TYPE_LABEL,
  STATUS_LABEL,
  computeProjectType,
} from '@/pages/projects/projectsPageModel';

function projectTypeTone(
  computed: string,
): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (computed === 'pipe') return 'warning';
  if (computed === 'tank') return 'info';
  return 'neutral';
}

function statusTone(
  color: string,
): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (color === 'success' || color === 'green') return 'success';
  if (color === 'warning' || color === 'orange' || color === 'gold') return 'warning';
  if (color === 'error' || color === 'red' || color === 'magenta' || color === 'volcano') return 'danger';
  if (color === 'blue' || color === 'processing' || color === 'cyan') return 'info';
  return 'neutral';
}

const { Text } = Typography;

export interface ProjectsPageListProps {
  projects: Project[];
  filtered: Project[];
  isEmployee: boolean;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  projectsError: boolean;
  projectsErrorObj: unknown;
  projectsFetching: boolean;
  onRetry: () => void;
  onOpen: (project: Project) => void;
  onDuplicate: (id: string) => void;
  duplicatePending: boolean;
  duplicateVariables: string | undefined;
  onExportOne: (project: Project) => void;
  onExportBulk: () => void;
  onDelete: (id: string) => void;
  onImportSingle: (file: File) => void;
  onImportBulk: (file: File) => void;
  importSinglePending: boolean;
  importBulkPending: boolean;
}

export function ProjectsPageList({
  projects,
  filtered,
  isEmployee,
  selectedIds,
  onSelectedIdsChange,
  projectsError,
  projectsErrorObj,
  projectsFetching,
  onRetry,
  onOpen,
  onDuplicate,
  duplicatePending,
  duplicateVariables,
  onExportOne,
  onExportBulk,
  onDelete,
  onImportSingle,
  onImportBulk,
  importSinglePending,
  importBulkPending,
}: ProjectsPageListProps) {
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const singleFileInputRef = useRef<HTMLInputElement>(null);

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
        v ? <TltBadge tone="info">{v}</TltBadge> : <span className="projects-page-muted">—</span>,
      sorter: (a: Project, b: Project) =>
        (a.task_number ?? '').localeCompare(b.task_number ?? ''),
    },
    {
      title: 'Тип',
      dataIndex: 'object_types',
      render: (types: string[]) => {
        const computed = computeProjectType(types ?? []);
        const label = PROJECT_TYPE_LABEL[computed] ?? computed;
        return (
          <TltBadge
            tone={projectTypeTone(computed)}
            className={computed === 'pipe' ? 'projects-page-type-pipe' : undefined}
          >
            {label}
          </TltBadge>
        );
      },
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      render: (s: string) => {
        const info = STATUS_LABEL[s] ?? { text: s, color: 'default' };
        return <TltBadge tone={statusTone(info.color)}>{info.text}</TltBadge>;
      },
    },
    {
      title: 'Владелец',
      dataIndex: 'owner_email',
      render: (email: string | null) =>
        email ? email : <span className="projects-page-muted">гость</span>,
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
          <TltButton variant="link" onClick={() => onOpen(p)}>
            Открыть
          </TltButton>
          {isEmployee && (
            <TltButton
              variant="link"
              loading={duplicatePending && duplicateVariables === p.id}
              onClick={() => onDuplicate(p.id)}
            >
              Дублировать
            </TltButton>
          )}
          <TltButton variant="link" onClick={() => onExportOne(p)}>
            Скачать
          </TltButton>
          <Popconfirm
            title="Удалить проект?"
            description="Все объекты, расчёты и спецификации проекта будут удалены безвозвратно."
            okText="Удалить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(p.id)}
          >
            <TltButton variant="danger">Удалить</TltButton>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Col className="projects-page-main" flex="1">
      <TltCard
        padding="compact"
        className="projects-page-list-card"
        title={(
          <Space className="projects-list-title" size={8}>
            <Text strong>Список проектов</Text>
            <Text type="secondary">
              {filtered.length} из {projects.length}
            </Text>
          </Space>
        )}
        actions={
          <Space className="projects-page-card-actions">
            <TltButton
              size="compact"
              icon={<UploadOutlined />}
              aria-label="Загрузить CSV"
              loading={importSinglePending}
              onClick={() => singleFileInputRef.current?.click()}
            >
              Загрузить CSV
            </TltButton>
            {isEmployee && (
              <>
                <TltButton
                  size="compact"
                  icon={<DownloadOutlined />}
                  aria-label={selectedIds.length
                    ? `Экспорт выбранных (${selectedIds.length})`
                    : 'Экспорт всех'}
                  onClick={onExportBulk}
                >
                  {selectedIds.length
                    ? `Экспорт выбранных (${selectedIds.length})`
                    : 'Экспорт всех'}
                </TltButton>
                <TltButton
                  size="compact"
                  icon={<UploadOutlined />}
                  aria-label="Пакетная загрузка"
                  loading={importBulkPending}
                  onClick={() => bulkFileInputRef.current?.click()}
                >
                  Пакетная загрузка
                </TltButton>
              </>
            )}
            <input
              ref={singleFileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="projects-page-file-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportSingle(f);
                e.target.value = '';
              }}
            />
            <input
              ref={bulkFileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="projects-page-file-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportBulk(f);
                e.target.value = '';
              }}
            />
          </Space>
        }
      >
        {projectsError && projects.length === 0 && (
          <div className="projects-page-error">
            <QueryError
              error={projectsErrorObj}
              title="Не удалось загрузить список проектов"
              onRetry={onRetry}
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
                  onChange: (keys) => onSelectedIdsChange(keys as string[]),
                  getCheckboxProps: (record) => ({
                    title: `Выбрать проект ${record.name}`,
                  }),
                }
              : undefined
          }
          scroll={{ x: 980 }}
        />
      </TltCard>
    </Col>
  );
}
