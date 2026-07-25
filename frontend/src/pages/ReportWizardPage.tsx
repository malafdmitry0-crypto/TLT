import { useState } from 'react';
import {
  Checkbox,
  Col,
  Row,
  Segmented,
  Skeleton,
  Space,
  Steps,
  Typography,
  message,
} from 'antd';
import { TltAlert, TltBadge, TltButton, TltCard } from '@/components/ui-kit';
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
import { useLegacyElectricalVariantContext } from '@/hooks/useLegacyElectricalVariantContext';
import ReportPreview from '@/components/reports/ReportPreview';
import QueryError from '@/components/common/QueryError';
import './report-wizard-page.css';

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
      <TltCard className="report-wizard-page-card">
        <TltAlert
          tone="warning"
          title="Проект не выбран"
        >
          Откройте проект в основном окне и заново вызовите мастер.
        </TltAlert>
      </TltCard>
    );
  }

  if (!isEmployee) {
    return (
      <TltCard className="report-wizard-page-card">
        <TltAlert
          tone="danger"
          title="Доступ запрещён"
        >
          Мастер формирования отчёта доступен только сотрудникам.
        </TltAlert>
      </TltCard>
    );
  }

  if (variantContext.isLoading) {
    return (
      <TltCard className="report-wizard-page-card" aria-busy="true" aria-label="Загрузка списка ЭР">
        <Skeleton active title paragraph={{ rows: 5 }} />
      </TltCard>
    );
  }

  if (variantContext.isError) {
    return (
      <TltCard className="report-wizard-page-card">
        <QueryError
          error={variantContext.error}
          title="Не удалось загрузить список ЭР"
          onRetry={() => variantContext.refetch()}
          retrying={variantContext.isFetching}
        />
      </TltCard>
    );
  }

  if (!selectedElectricalVariant) {
    return (
      <TltCard className="report-wizard-page-card">
        <TltAlert
          tone="warning"
          title="ЭР ещё не создан"
          action={firstSupportedVariant && (
            <TltButton onClick={() => variantContext.selectVariant(firstSupportedVariant.id)}>
              Выбрать {firstSupportedVariant.name}
            </TltButton>
          )}
        >
          Создайте первый ЭР на шаге электротехнического расчёта.
        </TltAlert>
      </TltCard>
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
    <div className="report-wizard-page">
      <TltCard
        
        className="report-wizard-page-main"
        title={
          <Space>
            <FileTextOutlined />
            <Text strong>Мастер формирования отчёта</Text>
            <TltBadge tone="info">{project.name}</TltBadge>
            <TltBadge tone="info">{selectedElectricalVariant.name}</TltBadge>
          </Space>
        }
        actions={
          <TltButton
            
            icon={<CloseOutlined />}
            onClick={() => window.close()}
          >
            Закрыть окно
          </TltButton>
        }
      >
        <Steps
          
          current={step}
          onChange={exporting ? undefined : setStep}
          className="report-wizard-page-steps"
          items={[
            { title: 'Разделы' },
            { title: 'Формат' },
            { title: 'Предпросмотр и экспорт' },
          ]}
        />

        <Row gutter={16}>
          <Col flex="0 0 280px">
            {step === 0 && (
              <TltCard  title="Состав отчёта">
                <Paragraph type="secondary" className="report-wizard-page-hint">
                  Отметьте, какие разделы войдут в файл.
                </Paragraph>
                <Text type="secondary" className="report-wizard-page-label">
                  Вариант расчёта:
                </Text>
                <div className="report-wizard-page-variant-scroll">
                  <Segmented<string>
                    
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
                <TltButton
                  variant="link"
                  
                  onClick={() =>
                    setSections(allSelected ? [] : [...REPORT_SECTIONS])
                  }
                  disabled={exporting}
                  className="report-wizard-page-select-all"
                >
                  {allSelected ? 'Снять все' : 'Выбрать все'}
                </TltButton>
                <Checkbox.Group
                  value={sections}
                  onChange={(v) => setSections(v as ReportSection[])}
                  disabled={exporting}
                  className="report-wizard-page-sections"
                >
                  {REPORT_SECTIONS.map((s) => (
                    <Checkbox key={s} value={s}>
                      {REPORT_SECTION_LABELS[s]}
                    </Checkbox>
                  ))}
                </Checkbox.Group>
                <TltButton
                  variant="primary"
                                    
                  className="report-wizard-page-next"
                  disabled={sections.length === 0}
                  onClick={() => setStep(1)}
                >
                  Далее: формат →
                </TltButton>
              </TltCard>
            )}

            {step === 1 && (
              <TltCard  title="Формат экспорта">
                <Paragraph type="secondary" className="report-wizard-page-hint">
                  Файл будет сформирован при нажатии «Скачать».
                </Paragraph>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => (
                    <TltButton
                      key={f}
                                            
                      variant={format === f  ? 'primary' : 'secondary'}
                      icon={FORMAT_LABEL[f].icon}
                      disabled={exporting}
                      onClick={() => setFormat(f)}
                    >
                      {FORMAT_LABEL[f].label}
                    </TltButton>
                  ))}
                </Space>
                <Space style={{ marginTop: 12, width: '100%' }}>
                  <TltButton  disabled={exporting} onClick={() => setStep(0)}>
                    ← Назад
                  </TltButton>
                  <TltButton variant="primary"  disabled={exporting} onClick={() => setStep(2)}>
                    Далее: предпросмотр →
                  </TltButton>
                </Space>
              </TltCard>
            )}

            {step === 2 && (
              <TltCard  title="Готово к экспорту">
                <div className="report-wizard-page-block">
                  <Text type="secondary" className="report-wizard-page-label">
                    Разделы:
                  </Text>
                  <div className="report-wizard-page-tags">
                    {allSelected ? (
                      <TltBadge tone="info">все</TltBadge>
                    ) : (
                      sections.map((s) => (
                        <TltBadge key={s} tone="info" className="report-wizard-page-tag">
                          {REPORT_SECTION_LABELS[s]}
                        </TltBadge>
                      ))
                    )}
                  </div>
                </div>
                <div className="report-wizard-page-block--lg">
                  <Text type="secondary" className="report-wizard-page-label">
                    Вариант:
                  </Text>{' '}
                  <TltBadge tone="info">{selectedElectricalVariant.name}</TltBadge>
                </div>
                <div className="report-wizard-page-block--lg">
                  <Text type="secondary" className="report-wizard-page-label">
                    Формат:
                  </Text>{' '}
                  <TltBadge tone="info">
                    {FORMAT_LABEL[format].icon} {FORMAT_LABEL[format].label}
                  </TltBadge>
                </div>
                <TltButton
                  variant="primary"
                  size="comfortable"
                  icon={FORMAT_LABEL[format].icon}
                  loading={exporting}
                  onClick={handleExport}
                >
                  Скачать {FORMAT_LABEL[format].label}
                </TltButton>
                <TltButton
                                    
                  className="report-wizard-page-back"
                  disabled={exporting}
                  onClick={() => setStep(1)}
                >
                  ← Изменить формат
                </TltButton>
                <TltButton
                                    
                  className="report-wizard-page-back--sm"
                  disabled={exporting}
                  onClick={() => setStep(0)}
                >
                  ← Изменить разделы
                </TltButton>
              </TltCard>
            )}
          </Col>

          <Col flex="1" className="report-wizard-page-preview-col">
            <TltCard  title="Предпросмотр HTML">
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
                <TltAlert
                  tone="info"
                  title="Не выбрано ни одного раздела"
                >
                  Отметьте хотя бы один раздел в шаге 1, чтобы увидеть предпросмотр.
                </TltAlert>
              )}
              {data && sections.length > 0 && (
                <div className="report-wizard-page-preview">
                  <ReportPreview html={data.html} />
                </div>
              )}
            </TltCard>
          </Col>
        </Row>

        <Title level={5} className="report-wizard-page-footnote">
          <span className="report-wizard-page-footnote-text">
            Это окно — отдельный мастер. Изменения здесь не сохраняются на основной
            странице «Отчёт». Окно можно закрыть после выгрузки файла.
          </span>
        </Title>
      </TltCard>
    </div>
  );
}
