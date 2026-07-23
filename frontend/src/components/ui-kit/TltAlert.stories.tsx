import type { Meta, StoryObj } from '@storybook/react-vite';
import { TltAlert, TltButton } from './UiPrimitives';

const meta = {
  title: 'UI Kit/TltAlert',
  component: TltAlert,
  args: {
    tone: 'info',
    title: 'Информация',
    children: 'Сообщение для пользователя без backend.',
  },
} satisfies Meta<typeof TltAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};

export const Success: Story = {
  args: { tone: 'success', title: 'Успех', children: 'Операция выполнена.' },
};

export const Warning: Story = {
  args: { tone: 'warning', title: 'Внимание', children: 'Проверьте входные данные.' },
};

export const Danger: Story = {
  args: { tone: 'danger', title: 'Ошибка', children: 'Не удалось сохранить.' },
};

export const Dismissible: Story = {
  args: {
    tone: 'info',
    title: 'Можно закрыть',
    onDismiss: () => undefined,
    action: <TltButton variant="link">Подробнее</TltButton>,
  },
};
