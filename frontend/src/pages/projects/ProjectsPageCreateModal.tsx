import { Modal, Space } from 'antd';
import { TltTextField } from '@/components/ui-kit';

export interface ProjectsPageCreateModalProps {
  open: boolean;
  name: string;
  taskNumber: string;
  confirmLoading: boolean;
  onNameChange: (value: string) => void;
  onTaskNumberChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function ProjectsPageCreateModal({
  open,
  name,
  taskNumber,
  confirmLoading,
  onNameChange,
  onTaskNumberChange,
  onCancel,
  onSubmit,
}: ProjectsPageCreateModalProps) {
  return (
    <Modal
      title="Создать проект"
      open={open}
      onCancel={onCancel}
      onOk={onSubmit}
      confirmLoading={confirmLoading}
      okText="Создать"
      cancelText="Отмена"
      okButtonProps={{ disabled: !name.trim() }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <TltTextField
          placeholder="Название проекта"
          value={name}
          onChange={onNameChange}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && name.trim()) onSubmit();
          }}
          autoFocus
          aria-label="Название проекта"
        />
        <TltTextField
          placeholder="Номер задачи (необязательно)"
          value={taskNumber}
          onChange={onTaskNumberChange}
          maxLength={64}
          aria-label="Номер задачи"
        />
      </Space>
    </Modal>
  );
}
