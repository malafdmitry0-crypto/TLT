/**
 * Root Ant Design App shell: binds context-aware message/modal/notification.
 * Place inside ConfigProvider so feedback APIs hold theme context.
 */
import { useEffect, type ReactNode } from 'react';
import { App } from 'antd';
import {
  bindAppMessage,
  bindAppModal,
  bindAppNotification,
  unbindAppFeedback,
} from './appFeedbackApi';

function AppFeedbackBinder() {
  const { message, modal, notification } = App.useApp();
  useEffect(() => {
    bindAppMessage(message);
    bindAppModal(modal);
    bindAppNotification(notification);
    return () => {
      unbindAppFeedback();
    };
  }, [message, modal, notification]);
  return null;
}

/**
 * Root shell: place inside ConfigProvider so message/modal hold theme context.
 * `component={false}` avoids an extra DOM wrapper that could affect layout.
 */
export function AntdAppShell({ children }: { children: ReactNode }) {
  return (
    <App component={false}>
      <AppFeedbackBinder />
      {children}
    </App>
  );
}
