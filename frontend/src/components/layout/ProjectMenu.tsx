import { useRef, useState } from 'react';
import { Button, Input, Modal, Space, Typography, message } from 'antd';
import { DownloadOutlined, FolderOpenOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createProject,
  exportProjectCsv,
  importProjectCsv,
} from '@/api/projects';
import { useProjectStore } from '@/store/projectStore';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

export default function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [taskNumber, setTaskNumber] = useState('');
  const qc = useQueryClient();
  const setCurrent = useProjectStore((s) => s.setCurrentProject);
  const currentProject = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const isEmployee = role === 'employee' || role === 'admin';

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

  const handleLogout = () => {
    logout();
    navigate('/');
  };

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
      message.success(`Импортирован проект «${project.name}»`);
    },
    onError: (err: Error) => message.error(err.message),
  });

  const handleImportClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importMut.mutate(file);
    e.target.value = '';
  };

  return (
    <Space className="project-menu" size={3}>
      {currentProject && (
        <Space className="project-menu-current" size={3}>
          <FolderOpenOutlined className="project-menu-current-icon" />
          <Text
            className="project-menu-current-name"
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'inline-block',
            }}
            title={currentProject.name}
          >
            {currentProject.name}
          </Text>
        </Space>
      )}

      {isEmployee && (
        <>
          <Button type="primary" onClick={() => setOpen(true)}>
            Новый проект
          </Button>
          <Button onClick={() => navigate('/projects')}>Открыть</Button>
        </>
      )}
      <Button
        icon={<DownloadOutlined />}
        onClick={handleExport}
        disabled={!currentProject}
        title="Скачать проект (CSV)"
      >
        Скачать
      </Button>
      <Button
        icon={<UploadOutlined />}
        onClick={handleImportClick}
        loading={importMut.isPending}
        title="Загрузить проект (CSV)"
      >
        Загрузить
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <Button onClick={handleLogout}>Выход</Button>

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
          <Input
            placeholder="Название проекта"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={() => name.trim() && createMut.mutate()}
            autoFocus
          />
          <Input
            placeholder="Номер задачи (необязательно)"
            value={taskNumber}
            onChange={(e) => setTaskNumber(e.target.value)}
            maxLength={64}
          />
        </Space>
      </Modal>
    </Space>
  );
}
