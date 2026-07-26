import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompactSection, StatusChip } from './CompactUi';

const meta = {
  title: 'UI Kit/CompactSection',
  component: CompactSection,
  args: {
    id: 'calculation-summary',
    index: '01',
    title: 'Результаты расчёта',
    description: 'Компактная секция для связанных показателей.',
    children: <StatusChip tone="success">Рассчитано</StatusChip>,
  },
} satisfies Meta<typeof CompactSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
