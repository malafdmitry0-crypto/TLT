import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompactMetric } from './CompactUi';

const meta = {
  title: 'UI Kit/CompactMetric',
  component: CompactMetric,
  args: {
    label: 'Теплопотери',
    value: '12,4',
    unit: 'кВт',
  },
} satisfies Meta<typeof CompactMetric>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Accent: Story = {
  args: {
    accent: true,
  },
};
