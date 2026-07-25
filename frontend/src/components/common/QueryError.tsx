import { ReloadOutlined } from '@ant-design/icons';
import { TltAlert, TltButton } from '@/components/ui-kit';
import { extractApiErrorMessage } from '@/api/client';

interface QueryErrorProps {
  /** Ошибка из useQuery (`error`). */
  error: unknown;
  /** Повторная загрузка (`refetch`). */
  onRetry?: () => void;
  /** Заголовок над сообщением. */
  title?: string;
  /** Загрузка повтора — блокирует кнопку (`isFetching`). */
  retrying?: boolean;
}

/**
 * Единый UI для провалившегося GET-запроса (`useQuery`).
 *
 * ErrorBoundary НЕ ловит ошибки запросов (отклонённый промис в TanStack Query
 * не бросает исключение в рендере), поэтому без явной ветки пользователь видел
 * бы пустую область. Этот компонент показывает причину и кнопку «Повторить».
 */
export default function QueryError({ error, onRetry, title, retrying }: QueryErrorProps) {
  return (
    <TltAlert
      tone="danger"
      title={title ?? 'Не удалось загрузить данные'}
      action={
        onRetry ? (
          <TltButton
            size="compact"
            icon={<ReloadOutlined />}
            onClick={onRetry}
            loading={retrying}
            aria-label="Повторить"
          >
            Повторить
          </TltButton>
        ) : undefined
      }
    >
      {extractApiErrorMessage(error)}
    </TltAlert>
  );
}
