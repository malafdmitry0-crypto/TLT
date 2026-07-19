import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Segmented, Skeleton, Space, Tag, Typography, message } from 'antd';
import {
  FileTextOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  SettingOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { ROUTES } from '@/routes/routes';
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
import ReportWizard from '@/components/reports/ReportWizard';
import EmptyProjectState from '@/components/common/EmptyProjectState';

const { Paragraph, Text } = Typography;
const REPORT_PREVIEW_DEBOUNCE_MS = 250;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [delayMs, value]);
  return debounced;
}

export default function ReportPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const isEmployee = role === 'employee' || role === 'admin';
  const [sections, setSections] = useState<ReportSection[]>([...REPORT_SECTIONS]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'docx' | 'xlsx' | null>(null);
  const variantContext = useLegacyElectricalVariantContext(project?.id);
  const selectedElectricalVariant = variantContext.selectedVariant;
  const firstSupportedVariant = variantContext.variants[0] ?? null;
  const variant = variantContext.legacyVariantNumber ?? null;
  // Phase 5: report scopes by UUID; legacy slot is optional compatibility metadata.
  const reportDataPlaneEnabled = Boolean(project && selectedElectricalVariant);
  const sectionsKey = useMemo(() => sections.join(','), [sections]);
  const debouncedSectionsKey = useDebouncedValue(sectionsKey, REPORT_PREVIEW_DEBOUNCE_MS);
  const previewSections = useMemo(
    () => debouncedSectionsKey
      .split(',')
      .filter((section): section is ReportSection => REPORT_SECTIONS.includes(section as ReportSection)),
    [debouncedSectionsKey],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [
      'report-preview',
      project?.id,
      selectedElectricalVariant?.id,
      variant,
      debouncedSectionsKey,
    ],
    queryFn: () => getReportPreview(
      project!.id,
      variant,
      selectedElectricalVariant!.id,
      previewSections,
    ),
    enabled: reportDataPlaneEnabled,
  });

  if (!project) {
    return (
      <EmptyProjectState
        icon={<FileTextOutlined style={{ marginRight: 8 }} />}
        title="Отчёт"
        description="Шаг 4 из 4. Итоговый документ по проекту с результатами расчётов."
      />
    );
  }

  if (variantContext.isLoading) {
    return (
      <Card size="small" aria-busy="true" aria-label="Загрузка списка ЭР">
        <Skeleton active title paragraph={{ rows: 6 }} />
      </Card>
    );
  }

  if (variantContext.isError) {
    return (
      <QueryError
        error={variantContext.error}
        title="Не удалось загрузить список ЭР"
        onRetry={() => variantContext.refetch()}
        retrying={variantContext.isFetching}
      />
    );
  }

  if (!selectedElectricalVariant) {
    return (
      <Alert
        type="warning"
        showIcon
        message="ЭР ещё не создан"
        description="Создайте первый ЭР на шаге электротехнического расчёта."
      />
    );
  }

  const download = async (fmt: 'pdf' | 'docx' | 'xlsx') => {
    const scope = {
      electricalVariantId: selectedElectricalVariant.id,
      electricalVariantName: selectedElectricalVariant.name,
      legacyVariantNumber: variant,
      sections: [...sections],
    };
    try {
      setExportingFormat(fmt);
      message.loading({ content: 'Формирование отчёта...', key: 'report-export', duration: 0 });
      const blob = await exportReport(
        project.id,
        fmt,
        scope.electricalVariantId,
        scope.sections,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}-${scope.electricalVariantName}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
      message.success({
        content: `Отчёт для «${scope.electricalVariantName}» готов`,
        key: 'report-export',
      });
    } catch {
      message.error({ content: 'Не удалось скачать отчёт', key: 'report-export' });
    } finally {
      setExportingFormat(null);
    }
  };

  const allSelected = sections.length === REPORT_SECTIONS.length;

  return (
    <>
      <Card
        title={
          <span>
            <FileTextOutlined style={{ marginRight: 8 }} />
            Шаг 4. Отчёт по проекту
          </span>
        }
        extra={
          <Space>
            {isEmployee && (
              <Button
                icon={<SettingOutlined />}
                disabled={exportingFormat !== null}
                onClick={() => setWizardOpen(true)}
              >
                Состав отчёта
              </Button>
            )}
            {isEmployee && (
              <Button
                icon={<ExportOutlined />}
                disabled={exportingFormat !== null}
                onClick={() =>
                  window.open(
                    `${ROUTES.reportWizard}?er=${encodeURIComponent(selectedElectricalVariant.id)}`,
                    'tlt-report-wizard',
                    'width=1280,height=860,toolbar=no,menubar=no,location=no,status=no'
                  )
                }
              >
                Мастер в новом окне
              </Button>
            )}
            {isEmployee && (
              <>
                <Button
                  icon={<FilePdfOutlined />}
                  loading={exportingFormat === 'pdf'}
                  disabled={exportingFormat !== null}
                  onClick={() => download('pdf')}
                >
                  PDF
                </Button>
                <Button
                  icon={<FileWordOutlined />}
                  loading={exportingFormat === 'docx'}
                  disabled={exportingFormat !== null}
                  onClick={() => download('docx')}
                >
                  Word
                </Button>
                <Button
                  icon={<FileExcelOutlined />}
                  loading={exportingFormat === 'xlsx'}
                  disabled={exportingFormat !== null}
                  onClick={() => download('xlsx')}
                >
                  Excel
                </Button>
              </>
            )}
          </Space>
        }
      >
        <Paragraph type="secondary" style={{ marginBottom: 8 }}>
          Итоговый отчёт содержит сводную информацию по проекту: объекты, результаты расчётов
          теплопотерь, подобранные кабели и спецификацию. Сотрудники могут скачать отчёт
          в форматах PDF, Word или Excel.
          {!isEmployee && <> Экспорт доступен только для сотрудников.</>}
        </Paragraph>

        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
            Вариант отчёта:
          </Text>
          <div style={{ maxWidth: '100%', overflowX: 'auto', paddingBottom: 4 }}>
            <Segmented<string>
              size="small"
              value={selectedElectricalVariant.id}
              onChange={variantContext.selectVariant}
              disabled={exportingFormat !== null}
              options={variantContext.variants.map((item) => ({
                label: item.name,
                value: item.id,
                disabled: false,
              }))}
            />
          </div>
        </div>

        {isEmployee && (
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
              Активные разделы:
            </Text>
            {allSelected ? (
              <Tag color="blue">все ({REPORT_SECTIONS.length})</Tag>
            ) : sections.length === 0 ? (
              <Tag color="default">нет — выбраны 0 разделов</Tag>
            ) : (
              sections.map((s) => (
                <Tag key={s} color="geekblue">
                  {REPORT_SECTION_LABELS[s]}
                </Tag>
              ))
            )}
          </div>
        )}

        {isError && !data && (
          <QueryError
            error={error}
            title="Не удалось загрузить предпросмотр отчёта"
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        )}
        {isLoading && !isError && (
          <div aria-busy="true" aria-label="Загрузка предпросмотра отчёта">
            <Skeleton active title={{ width: '40%' }} paragraph={{ rows: 10 }} />
          </div>
        )}
        {data && <ReportPreview html={data.html} />}
      </Card>

      <ReportWizard
        open={wizardOpen}
        initialSections={sections}
        initialVariantId={selectedElectricalVariant.id}
        variantOptions={variantContext.variants.map((item) => ({
          label: item.name,
          value: item.id,
          disabled: false,
        }))}
        onCancel={() => setWizardOpen(false)}
        onConfirm={(s, nextVariantId) => {
          setSections(s);
          variantContext.selectVariant(nextVariantId);
          setWizardOpen(false);
        }}
      />
    </>
  );
}
