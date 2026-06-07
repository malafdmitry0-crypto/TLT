import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Result, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { recordClientAuditEvent } from '@/utils/clientAudit';

const { Paragraph, Text } = Typography;

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Когда значение меняется, граница сбрасывает ошибку и пытается отрендерить
   * children заново. Обычно сюда передаётся `location.pathname`, чтобы переход
   * по навигации автоматически уводил пользователя с экрана ошибки.
   */
  resetKey?: string | number;
  /** Заголовок fallback-экрана. */
  title?: string;
  /** Подпись для телеметрии — где именно сработала граница. */
  boundaryName?: string;
  /**
   * Кастомный fallback. Получает текущую ошибку и функцию сброса границы.
   * Если не задан — показывается стандартный AntD `Result`.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * React ErrorBoundary — единственный способ перехватить исключение в рендере
 * и не уронить всё дерево в белый экран. Реализован классом, потому что
 * `getDerivedStateFromError` / `componentDidCatch` недоступны в функциональных
 * компонентах (это санкционированное исключение из правила «только FC»).
 *
 * Ошибка логируется в ту же клиентскую телеметрию (`clientAudit`), что и
 * `window.error`, но в отличие от неё пользователю показывается восстановимый
 * UI с кнопками «Попробовать снова» и «Перезагрузить», а введённые на других
 * экранах данные не теряются (граница локализует сбой поддеревом).
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Смена resetKey (например, переход на другой маршрут) снимает экран ошибки.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    recordClientAuditEvent(
      'frontend.render.error_boundary',
      {
        boundary: this.props.boundaryName ?? 'root',
        error: { name: error.name, message: error.message, stack: error.stack?.slice(0, 2000) },
        componentStack: info.componentStack?.slice(0, 2000),
      },
      {
        severity: 'critical',
        result: 'failure',
        error_code: 'render_error',
        message: error.message,
      },
    );
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <Result
        status="error"
        title={this.props.title ?? 'Что-то пошло не так'}
        subTitle="Произошла непредвиденная ошибка при отображении этого раздела. Введённые на других экранах данные не потеряны."
        extra={[
          <Button type="primary" key="retry" icon={<ReloadOutlined />} onClick={this.reset}>
            Попробовать снова
          </Button>,
          <Button key="reload" onClick={() => window.location.reload()}>
            Перезагрузить страницу
          </Button>,
        ]}
      >
        {import.meta.env.DEV && (
          <Paragraph>
            <Text type="danger" code>
              {error.name}: {error.message}
            </Text>
          </Paragraph>
        )}
      </Result>
    );
  }
}

/**
 * ErrorBoundary, привязанный к текущему маршруту: ошибка на странице не уносит
 * каркас приложения (шапка, навигация, меню проекта остаются), а переход на
 * другой маршрут автоматически снимает экран ошибки через смену `resetKey`.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }): ReactNode {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname} boundaryName="route">
      {children}
    </ErrorBoundary>
  );
}
