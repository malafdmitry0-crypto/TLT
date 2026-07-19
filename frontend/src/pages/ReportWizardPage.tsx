import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Row,
  Segmented,
  Skeleton,
  Space,
  Steps,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CloseOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FileWordOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  exportReport,
  getReportPreview,
  REPORT_SECTIONS,
  REPORT_SECTION_LABELS,
  type ReportSection,
} from '@/api/reports';
import { useProjectStore } from '@/store/projectStore';
import { useAuthStore } from '@/store/authStore';
import { useLegacyElectricalVariantContext } from '@/pages/electrical/useLegacyElectricalVariantContext';
import ReportPreview from '@/components/reports/ReportPreview';
import QueryError from '@/components/common/QueryError';

const { Title, Paragraph, Text } = Typography;

type Format = 'pdf' | 'docx' | 'xlsx';

const FORMAT_LABEL: Record<Format, { label: string; icon: React.ReactNode }> = {
  pdf: { label: 'PDF', icon: <FilePdfOutlined /> },
  docx: { label: 'Word (DOCX)', icon: <FileWordOutlined /> },
  xlsx: { label: 'Excel (XLSX)', icon: <FileExcelOutlined /> },
};

/**
 * Standalone-страница мастера формирования отчёта (ТЗ 4.3.4).
 * Открывается в отдельном окне через window.open. MainLayout не используется —
 * мастер занимает всё окно и фокусируется на трёх шагах: разделы → формат → экспорт.
 */
