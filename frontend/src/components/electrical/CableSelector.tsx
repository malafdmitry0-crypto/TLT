import { Select, Space, Tag, Typography, message } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  selectCableManual,
  type CableInfo,
  type CableSource,
} from '@/api/calculations';

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
    label: (
      <Space size={4}>
        <span>
          {c.model} — {c.power_per_meter} Вт/м (T: {c.min_temperature}…{c.max_temperature}°C)
        </span>
        {c.source === 'extended' && (
          <Tag color="purple" style={{ marginLeft: 4 }}>
            ext
          </Tag>
        )}
      </Space>
    ),
  }));

  return (
    <Space size={6} style={{ marginTop: 12 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        Выбрать вручную:
      </Text>
      <Select
        size="small"
        style={{ minWidth: 300 }}
        placeholder="Марка кабеля ТЛТ"
        value={currentMark ?? undefined}
        loading={mut.isPending}
        options={options}
        onChange={(v) => mut.mutate(v)}
        showSearch
        optionFilterProp="label"
      />
    </Space>
  );
}
