import type { Meta, StoryObj } from '@storybook/react-vite';
import { TltTable } from './UiPrimitives';

type Row = { id: string; name: string; status: string };

const rows: Row[] = [
  { id: '1', name: 'Труба DN100', status: 'Готово' },
  { id: '2', name: 'Ёмкость V1', status: 'Черновик' },
  { id: '3', name: 'Труба DN50', status: 'Ошибка' },
];

const meta = {
  title: 'UI Kit/TltTable',
  component: TltTable,
  args: {
    'aria-label': 'Пример таблицы объектов',
    rowKey: 'id' as const,
    columns: [
      { key: 'name', header: 'Наименование' },
      { key: 'status', header: 'Статус', width: 120 },
    ],
    rows,
  },
} satisfies Meta<typeof TltTable<Row>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    rows: [],
    emptyState: 'Нет данных для отображения',
  },
};

export const Selectable: Story = {
  args: {
    selectedRowKey: '2',
    onRowSelect: () => undefined,
  },
};
