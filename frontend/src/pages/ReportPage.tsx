import { useEffect, useMemo, useState } from 'react';
import { Checkbox, Skeleton, Space, Typography } from 'antd';
import { appMessage as message } from '@/feedback/appFeedback';
import { TltAlert, TltBadge, TltButton, TltCard } from '@/components/ui-kit';
import {
  FileTextOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  SettingOutlined,
  ExportOutlined,
  PrinterOutlined,
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
import { useLegacyElectricalVariantContext } from '@/hooks/useLegacyElectricalVariantContext';
import ReportPreview from '@/components/reports/ReportPreview';
import QueryError from '@/components/common/QueryError';
import ReportWizard from '@/components/reports/ReportWizard';
import EmptyProjectState from '@/components/common/EmptyProjectState';
import './report-page.css';

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
  const [reportErIds, setReportErIds] = useState<string[]>([]);
  const variantContext = useLegacyElectricalVariantContext(project?.id);
  const selectedElectricalVariant = variantContext.selectedVariant;
  const variant = variantContext.legacyVariantNumber ?? null;
  // Phase 5: report scopes by UUID; legacy slot is optional compatibility metadata.
  const reportDataPlaneEnabled = Boolean(project && selectedElectricalVariant);
  useEffect(() => {
    if (!selectedElectricalVariant?.id) return;
    setReportErIds((prev) => (prev.length ? prev : [selectedElectricalVariant.id]));
  }, [selectedElectricalVariant?.id]);

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
      reportErIds.join(','),
      variant,
      debouncedSectionsKey,
    ],
    queryFn: () => getReportPreview(
      project!.id,
      reportErIds.length > 1 ? null : variant,
      reportErIds.length ? reportErIds : selectedElectricalVariant!.id,
      previewSections,
    ),
    enabled: reportDataPlaneEnabled,
  });

  if (!project) {
    return (
      <EmptyProjectState
        icon={<FileTextOutlined className="report-page-icon" />}
        title="Отчёт"
        description="Шаг 4 из 4. Итоговый документ по проекту с результатами расчётов."
      />
    );
  }

  if (variantContext.isLoading) {
    return (
      <TltCard aria-busy="true" aria-label="Загрузка списка ЭР">
        <Skeleton active title paragraph={{ rows: 6 }} />
      </TltCard>
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
      <TltAlert
        tone="warning"
        title="ЭР ещё не создан"
      >
        Создайте первый ЭР на шаге электротехнического расчёта.
      </TltAlert>
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
    } catch (error) {
      message.error({
        content: error instanceof Error ? error.message : 'Не удалось скачать отчёт',
        key: 'report-export',
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const allSelected = sections.length === REPORT_SECTIONS.length;

  return (
    <>
      <TltCard
        title={
          <span>
            <FileTextOutlined className="report-page-icon" />
            Шаг 4. Отчёт по проекту
          </span>
        }
        actions={
          <Space>
            <TltButton
              icon={<PrinterOutlined />}
              disabled={exportingFormat !== null || isLoading}
              onClick={() => window.print()}
              aria-label="Печать отчёта"
            >
              Печать
            </TltButton>
            {isEmployee && (
              <TltButton
                icon={<SettingOutlined />}
                disabled={exportingFormat !== null}
                onClick={() => setWizardOpen(true)}
              >
                Состав отчёта
              </TltButton>
            )}
            {isEmployee && (
              <TltButton
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
              </TltButton>
            )}
            {isEmployee && (
              <>
                <TltButton
                  icon={<FilePdfOutlined />}
                  loading={exportingFormat === 'pdf'}
                  disabled={exportingFormat !== null}
                  onClick={() => download('pdf')}
                >
                  PDF
                </TltButton>
                <TltButton
                  icon={<FileWordOutlined />}
                  loading={exportingFormat === 'docx'}
                  disabled={exportingFormat !== null}
                  onClick={() => download('docx')}
                >
                  Word
                </TltButton>
                <TltButton
                  icon={<FileExcelOutlined />}
                  loading={exportingFormat === 'xlsx'}
                  disabled={exportingFormat !== null}
                  onClick={() => download('xlsx')}
                >
                  Excel
                </TltButton>
              </>
            )}
          </Space>
        }
      >
        <Paragraph type="secondary" className="report-page-actions-hint">
          Итоговый отчёт содержит сводную информацию по проекту: объекты, результаты расчётов
          теплопотерь, подобранные кабели и спецификацию. Кнопка «Печать» открывает печать браузера.
          {!isEmployee && <> Server export (PDF/Word/Excel) — только сотрудникам.</>}
        </Paragraph>

        <div className="report-page-er-selector">
          <Text type="secondary" className="report-page-label">
            ЭР в отчёте:
          </Text>
          <div className="report-page-er-options">
            <Checkbox.Group
              className="report-page-er-checkbox-group"
              value={reportErIds}
              disabled={exportingFormat !== null}
              onChange={(ids) => {
                const next = ids as string[];
                setReportErIds(next);
                if (next[0]) variantContext.selectVariant(next[0]);
              }}
              options={variantContext.variants.map((item) => ({
                label: item.name,
                value: item.id,
              }))}
              aria-label="Выбор ЭР для отчёта"
            />
            <TltButton
              size="compact"
              disabled={exportingFormat !== null || variantContext.variants.length === 0}
              onClick={() => {
                const ids = variantContext.variants.map((item) => item.id);
                setReportErIds(ids);
              }}
            >
              Выбрать все
            </TltButton>
          </div>
        </div>

        {isEmployee && (
          <div className="report-page-sections">
            <Text type="secondary" className="report-page-label">
              Активные разделы:
            </Text>
            {allSelected ? (
              <TltBadge tone="info">все ({REPORT_SECTIONS.length})</TltBadge>
            ) : sections.length === 0 ? (
              <TltBadge tone="neutral">нет — выбраны 0 разделов</TltBadge>
            ) : (
              sections.map((s) => (
                <TltBadge key={s} tone="info">
                  {REPORT_SECTION_LABELS[s]}
                </TltBadge>
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
      </TltCard>

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
