import { Button, Tooltip, message } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { exportObjectsExcel } from '@/api/projects';

interface Props {
  projectId: string;
  projectName?: string;
  disabled?: boolean;
}

export default function ExportObjectsButton({ projectId, projectName, disabled }: Props) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const blob = await exportObjectsExcel(projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName ?? 'objects'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('Не удалось выгрузить Excel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip title={disabled ? 'Нет объектов для экспорта' : 'Экспорт в Excel'}>
      <span className="action-tooltip-wrap">
        <Button
          className="action-icon-button"
          icon={<FileExcelOutlined />}
          aria-label="Экспорт в Excel"
          size="small"
          loading={loading}
          disabled={disabled}
          onClick={handleExport}
        />
      </span>
    </Tooltip>
  );
}