export default function ReportWizardPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const isEmployee = role === 'employee' || role === 'admin';
  const variantContext = useLegacyElectricalVariantContext(project?.id);
  const selectedElectricalVariant = variantContext.selectedVariant;
  const firstSupportedVariant = variantContext.variants[0] ?? null;
  const variant = variantContext.legacyVariantNumber ?? null;
  const reportDataPlaneEnabled = Boolean(project && selectedElectricalVariant);

  const [sections, setSections] = useState<ReportSection[]>([...REPORT_SECTIONS]);
  const [format, setFormat] = useState<Format>('pdf');
  const [step, setStep] = useState(0);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [
      'report-preview-wizard',
      project?.id,
      selectedElectricalVariant?.id,
      variant,
      sections.join(','),
    ],
    queryFn: () => getReportPreview(
      project!.id,
      variant,
      selectedElectricalVariant!.id,
      sections,
    ),
    enabled: reportDataPlaneEnabled,
  });

  if (!project) {
    return (
      <Card style={{ margin: 24 }}>
        <Alert
          type="warning"
          showIcon
          message="Проект не выбран"
          description="Откройте проект в основном окне и заново вызовите мастер."
        />
      </Card>
    );
  }

  if (!isEmployee) {
    return (
      <Card style={{ margin: 24 }}>
        <Alert
          type="error"
          showIcon
          message="Доступ запрещён"
          description="Мастер формирования отчёта доступен только сотрудникам."
        />
      </Card>
    );
  }

  if (variantContext.isLoading) {
    return (
      <Card style={{ margin: 24 }} aria-busy="true" aria-label="Загрузка списка ЭР">
        <Skeleton active title paragraph={{ rows: 5 }} />
      </Card>
    );
  }

  if (variantContext.isError) {
    return (
      <Card style={{ margin: 24 }}>
        <QueryError
          error={variantContext.error}
          title="Не удалось загрузить список ЭР"
          onRetry={() => variantContext.refetch()}
          retrying={variantContext.isFetching}
        />
      </Card>
    );
  }

  if (!selectedElectricalVariant) {
    return (
      <Card style={{ margin: 24 }}>
        <Alert
          type="warning"
          showIcon
          message="ЭР ещё не создан"
          description="Создайте первый ЭР на шаге электротехнического расчёта."
          action={firstSupportedVariant && (
            <Button onClick={() => variantContext.selectVariant(firstSupportedVariant.id)}>
              Выбрать {firstSupportedVariant.name}
            </Button>
          )}
        />
      </Card>
    );
  }

  const handleExport = async () => {
    const scope = {
      electricalVariantId: selectedElectricalVariant.id,
      electricalVariantName: selectedElectricalVariant.name,
      legacyVariantNumber: variant,
      sections: [...sections],
      format,
    };
    try {
      setExporting(true);
      message.loading({ content: 'Формирование отчёта...', key: 'report-export', duration: 0 });
      const blob = await exportReport(
        project.id,
        scope.format,
        scope.electricalVariantId,
        scope.sections,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}-${scope.electricalVariantName}.${scope.format}`;
      a.click();
      URL.revokeObjectURL(url);
      message.success({
        content: `Файл для «${scope.electricalVariantName}» скачан`,
        key: 'report-export',
      });
    } catch {
      message.error({ content: 'Не удалось скачать отчёт', key: 'report-export' });
    } finally {
      setExporting(false);
    }
  };

  const allSelected = sections.length === REPORT_SECTIONS.length;

  return (
    <div style={{ padding: 16, minHeight: '100vh', background: '#f5f7fa' }}>
      <Card
        size="small"
        styles={{ body: { padding: 16 } }}
        title={
          <Space>
            <FileTextOutlined />
            <Text strong>Мастер формирования отчёта</Text>
            <Tag color="blue">{project.name}</Tag>
            <Tag color="geekblue">{selectedElectricalVariant.name}</Tag>
          </Space>
        }
        extra={
          <Button
            size="small"
            icon={<CloseOutlined />}
            onClick={() => window.close()}
          >
            Закрыть окно
          </Button>
        }
      >
        <Steps
          size="small"
          current={step}
          onChange={exporting ? undefined : setStep}
          style={{ marginBottom: 16 }}
          items={[
            { title: 'Разделы' },
            { title: 'Формат' },
            { title: 'Предпросмотр и экспорт' },
          ]}
        />

        <Row gutter={16}>
          <Col flex="0 0 280px">
            {step === 0 && (
              <Card size="small" title="Состав отчёта">
                <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                  Отметьте, какие разделы войдут в файл.
                </Paragraph>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Вариант расчёта:
                </Text>
                <div style={{ maxWidth: '100%', overflowX: 'auto', margin: '4px 0 10px' }}>
                  <Segmented<string>
                    size="small"
                    value={selectedElectricalVariant.id}
                    onChange={variantContext.selectVariant}
                    disabled={exporting}
                    options={variantContext.variants.map((item) => ({
                      label: item.name,
                      value: item.id,
                      disabled: false,
                    }))}
                  />
                </div>
                <Button
                  type="link"
                  size="small"
                  onClick={() =>
                    setSections(allSelected ? [] : [...REPORT_SECTIONS])
                  }
                  disabled={exporting}
                  style={{ padding: 0, marginBottom: 8 }}
                >
                  {allSelected ? 'Снять все' : 'Выбрать все'}
                </Button>
                <Checkbox.Group
                  value={sections}
                  onChange={(v) => setSections(v as ReportSection[])}
                  disabled={exporting}
                  style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  {REPORT_SECTIONS.map((s) => (
                    <Checkbox key={s} value={s}>
                      {REPORT_SECTION_LABELS[s]}
                    </Checkbox>
                  ))}
                </Checkbox.Group>
                <Button
                  type="primary"
                  block
                  size="small"
                  style={{ marginTop: 12 }}
                  disabled={sections.length === 0}
                  onClick={() => setStep(1)}
                >
                  Далее: формат →
                </Button>
              </Card>
            )}

            {step === 1 && (
              <Card size="small" title="Формат экспорта">
                <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                  Файл будет сформирован при нажатии «Скачать».
                </Paragraph>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => (
                    <Button
                      key={f}
                      block
                      size="small"
                      type={format === f ? 'primary' : 'default'}
                      icon={FORMAT_LABEL[f].icon}
                      disabled={exporting}
                      onClick={() => setFormat(f)}
                    >
                      {FORMAT_LABEL[f].label}
                    </Button>
                  ))}
                </Space>
                <Space style={{ marginTop: 12, width: '100%' }}>
                  <Button size="small" disabled={exporting} onClick={() => setStep(0)}>
                    ← Назад
                  </Button>
                  <Button type="primary" size="small" disabled={exporting} onClick={() => setStep(2)}>
                    Далее: предпросмотр →
                  </Button>
                </Space>
              </Card>
            )}

            {step === 2 && (
              <Card size="small" title="Готово к экспорту">
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Разделы:
                  </Text>
                  <div style={{ marginTop: 4 }}>
                    {allSelected ? (
                      <Tag color="blue">все</Tag>
                    ) : (
                      sections.map((s) => (
                        <Tag key={s} color="geekblue" style={{ marginBottom: 4 }}>
                          {REPORT_SECTION_LABELS[s]}
                        </Tag>
                      ))
                    )}
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Вариант:
                  </Text>{' '}
                  <Tag color="geekblue">{selectedElectricalVariant.name}</Tag>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Формат:
                  </Text>{' '}
                  <Tag color="purple" icon={FORMAT_LABEL[format].icon}>
                    {FORMAT_LABEL[format].label}
                  </Tag>
                </div>
                <Button
                  type="primary"
                  block
                  size="large"
                  icon={FORMAT_LABEL[format].icon}
                  loading={exporting}
                  onClick={handleExport}
                >
                  Скачать {FORMAT_LABEL[format].label}
                </Button>
                <Button
                  block
                  size="small"
                  style={{ marginTop: 8 }}
                  disabled={exporting}
                  onClick={() => setStep(1)}
                >
                  ← Изменить формат
                </Button>
                <Button
                  block
                  size="small"
                  style={{ marginTop: 4 }}
                  disabled={exporting}
                  onClick={() => setStep(0)}
                >
                  ← Изменить разделы
                </Button>
              </Card>
            )}
          </Col>

          <Col flex="1" style={{ minWidth: 0 }}>
            <Card size="small" title="Предпросмотр HTML">
              {isError && !data && (
                <QueryError
                  error={error}
                  title="Не удалось загрузить предпросмотр"
                  onRetry={() => refetch()}
                  retrying={isFetching}
                />
              )}
              {isLoading && !isError && (
                <div aria-busy="true" aria-label="Загрузка предпросмотра отчёта">
                  <Skeleton active title={{ width: '40%' }} paragraph={{ rows: 8 }} />
                </div>
              )}
              {!isLoading && !isError && sections.length === 0 && (
                <Alert
                  type="info"
                  showIcon
                  message="Не выбрано ни одного раздела"
                  description="Отметьте хотя бы один раздел в шаге 1, чтобы увидеть предпросмотр."
                />
              )}
              {data && sections.length > 0 && (
                <div style={{ maxHeight: 'calc(100vh - 260px)', overflow: 'auto' }}>
                  <ReportPreview html={data.html} />
                </div>
              )}
            </Card>
          </Col>
        </Row>

        <Title level={5} style={{ marginTop: 16, color: '#888' }}>
          <span style={{ fontSize: 11 }}>
            Это окно — отдельный мастер. Изменения здесь не сохраняются на основной
            странице «Отчёт». Окно можно закрыть после выгрузки файла.
          </span>
        </Title>
      </Card>
    </div>
  );
}
