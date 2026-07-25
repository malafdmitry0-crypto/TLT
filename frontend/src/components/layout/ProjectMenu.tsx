import { useRef, useState } from 'react';
import { Modal, Space, Typography } from 'antd';
import { appMessage as message, appModal } from '@/feedback/appFeedback';
import { DownloadOutlined, FolderOpenOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TltButton, TltTextField } from '@/components/ui-kit';
import {
  createProject,
  exportProjectCsv,
  importProjectCsv,
} from '@/api/projects';
import { useProjectStore } from '@/store/projectStore';
import { useAuthStore } from '@/store/authStore';
import { useLocation, useNavigate } from 'react-router-dom';
import './layout-chrome.css';

const { Text } = Typography;

export default function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [taskNumber, setTaskNumber] = useState('');
  const qc = useQueryClient();
  const setCurrent = useProjectStore((s) => s.setCurrentProject);
  const currentProject = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const navigate = useNavigate();
  const location = useLocation();
  const isEmployee = role === 'employee' || role === 'admin';
  const isProjectsPage = location.pathname.startsWith('/projects');

  const createMut = useMutation({
    mutationFn: () =>
      createProject({ name, task_number: taskNumber.trim() || null }),
    onSuccess: (project) => {
      setCurrent(project);
      qc.invalidateQueries({ queryKey: ['projects'] });
      message.success('Проект создан');
      setOpen(false);
      setName('');
      setTaskNumber('');
    },
    onError: (err: Error) => message.error(err.message),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!currentProject) return;
    try {
      const blob = await exportProjectCsv(currentProject.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject.task_number ? currentProject.task_number + '_' : ''}${currentProject.name}.tlt.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const importMut = useMutation({
    mutationFn: (file: File) => importProjectCsv(file),
    onSuccess: (project) => {
      setCurrent(project);
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', project.id] });
      // Broad invalidate so heat/electrical/spec tables reload after replace.
      qc.invalidateQueries({ queryKey: ['project', project.id, 'objects'] });
      qc.invalidateQueries({ queryKey: ['spec'] });
      message.success(`Импортирован проект «${project.name}»`);
    },
    onError: (err: Error) => {
      // PDF-GUEST-07: failed parse must not replace current project.
      message.error(err.message || 'Не удалось импортировать файл. Текущий проект не изменён.');
    },
  });

  const handleImportClick = () => {
    // PDF §5.11 / CODE-02: warn that open/import replaces current temporary project.
    if (!currentProject) {
      fileInputRef.current?.click();
      return;
    }
    appModal.confirm({
      title: 'Заменить текущий проект?',
      content: (
        <div data-testid="project-import-replace-confirm">
          <p>
            Загрузка CSV заменит текущий проект «{currentProject.name}» данными из файла.
            Несохранённые изменения в браузере будут потеряны.
          </p>
          <p className="project-menu-hint">
            При ошибке разбора файла текущий проект останется без изменений.
          </p>
        </div>
      ),
      okText: 'Заменить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true, 'data-testid': 'project-import-replace-ok' },
      cancelButtonProps: { 'data-testid': 'project-import-replace-cancel' },
      onOk: () => {
        fileInputRef.current?.click();
      },
    });
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importMut.mutate(file);
    e.target.value = '';
  };

  if (isProjectsPage) return null;

  return (
    <Space className="project-menu" size={3}>
      {currentProject && (
        <Space className="project-menu-current" size={3}>
          <FolderOpenOutlined className="project-menu-current-icon" />
          <Text
            className="project-menu-current-name project-menu-name"
            title={currentProject.name}
          >
            {currentProject.name}
          </Text>
        </Space>
      )}

      {!isProjectsPage && isEmployee && (
        <>
          <TltButton variant="primary" onClick={() => setOpen(true)}>
            Новый проект
          </TltButton>
          <TltButton onClick={() => navigate('/projects')}>Открыть</TltButton>
        </>
      )}
      {!isProjectsPage && (
        <>
          <TltButton
            icon={<DownloadOutlined />}
            onClick={handleExport}
            disabled={!currentProject}
            title="Скачать проект (CSV)"
          >
            Скачать
          </TltButton>
          <TltButton
            icon={<UploadOutlined />}
            onClick={handleImportClick}
            loading={importMut.isPending}
            title="Загрузить проект (CSV) — заменит текущий"
            data-testid="project-menu-import-csv"
          >
            Загрузить
          </TltButton>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="project-menu-file-input"
            data-testid="project-menu-import-file-input"
            onChange={handleFileChange}
          />
        </>
      )}
      <Modal
        title="Создать проект"
        open={open}
        onCancel={() => { setOpen(false); setName(''); setTaskNumber(''); }}
        onOk={() => createMut.mutate()}
        confirmLoading={createMut.isPending}
        okText="Создать"
        cancelText="Отмена"
        okButtonProps={{ disabled: !name.trim() }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <TltTextField
            placeholder="Название проекта"
            aria-label="Название проекта"
            value={name}
            onChange={setName}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) createMut.mutate();
            }}
          />
          <TltTextField
            placeholder="Номер задачи (необязательно)"
            aria-label="Номер задачи (необязательно)"
            value={taskNumber}
            onChange={setTaskNumber}
            maxLength={64}
          />
        </Space>
      </Modal>
    </Space>
  );
}
