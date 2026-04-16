import { Button, message } from 'antd';
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
    <Button
      icon={<FileExcelOutlined />}
      block
      size="small"
      loading={loading}
      disabled={disabled}
      onClick={handleExport}
    >
      Экспорт в Excel
    </Button>
  );
}
