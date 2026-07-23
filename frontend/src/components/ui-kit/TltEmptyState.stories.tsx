import type { Meta, StoryObj } from '@storybook/react-vite';
import { TltButton, TltEmptyState } from './UiPrimitives';

const meta = {
  title: 'UI Kit/TltEmptyState',
  component: TltEmptyState,
  args: {
    title: 'Нет объектов',
    description: 'Добавьте трубопровод или ёмкость, чтобы начать расчёт.',
  },
} satisfies Meta<typeof TltEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAction: Story = {
  args: {
    action: <TltButton variant="primary">Добавить объект</TltButton>,
  },
};
