import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusChip } from './CompactUi';

const meta = {
  title: 'UI Kit/StatusChip',
  component: StatusChip,
  args: {
    children: 'Статус',
    tone: 'neutral',
  },
} satisfies Meta<typeof StatusChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tones: Story = {
  render: () => (
    <>
      <StatusChip tone="neutral">Neutral</StatusChip>
      <StatusChip tone="info">Информация</StatusChip>
      <StatusChip tone="success">Готово</StatusChip>
      <StatusChip tone="warning">Черновик</StatusChip>
      <StatusChip tone="danger">Ошибка</StatusChip>
    </>
  ),
};
