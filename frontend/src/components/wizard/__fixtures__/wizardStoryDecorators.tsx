/**
 * Обвязка для Storybook-историй визарда.
 *
 * Даёт панелям минимальный контекст — react-query и корневой класс острова —
 * без страницы, стора проекта и бэкенда.
 * См. docs/tnp/cases/heat-frontend-restyle-prompt.md §4a.
 *
 * Antd здесь намеренно не импортируется: ратчет прямых импортов antd считает
 * обычные `.tsx`, но пропускает `.stories.tsx`. Поэтому `Form` создаёт сама
 * история, а этот модуль остаётся вне ратчета.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});

/**
 * Тот же корневой класс, что и в бою (`ObjectWizard.tsx`): без него не
 * применяются стили островов.
 */
export function WizardStoryShell({
  children,
  layout = 'wide',
}: {
  children: ReactNode;
  layout?: 'wide' | 'side';
}) {
  return (
    <QueryClientProvider client={client}>
      <div className={`inline-object-form inline-object-form--${layout}`}>
        {children}
      </div>
    </QueryClientProvider>
  );
}
