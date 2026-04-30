import { useState } from 'react';
import { Button, Card, Space, Tag, Typography, message } from 'antd';
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
import ReportPreview from '@/components/reports/ReportPreview';
import ReportWizard from '@/components/reports/ReportWizard';
import EmptyProjectState from '@/components/common/EmptyProjectState';

const { Paragraph, Text } = Typography;

export default function ReportPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const isEmployee = role === 'employee';
  const [sections, setSections] = useState<ReportSection[]>([...REPORT_SECTIONS]);
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['report-preview', project?.id, sections.join(',')],
    queryFn: () => getReportPreview(project!.id, sections),
    enabled: !!project,
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
      const blob = await exportReport(project.id, fmt, sections);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('Не удалось скачать отчёт');
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
                <Button icon={<FilePdfOutlined />} onClick={() => download('pdf')}>PDF</Button>
                <Button icon={<FileWordOutlined />} onClick={() => download('docx')}>Word</Button>
                <Button icon={<FileExcelOutlined />} onClick={() => download('xlsx')}>Excel</Button>
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
        onCancel={() => setWizardOpen(false)}
        onConfirm={(s) => {
          setSections(s);
          setWizardOpen(false);
        }}
      />
    </>
  );
}
