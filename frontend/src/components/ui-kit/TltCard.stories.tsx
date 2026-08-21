import type { Meta, StoryObj } from '@storybook/react-vite';
import { TltBadge, TltButton, TltCard } from './UiPrimitives';

const meta = {
  title: 'UI Kit/TltCard',
  component: TltCard,
  args: {
    title: 'Объекты',
    description: 'Карточка UI-kit без feature-логики',
    tone: 'default',
    padding: 'compact',
  },
} satisfies Meta<typeof TltCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <p style={{ margin: 0 }}>Содержимое карточки.</p>,
  },
};

export const WithActions: Story = {
  args: {
    actions: <TltBadge tone="success">Готово</TltBadge>,
    children: (
      <div style={{ display: 'flex', gap: 8 }}>
        <TltButton variant="primary">Сохранить</TltButton>
        <TltButton variant="secondary">Отмена</TltButton>
      </div>
    ),
  },
};

export const Soft: Story = {
  args: {
    tone: 'soft',
    title: 'Подсказка',
    children: <p style={{ margin: 0 }}>Мягкий фон для вторичных блоков.</p>,
  },
};
