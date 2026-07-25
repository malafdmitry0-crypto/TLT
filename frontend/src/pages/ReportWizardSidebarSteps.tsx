/**
 * Left-column step panels for ReportWizardPage (sections / format / export).
 */
import { Checkbox, Segmented, Space, Typography } from 'antd';
import { TltBadge, TltButton, TltCard } from '@/components/ui-kit';
import {
  REPORT_SECTIONS,
  REPORT_SECTION_LABELS,
  type ReportSection,
} from '@/api/reports';
import {
  REPORT_WIZARD_FORMAT_LABEL,
  type ReportWizardFormat,
} from '@/pages/reportWizardFormats';

const { Paragraph, Text } = Typography;

export interface ReportWizardSidebarStepsProps {
  step: number;
  sections: ReportSection[];
  format: ReportWizardFormat;
  exporting: boolean;
  allSelected: boolean;
  selectedElectricalVariant: { id: string; name: string };
  variants: Array<{ id: string; name: string }>;
  onSelectVariant: (id: string) => void;
  onSectionsChange: (sections: ReportSection[]) => void;
  onToggleAllSections: () => void;
  onFormatChange: (format: ReportWizardFormat) => void;
  onStepChange: (step: number) => void;
  onExport: () => void;
}

export function ReportWizardSidebarSteps({
  step,
  sections,
  format,
  exporting,
  allSelected,
  selectedElectricalVariant,
  variants,
  onSelectVariant,
  onSectionsChange,
  onToggleAllSections,
  onFormatChange,
  onStepChange,
  onExport,
}: ReportWizardSidebarStepsProps) {
  if (step === 0) {
    return (
      <TltCard title="Состав отчёта">
        <Paragraph type="secondary" className="report-wizard-page-hint">
          Отметьте, какие разделы войдут в файл.
        </Paragraph>
        <Text type="secondary" className="report-wizard-page-label">
          Вариант расчёта:
        </Text>
        <div className="report-wizard-page-variant-scroll">
          <Segmented<string>
            value={selectedElectricalVariant.id}
            onChange={onSelectVariant}
            disabled={exporting}
            options={variants.map((item) => ({
              label: item.name,
              value: item.id,
              disabled: false,
            }))}
          />
        </div>
        <TltButton
          variant="link"
          onClick={onToggleAllSections}
          disabled={exporting}
          className="report-wizard-page-select-all"
        >
          {allSelected ? 'Снять все' : 'Выбрать все'}
        </TltButton>
        <Checkbox.Group
          value={sections}
          onChange={(v) => onSectionsChange(v as ReportSection[])}
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
          onClick={() => onStepChange(1)}
        >
          Далее: формат →
        </TltButton>
      </TltCard>
    );
  }

  if (step === 1) {
    return (
      <TltCard title="Формат экспорта">
        <Paragraph type="secondary" className="report-wizard-page-hint">
          Файл будет сформирован при нажатии «Скачать».
        </Paragraph>
        <Space direction="vertical" style={{ width: '100%' }}>
          {(Object.keys(REPORT_WIZARD_FORMAT_LABEL) as ReportWizardFormat[]).map((f) => (
            <TltButton
              key={f}
              variant={format === f ? 'primary' : 'secondary'}
              icon={REPORT_WIZARD_FORMAT_LABEL[f].icon}
              disabled={exporting}
              onClick={() => onFormatChange(f)}
            >
              {REPORT_WIZARD_FORMAT_LABEL[f].label}
            </TltButton>
          ))}
        </Space>
        <Space style={{ marginTop: 12, width: '100%' }}>
          <TltButton disabled={exporting} onClick={() => onStepChange(0)}>
            ← Назад
          </TltButton>
          <TltButton variant="primary" disabled={exporting} onClick={() => onStepChange(2)}>
            Далее: предпросмотр →
          </TltButton>
        </Space>
      </TltCard>
    );
  }

  return (
    <TltCard title="Готово к экспорту">
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
          {REPORT_WIZARD_FORMAT_LABEL[format].icon} {REPORT_WIZARD_FORMAT_LABEL[format].label}
        </TltBadge>
      </div>
      <TltButton
        variant="primary"
        size="comfortable"
        icon={REPORT_WIZARD_FORMAT_LABEL[format].icon}
        loading={exporting}
        onClick={onExport}
      >
        Скачать {REPORT_WIZARD_FORMAT_LABEL[format].label}
      </TltButton>
      <TltButton
        className="report-wizard-page-back"
        disabled={exporting}
        onClick={() => onStepChange(1)}
      >
        ← Изменить формат
      </TltButton>
      <TltButton
        className="report-wizard-page-back--sm"
        disabled={exporting}
        onClick={() => onStepChange(0)}
      >
        ← Изменить разделы
      </TltButton>
    </TltCard>
  );
}
