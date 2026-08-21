import type { Meta, StoryObj } from '@storybook/react-vite';
import { TltTabs } from './UiPrimitives';

const meta = {
  title: 'UI Kit/TltTabs',
  component: TltTabs,
  args: {
    tabListLabel: 'Разделы UI-kit',
    items: [
      { id: 'geometry', label: 'Геометрия', content: <p>Контент вкладки «Геометрия».</p> },
      { id: 'insulation', label: 'Изоляция', content: <p>Контент вкладки «Изоляция».</p> },
      { id: 'climate', label: 'Климат', content: <p>Контент вкладки «Климат».</p> },
      {
        id: 'disabled',
        label: 'Недоступно',
        content: <p>Не показывается.</p>,
        disabled: true,
      },
    ],
  },
} satisfies Meta<typeof TltTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SecondTab: Story = {
  args: { defaultValue: 'insulation' },
};
