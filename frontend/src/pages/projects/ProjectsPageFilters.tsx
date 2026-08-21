import { Col, Segmented, Space, Typography } from 'antd';
import { FolderOutlined, PlusOutlined } from '@ant-design/icons';
import { OBJECT_TYPE_LABELS, type ObjectType } from '@/constants/objectTypes';
import type {
  OwnerFilter,
  ProjectTypeFilter,
  StatusFilter,
} from '@/pages/projects/projectsPageModel';
import { TltButton, TltCard, TltSelect, TltTextField } from '@/components/ui-kit';

const { Text } = Typography;

export interface ProjectsPageFiltersProps {
  isEmployee: boolean;
  ownerFilter: OwnerFilter;
  onOwnerChange: (value: OwnerFilter) => void;
  typeFilter: ProjectTypeFilter;
  onTypeFilterChange: (value: ProjectTypeFilter) => void;
  containsType: ObjectType | 'all';
  onContainsTypeChange: (value: ObjectType | 'all') => void;
  yearFilter: number | 'all';
  onYearFilterChange: (value: number | 'all') => void;
  availableYears: number[];
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  taskSearch: string;
  onTaskSearchChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  filtersDirty: boolean;
  onResetFilters: () => void;
  totalCount: number;
  filteredCount: number;
  onCreateClick: () => void;
}

export function ProjectsPageFilters({
  isEmployee,
  ownerFilter,
  onOwnerChange,
  typeFilter,
  onTypeFilterChange,
  containsType,
  onContainsTypeChange,
  yearFilter,
  onYearFilterChange,
  availableYears,
  statusFilter,
  onStatusChange,
  taskSearch,
  onTaskSearchChange,
  search,
  onSearchChange,
  filtersDirty,
  onResetFilters,
  totalCount,
  filteredCount,
  onCreateClick,
}: ProjectsPageFiltersProps) {
  return (
    <Col className="projects-page-sidebar" flex="0 0 240px">
      <TltCard className="projects-page-sidebar-card">
        <div className="projects-page-sidebar-heading">
          <Text strong className="projects-page-sidebar-title">
            <FolderOutlined className="projects-page-sidebar-icon" />
            Проекты
          </Text>
        </div>

        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <TltButton
            variant="primary"
            icon={<PlusOutlined />}
            size="compact"
            onClick={onCreateClick}
          >
            Новый проект
          </TltButton>

          {isEmployee && (
            <div>
              <Text className="projects-page-filter-label">Владелец</Text>
              <Segmented<OwnerFilter>
                block
                size="small"
                value={ownerFilter}
                onChange={onOwnerChange}
                options={[
                  { label: 'Все', value: 'all' },
                  { label: 'Мои', value: 'mine' },
                ]}
                className="projects-page-filter-control"
              />
            </div>
          )}

          <div>
            <Text className="projects-page-filter-label">Тип проекта</Text>
            <TltSelect
              aria-label="Тип проекта"
              value={typeFilter}
              onChange={(value) => onTypeFilterChange((value ?? 'all') as ProjectTypeFilter)} className="tlt-field--fill-mt"
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
            <Text className="projects-page-filter-label">Содержит объект</Text>
            <TltSelect
              aria-label="Содержит объект"
              value={containsType}
              onChange={(value) => onContainsTypeChange((value ?? 'all') as ObjectType | 'all')} className="tlt-field--fill-mt"
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
            <Text className="projects-page-filter-label">Год создания</Text>
            <TltSelect
              aria-label="Год создания"
              value={yearFilter}
              onChange={(value) => onYearFilterChange((value ?? 'all') as number | 'all')} className="tlt-field--fill-mt"
              options={[
                { label: 'Все годы', value: 'all' },
                ...availableYears.map((y) => ({ label: String(y), value: y })),
              ]}
            />
          </div>

          <div>
            <Text className="projects-page-filter-label">Статус</Text>
            <TltSelect
              aria-label="Статус"
              value={statusFilter}
              onChange={(value) => onStatusChange((value ?? 'all') as StatusFilter)} className="tlt-field--fill-mt"
              options={[
                { label: 'Все статусы', value: 'all' },
                { label: 'Черновик', value: 'draft' },
                { label: 'Завершён', value: 'completed' },
              ]}
            />
          </div>

          <div>
            <Text className="projects-page-filter-label">№ задачи</Text>
            <TltTextField
              type="search"
              placeholder="Поиск"
              value={taskSearch}
              onChange={onTaskSearchChange}
              className="projects-page-filter-control"
              aria-label="Поиск по номеру задачи"
            />
          </div>

          <div>
            <Text className="projects-page-filter-label">Название</Text>
            <TltTextField
              type="search"
              placeholder="По названию"
              value={search}
              onChange={onSearchChange}
              className="projects-page-filter-control"
              aria-label="Поиск по названию"
            />
          </div>

          {filtersDirty && (
            <TltButton size="compact" onClick={onResetFilters}>
              Сбросить фильтры
            </TltButton>
          )}
        </Space>

        <div className="projects-page-stats">
          <Text className="projects-page-stats-total">
            Всего: <strong>{totalCount}</strong>
          </Text>
          {filtersDirty && (
            <Text className="projects-page-stats-filtered">
              Показано: <strong>{filteredCount}</strong>
            </Text>
          )}
        </div>
      </TltCard>
    </Col>
  );
}
