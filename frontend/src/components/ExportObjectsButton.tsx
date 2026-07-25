import { Tooltip } from 'antd';
import { appMessage as message } from '@/feedback/appFeedback';
import { FileExcelOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { TltButton } from '@/components/ui-kit';
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
        <TltButton
          className="action-icon-button"
          icon={<FileExcelOutlined />}
          aria-label="Экспорт в Excel"
          size="icon"
          loading={loading}
          disabled={disabled}
          onClick={handleExport}
        />
      </span>
    </Tooltip>
  );
}
