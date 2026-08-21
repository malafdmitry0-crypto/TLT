import { Space, Typography } from 'antd';
import { appMessage as message } from '@/feedback/appFeedback';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  selectCableManual,
  type CableInfo,
  type CableSource,
} from '@/api/calculations';
import { TltSelect } from '@/components/ui-kit';
import './cable-selector.css';

const { Text } = Typography;

interface CableSelectorProps {
  objectId: string;
  currentMark: string | null;
  cables: CableInfo[];
  cableSource?: CableSource;
}

/**
 * Дропдаун «Выбрать кабель вручную» — показывается под карточкой объекта
 * в электрорасчёте. При смене марки пересчитывает объект на бэкенде.
 */
export default function CableSelector({
  objectId,
  currentMark,
  cables,
  cableSource = 'builtin',
}: CableSelectorProps) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (mark: string) => selectCableManual(objectId, mark, cableSource),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project'] });
      message.success('Кабель выбран, расчёт обновлён');
    },
    onError: (e: unknown) => {
      const err = e as {
        response?: { data?: { detail?: string } };
        message?: string;
      };
      message.error(
        err.response?.data?.detail ?? err.message ?? 'Не удалось выбрать кабель',
      );
    },
  });

  const options = cables.map((c) => ({
    value: c.model,
    label: `${c.model} — ${c.power_per_meter} Вт/м (T: ${c.min_temperature}…${c.max_temperature}°C)${c.source === 'extended' ? ' [ext]' : ''}`,
  }));

  return (
    <Space size={6} className="cable-selector-actions">
      <Text type="secondary" className="cable-selector-hint">
        Выбрать вручную:
      </Text>
      <TltSelect className="tlt-field--min-w300"
        placeholder="Марка кабеля ТЛТ"
        value={currentMark ?? undefined}
        disabled={mut.isPending}
        options={options}
        onChange={(v) => {
          if (v != null) mut.mutate(String(v));
        }}
        aria-label="Марка кабеля ТЛТ"
      />
    </Space>
  );
}
