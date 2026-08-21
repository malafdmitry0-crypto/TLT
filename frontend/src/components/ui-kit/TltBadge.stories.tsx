import type { Meta, StoryObj } from '@storybook/react-vite';
import { TltBadge } from './UiPrimitives';

const meta = {
  title: 'UI Kit/TltBadge',
  component: TltBadge,
  args: {
    children: 'Статус',
    tone: 'neutral',
  },
} satisfies Meta<typeof TltBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tones: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <TltBadge tone="neutral">Neutral</TltBadge>
      <TltBadge tone="info">Info</TltBadge>
      <TltBadge tone="success">Готово</TltBadge>
      <TltBadge tone="warning">Черновик</TltBadge>
      <TltBadge tone="danger">Ошибка</TltBadge>
      <TltBadge tone="success" size="regular">
        Regular
      </TltBadge>
      <TltBadge tone="info" dot={false}>
        No dot
      </TltBadge>
    </div>
  ),
};
