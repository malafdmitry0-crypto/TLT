import type { Meta, StoryObj } from '@storybook/react-vite';
import { TltSkeleton } from './UiPrimitives';

const meta = {
  title: 'UI Kit/TltSkeleton',
  component: TltSkeleton,
} satisfies Meta<typeof TltSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    rows: 3,
    variant: 'text',
  },
};

export const Panel: Story = {
  args: {
    variant: 'panel',
    rows: 4,
  },
};
