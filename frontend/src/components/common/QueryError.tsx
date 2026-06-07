import { Alert, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
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
    <Alert
      type="error"
      showIcon
      message={title ?? 'Не удалось загрузить данные'}
      description={extractApiErrorMessage(error)}
      action={
        onRetry ? (
          <Button size="small" icon={<ReloadOutlined />} onClick={onRetry} loading={retrying}>
            Повторить
          </Button>
        ) : undefined
      }
    />
  );
}
