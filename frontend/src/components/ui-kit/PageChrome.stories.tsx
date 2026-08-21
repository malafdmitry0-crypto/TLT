import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  TltAlert,
  TltBadge,
  TltButton,
  TltCard,
  TltEmptyState,
  TltSkeleton,
} from './UiPrimitives';

/**
 * Composition shells — layout chrome only (no feature/domain imports).
 * Agents use these as patterns for empty / loading / error page regions.
 */
const meta = {
  title: 'UI Kit/Composition/PageChrome',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Feature-agnostic page chrome compositions. Build product screens from TltCard + Empty/Skeleton/Alert — not one-off markup.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Shell({
  title,
  badge,
  actions,
  children,
}: {
  title: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <TltCard
      title={(
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          {title}
          {badge}
        </span>
      )}
      actions={actions}
    >
      {children}
    </TltCard>
  );
}

export const EmptyWorkspace: Story = {
  name: 'Empty workspace',
  render: () => (
    <Shell
      title="Объекты"
      badge={<TltBadge tone="neutral">0</TltBadge>}
      actions={<TltButton variant="primary">Добавить</TltButton>}
    >
      <TltEmptyState
        title="Нет объектов"
        description="Создайте первый объект или импортируйте Excel."
        action={<TltButton variant="secondary">Импорт Excel</TltButton>}
      />
    </Shell>
  ),
};

export const LoadingWorkspace: Story = {
  name: 'Loading workspace',
  render: () => (
    <Shell title="Объекты" badge={<TltBadge tone="info">…</TltBadge>}>
      <TltSkeleton rows={6} />
    </Shell>
  ),
};

export const ErrorWorkspace: Story = {
  name: 'Error workspace',
  render: () => (
    <Shell
      title="Объекты"
      actions={<TltButton variant="secondary">Обновить</TltButton>}
    >
      <TltAlert tone="danger" title="Не удалось загрузить данные">
        Проверьте сеть и повторите попытку. Если ошибка повторяется — откройте консоль и support.
      </TltAlert>
      <div style={{ marginTop: 12 }}>
        <TltEmptyState
          title="Данные недоступны"
          description="Рабочая область ждёт успешного ответа API."
          action={<TltButton variant="primary">Повторить</TltButton>}
        />
      </div>
    </Shell>
  ),
};
