import type { Meta, StoryObj } from '@storybook/react-vite';
import { TltButton } from './UiPrimitives';

const meta = {
  title: 'UI Kit/TltButton',
  component: TltButton,
  args: {
    children: 'Сохранить',
    variant: 'primary',
    size: 'compact',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger', 'link'],
    },
    size: {
      control: 'select',
      options: ['compact', 'comfortable', 'icon'],
    },
  },
} satisfies Meta<typeof TltButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Отмена' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: 'Удалить' },
};

export const Loading: Story = {
  args: { loading: true, children: 'Сохранение…' },
};

export const Disabled: Story = {
  args: { disabled: true, children: 'Недоступно' },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <TltButton variant="primary">Primary</TltButton>
      <TltButton variant="secondary">Secondary</TltButton>
      <TltButton variant="ghost">Ghost</TltButton>
      <TltButton variant="danger">Danger</TltButton>
      <TltButton variant="link">Link</TltButton>
      <TltButton size="comfortable" variant="primary">
        Comfortable
      </TltButton>
      <TltButton loading variant="primary">
        Loading
      </TltButton>
      <TltButton disabled variant="secondary">
        Disabled
      </TltButton>
    </div>
  ),
};
