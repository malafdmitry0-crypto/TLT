import { useRef, useState } from 'react';
import { Button, Modal, Space, Tooltip, Typography, message } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  downloadImportTemplate,
  importObjectsExcel,
  type ImportResult,
} from '@/api/projects';

const { Text } = Typography;

interface Props {
  projectId: string;
}

export default function ImportExcelButton({ projectId }: Props) {
  const qc = useQueryClient();
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMut = useMutation({
    mutationFn: (file: File) => importObjectsExcel(projectId, file),
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ['project', projectId, 'objects'] });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'summary'] });
      if (res.errors.length === 0) {
        message.success(`Импортировано объектов: ${res.created}`);
      } else {
        message.warning(
          `Импортировано: ${res.created}. Ошибок: ${res.errors.length}`
        );
      }
    },
    onError: (e: Error) => message.error(e.message),
  });

  const onPick = () => fileInputRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!(lower.endsWith('.xlsx') || lower.endsWith('.csv'))) {
      message.error('Нужен файл .xlsx или .csv');
      return;
    }
    importMut.mutate(file);
  };

  const downloadTemplate = async (format: 'xlsx' | 'csv') => {
    try {
      const blob = await downloadImportTemplate(projectId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `import_template.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('Не удалось скачать шаблон');
    }
  };

  return (
    <>
      <Space className="import-actions-compact" size={2} wrap>
        <Tooltip title="Импорт XLSX/CSV">
          <Button
            className="action-icon-button import-upload-button"
            icon={<UploadOutlined />}
            aria-label="Импорт XLSX/CSV"
            size="small"
            loading={importMut.isPending}
            onClick={onPick}
          />
        </Tooltip>
        <Tooltip title="Скачать шаблон XLSX">
          <Button
            icon={<DownloadOutlined />}
            aria-label="Скачать шаблон XLSX"
            size="small"
            type="link"
            className="template-download-button"
            onClick={() => downloadTemplate('xlsx')}
          >
            .xlsx
          </Button>
        </Tooltip>
        <Tooltip title="Скачать шаблон CSV">
          <Button
            icon={<DownloadOutlined />}
            aria-label="Скачать шаблон CSV"
            size="small"
            type="link"
            className="template-download-button"
            onClick={() => downloadTemplate('csv')}
          >
            .csv
          </Button>
        </Tooltip>
      </Space>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.csv"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />

      <Modal
        open={!!result}
        title="Результат импорта"
        onCancel={() => setResult(null)}
        onOk={() => setResult(null)}
        okText="OK"
        cancelButtonProps={{ style: { display: 'none' } }}
        width={560}
      >
        {result && (
          <>
            <p>
              <Text strong>Создано объектов: </Text>
              <Text style={{ color: '#52c41a' }}>{result.created}</Text>
            </p>
            {result.errors.length > 0 && (
              <>
                <p>
                  <Text strong>Пропущено строк: </Text>
                  <Text type="danger">{result.errors.length}</Text>
                </p>
                <div
                  style={{
                    maxHeight: 280,
                    overflow: 'auto',
                    border: '1px solid #eee',
                    padding: 8,
                    background: '#fafafa',
                  }}
                >
                  {result.errors.map((err, i) => (
                    <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>
                      <Text code>{err.sheet} · стр. {err.row}</Text>{' '}
                      <Text type="danger">{err.message}</Text>
                    </div>
                  ))}
                </div>
              </>
            )}
            {result.created > 0 && result.errors.length === 0 && (
              <Text type="secondary">Все строки импортированы без ошибок ✓</Text>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
