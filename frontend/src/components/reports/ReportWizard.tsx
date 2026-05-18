import { Button, Checkbox, Modal, Segmented, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import {
  REPORT_SECTIONS,
  REPORT_SECTION_LABELS,
  type ReportSection,
} from '@/api/reports';
import { CALCULATION_VARIANTS } from '@/store/calculationVariantStore';

const { Text } = Typography;

interface Props {
  open: boolean;
  initialSections: ReportSection[];
  initialVariant: number;
  onCancel: () => void;
  onConfirm: (sections: ReportSection[], variantNumber: number) => void;
}

/**
 * Модальный мастер выбора состава отчёта (ТЗ 4.3.4).
 * Сотрудник отмечает разделы — сводка / трубы / резервуары / электрорасчёт / спецификация.
 * Пустой набор интерпретируется как «все разделы» (так удобнее с точки зрения ТЗ).
 */
export default function ReportWizard({
  open,
  initialSections,
  initialVariant,
  onCancel,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<ReportSection[]>(initialSections);
  const [variant, setVariant] = useState(initialVariant);

  // Синхронизируем при повторном открытии
  useEffect(() => {
    if (open) {
      setSelected(initialSections);
      setVariant(initialVariant);
    }
  }, [open, initialSections, initialVariant]);

  const toggleAll = () =>
    setSelected(selected.length === REPORT_SECTIONS.length ? [] : [...REPORT_SECTIONS]);

  return (
    <Modal
      title="Мастер: состав отчёта"
      open={open}
      onCancel={onCancel}
      onOk={() => onConfirm(selected, variant)}
      okText="Применить"
      cancelText="Отмена"
      okButtonProps={{ disabled: selected.length === 0 }}
      width={480}
    >
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
        Отметьте разделы, которые попадут в предпросмотр и экспорт. Изменения применяются
        только к этому проекту в текущей сессии.
      </Text>
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Вариант расчёта:
        </Text>
        <Segmented<number>
          size="small"
          value={variant}
          onChange={(v) => setVariant(Number(v))}
          options={CALCULATION_VARIANTS.map((n) => ({ label: `СО${n}`, value: n }))}
        />
        <Button size="small" type="link" onClick={toggleAll} style={{ padding: 0 }}>
          {selected.length === REPORT_SECTIONS.length ? 'Снять все' : 'Выбрать все'}
        </Button>
        <Checkbox.Group
          value={selected}
          onChange={(v) => setSelected(v as ReportSection[])}
          style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
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
