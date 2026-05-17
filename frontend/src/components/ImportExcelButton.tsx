import { useEffect, useRef, useState } from 'react';
import { Button, Modal, Space, Tooltip, Typography, message } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCalcTask } from '@/api/calculations';
import {
  downloadImportTemplate,
  importObjectsExcel,
  type ImportMode,
  type ImportResult,
} from '@/api/projects';
import { getCalcJobRefetchInterval, isActiveCalcJobStatus } from '@/utils/calcJobPolling';

const { Text } = Typography;

interface Props {
  projectId: string;
  existingObjectCount: number;
}

export default function ImportExcelButton({ projectId, existingObjectCount }: Props) {
  const qc = useQueryClient();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: activeTask } = useQuery({
    queryKey: ['calc-job', activeTaskId],
    queryFn: () => getCalcTask(activeTaskId!),
    enabled: !!activeTaskId,
    refetchInterval: (query) => getCalcJobRefetchInterval(query.state.data?.status),
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!activeTask || isActiveCalcJobStatus(activeTask.status)) return;
    qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'query'] });
    qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'summary'] });
    if (activeTask.status === 'succeeded') {
      const batchResult = activeTask.result;
      if (batchResult && 'updated' in batchResult && 'failed' in batchResult) {
        message.success(
          `Пересчёт завершён: рассчитано ${batchResult.updated}, ошибок ${batchResult.failed}`
        );
      } else {
        message.success('Пересчёт теплопотерь завершён');
      }
    } else if (activeTask.status === 'cancelled') {
      message.warning('Пересчёт теплопотерь отменён');
    } else {
      message.error(activeTask.error_message || 'Пересчёт теплопотерь завершился ошибкой');
    }
    setActiveTaskId(null);
  }, [activeTask, projectId, qc]);

  const importMut = useMutation({
    mutationFn: ({ file, mode }: { file: File; mode: ImportMode }) =>
      importObjectsExcel(projectId, file, mode),
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'query'] });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'summary'] });
      if (res.heat_loss_task) {
        setActiveTaskId(res.heat_loss_task.id);
        qc.invalidateQueries({ queryKey: ['calc-job', res.heat_loss_task.id] });
        message.info('Пересчёт теплопотерь поставлен в очередь');
      }
      if (res.errors.length === 0) {
        const skippedText = res.skipped_duplicates
          ? `, дублей пропущено: ${res.skipped_duplicates}`
          : '';
        message.success(`Импортировано объектов: ${res.created}${skippedText}`);
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
    if (existingObjectCount > 0) {
      setPendingFile(file);
      return;
    }
    importMut.mutate({ file, mode: 'merge' });
  };

  const runImport = (mode: ImportMode) => {
    if (!pendingFile) return;
    const file = pendingFile;
    setPendingFile(null);
    importMut.mutate({ file, mode });
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
            className="action-secondary-button import-upload-button"
            icon={<UploadOutlined />}
            aria-label="Импорт XLSX/CSV"
            size="small"
            loading={importMut.isPending}
            onClick={onPick}
          >
            Импорт
          </Button>
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
        open={!!pendingFile}
        title="Импорт в непустой проект"
        onCancel={() => setPendingFile(null)}
        footer={[
          <Button key="cancel" onClick={() => setPendingFile(null)}>
            Отмена
          </Button>,
          <Button key="append" onClick={() => runImport('append')}>
            Добавить
          </Button>,
          <Button key="replace" danger onClick={() => runImport('replace')}>
            Заменить
          </Button>,
          <Button key="merge" type="primary" onClick={() => runImport('merge')}>
            Объединить
          </Button>,
        ]}
      >
        <p>
          В проекте уже есть {existingObjectCount} объектов. Файл{' '}
          <Text code>{pendingFile?.name}</Text> можно объединить с текущими объектами,
          добавить как новые строки или заменить текущий список объектов.
        </p>
      </Modal>

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
            {result.skipped_duplicates > 0 && (
              <p>
                <Text strong>Пропущено дублей: </Text>
                <Text type="secondary">{result.skipped_duplicates}</Text>
              </p>
            )}
            {result.heat_loss_task && (
              <p>
                <Text type="secondary">Пересчёт теплопотерь поставлен в очередь.</Text>
              </p>
            )}
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
            {result.created > 0 &&
              result.errors.length === 0 &&
              result.skipped_duplicates === 0 && (
                <Text type="secondary">Все строки импортированы без ошибок ✓</Text>
              )}
          </>
        )}
      </Modal>
    </>
  );
}
