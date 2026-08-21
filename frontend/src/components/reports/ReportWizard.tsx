import { Checkbox, Modal, Segmented, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import {
  REPORT_SECTIONS,
  REPORT_SECTION_LABELS,
  type ReportSection,
} from '@/api/reports';
import { TltButton } from '@/components/ui-kit';
import './report-wizard.css';

const { Text } = Typography;

type ElectricalVariantOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

interface Props {
  open: boolean;
  initialSections: ReportSection[];
  initialVariantId: string;
  variantOptions: ElectricalVariantOption[];
  onCancel: () => void;
  onConfirm: (sections: ReportSection[], electricalVariantId: string) => void;
}

/**
 * Модальный мастер выбора состава отчёта (ТЗ 4.3.4).
 * Сотрудник отмечает разделы — сводка / трубы / резервуары / электрорасчёт / спецификация.
 * Пустой набор интерпретируется как «все разделы» (так удобнее с точки зрения ТЗ).
 */
export default function ReportWizard({
  open,
  initialSections,
  initialVariantId,
  variantOptions,
  onCancel,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<ReportSection[]>(initialSections);
  const [variantId, setVariantId] = useState(initialVariantId);

  // Синхронизируем при повторном открытии
  useEffect(() => {
    if (open) {
      setSelected(initialSections);
      setVariantId(initialVariantId);
    }
  }, [open, initialSections, initialVariantId]);

  const toggleAll = () =>
    setSelected(selected.length === REPORT_SECTIONS.length ? [] : [...REPORT_SECTIONS]);

  return (
    <Modal
      title="Мастер: состав отчёта"
      open={open}
      onCancel={onCancel}
      onOk={() => onConfirm(selected, variantId)}
      okText="Применить"
      cancelText="Отмена"
      okButtonProps={{ disabled: selected.length === 0 }}
      width={480}
    >
      <Text type="secondary" className="report-wizard-intro">
        Отметьте разделы, которые попадут в предпросмотр и экспорт. Изменения применяются
        только к этому проекту в текущей сессии.
      </Text>
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Text type="secondary" className="report-wizard-label">
          Вариант расчёта:
        </Text>
        <Segmented<string>
          size="small"
          value={variantId}
          onChange={setVariantId}
          options={variantOptions}
        />
        <TltButton variant="link" size="compact" onClick={toggleAll} className="report-wizard-select-all">
          {selected.length === REPORT_SECTIONS.length ? 'Снять все' : 'Выбрать все'}
        </TltButton>
        <Checkbox.Group
          value={selected}
          onChange={(v) => setSelected(v as ReportSection[])}
          className="report-wizard-sections"
        >
          {REPORT_SECTIONS.map((s) => (
            <Checkbox key={s} value={s}>
              {REPORT_SECTION_LABELS[s]}
            </Checkbox>
          ))}
        </Checkbox.Group>
      </Space>
    </Modal>
  );
}
