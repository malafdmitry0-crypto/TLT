import { useMemo, useState } from 'react';
import { Row } from 'antd';
import { appMessage as message } from '@/feedback/appFeedback';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PROJECT_DISPLAY_SETTINGS_QUERY_KEY } from '@/api/displaySettings';
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
import { useProjectStore } from '@/store/projectStore';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import type { ObjectType } from '@/constants/objectTypes';
import type { Project } from '@/types/project';
import { ProjectsPageFilters } from '@/pages/projects/ProjectsPageFilters';
import { ProjectsPageList } from '@/pages/projects/ProjectsPageList';
import { ProjectsPageCreateModal } from '@/pages/projects/ProjectsPageCreateModal';
import {
  computeProjectType,
  type OwnerFilter,
  type ProjectTypeFilter,
  type StatusFilter,
} from '@/pages/projects/projectsPageModel';
import './projects-page.css';

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const qc         = useQueryClient();
  const navigate   = useNavigate();
  const setCurrent = useProjectStore((s) => s.setCurrentProject);
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.role);

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
      // Кейс §5.11: файл переносит настройки отображения — применяем сразу.
      qc.invalidateQueries({ queryKey: [PROJECT_DISPLAY_SETTINGS_QUERY_KEY] });
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

  return (
    <>
      <Row className="projects-page-layout" gutter={12} align="top">
        <ProjectsPageFilters
          isEmployee={isEmployee}
          ownerFilter={ownerFilter}
          onOwnerChange={setOwner}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          containsType={containsType}
          onContainsTypeChange={setContainsType}
          yearFilter={yearFilter}
          onYearFilterChange={setYearFilter}
          availableYears={availableYears}
          statusFilter={statusFilter}
          onStatusChange={setStatus}
          taskSearch={taskSearch}
          onTaskSearchChange={setTaskSearch}
          search={search}
          onSearchChange={setSearch}
          filtersDirty={filtersDirty}
          onResetFilters={resetFilters}
          totalCount={projects.length}
          filteredCount={filtered.length}
          onCreateClick={() => setCreateOpen(true)}
        />
        <ProjectsPageList
          projects={projects}
          filtered={filtered}
          isEmployee={isEmployee}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          projectsError={projectsError}
          projectsErrorObj={projectsErrorObj}
          projectsFetching={projectsFetching}
          onRetry={() => refetchProjects()}
          onOpen={(p) => {
            setCurrent(p);
            navigate('/workspace/heat-calc');
          }}
          onDuplicate={(id) => duplicateMut.mutate(id)}
          duplicatePending={duplicateMut.isPending}
          duplicateVariables={duplicateMut.variables}
          onExportOne={exportOne}
          onExportBulk={exportBulk}
          onDelete={(id) => delMut.mutate(id)}
          onImportSingle={(file) => importSingleMut.mutate(file)}
          onImportBulk={(file) => importBulkMut.mutate(file)}
          importSinglePending={importSingleMut.isPending}
          importBulkPending={importBulkMut.isPending}
        />
      </Row>

      <ProjectsPageCreateModal
        open={createOpen}
        name={newName}
        taskNumber={newTaskNumber}
        confirmLoading={createMut.isPending}
        onNameChange={setNewName}
        onTaskNumberChange={setNewTaskNumber}
        onCancel={() => {
          setCreateOpen(false);
          setNewName('');
          setNewTaskNumber('');
        }}
        onSubmit={() => createMut.mutate()}
      />
    </>
  );
}
