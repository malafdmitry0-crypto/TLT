import { Table, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listCoefficients, updateCoefficient } from '@/api/admin';
import type { Coefficient } from '@/types/admin';
import { TltCard, TltNumberField } from '@/components/ui-kit';

const { Paragraph } = Typography;

export default function CoefficientsPage() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ['coefficients'],
    queryFn: listCoefficients,
  });

  const mut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: number }) =>
      updateCoefficient(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coefficients'] });
      message.success('Сохранено');
    },
  });

  return (
    <TltCard title="Корректирующие коэффициенты">
      <Paragraph>
        Значения используются при расчёте теплопотерь и электротехническом расчёте.
      </Paragraph>
      <Table<Coefficient>
        rowKey="key"
        dataSource={rows}
        columns={[
          { title: 'Ключ', dataIndex: 'key' },
          { title: 'Описание', dataIndex: 'description' },
          {
            title: 'Значение',
            dataIndex: 'value',
            render: (v: number, row: Coefficient) => (
              <TltNumberField
                defaultValue={v}
                step={0.01}
                onBlur={(e) => {
                  const nv = Number(e.target.value);
                  if (nv !== v) mut.mutate({ key: row.key, value: nv });
                }}
              />
            ),
          },
        ]}
      />
    </TltCard>
  );
}
