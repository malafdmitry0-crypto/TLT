import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Segmented, Space, Tag, Typography, message } from 'antd';
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
import {
  CALCULATION_VARIANTS,
  normalizeCalculationVariant,
  useCalculationVariantStore,
} from '@/store/calculationVariantStore';
import ReportPreview from '@/components/reports/ReportPreview';
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
  const isEmployee = role === 'employee';
  const [sections, setSections] = useState<ReportSection[]>([...REPORT_SECTIONS]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'docx' | 'xlsx' | null>(null);
  const storedVariant = useCalculationVariantStore((s) =>
    project?.id ? s.variantByProject[project.id] : undefined
  );
  const saveVariant = useCalculationVariantStore((s) => s.setVariant);
  const variant = normalizeCalculationVariant(storedVariant);
  const setVariant = (nextVariant: number) => {
    if (project?.id) saveVariant(project.id, nextVariant);
  };
  const sectionsKey = useMemo(() => sections.join(','), [sections]);
  const debouncedSectionsKey = useDebouncedValue(sectionsKey, REPORT_PREVIEW_DEBOUNCE_MS);
  const previewSections = useMemo(
    () => debouncedSectionsKey
      .split(',')
      .filter((section): section is ReportSection => REPORT_SECTIONS.includes(section as ReportSection)),
    [debouncedSectionsKey],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['report-preview', project?.id, variant, debouncedSectionsKey],
    queryFn: () => getReportPreview(project!.id, variant, previewSections),
    enabled: !!project,
    placeholderData: (previous) => previous,
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

  const download = async (fmt: 'pdf' | 'docx' | 'xlsx') => {
    try {
      setExportingFormat(fmt);
      message.loading({ content: 'Формирование отчёта...', key: 'report-export', duration: 0 });
      const blob = await exportReport(project.id, fmt, variant, sections);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
      message.success({ content: 'Отчёт готов', key: 'report-export' });
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
                onClick={() => setWizardOpen(true)}
              >
                Состав отчёта
              </Button>
            )}
            {isEmployee && (
              <Button
                icon={<ExportOutlined />}
                onClick={() =>
                  window.open(
                    ROUTES.reportWizard,
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
          <Segmented<number>
            size="small"
            value={variant}
            onChange={(v) => setVariant(Number(v))}
            options={CALCULATION_VARIANTS.map((n) => ({ label: `СО${n}`, value: n }))}
          />
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

        {isLoading && <Paragraph type="secondary">Загрузка предпросмотра…</Paragraph>}
        {data && <ReportPreview html={data.html} />}
      </Card>

      <ReportWizard
        open={wizardOpen}
        initialSections={sections}
        initialVariant={variant}
        onCancel={() => setWizardOpen(false)}
        onConfirm={(s, nextVariant) => {
          setSections(s);
          setVariant(nextVariant);
          setWizardOpen(false);
        }}
      />
    </>
  );
}
