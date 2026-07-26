/**
 * Ant Design App-bound feedback APIs (non-component exports).
 *
 * Static `message` / `Modal.confirm` from `antd` cannot consume ConfigProvider
 * theme context and emit console warnings. Prefer these helpers after the root
 * {@link AntdAppShell} mounts (see App.tsx).
 *
 * Import path: `@/feedback/appFeedback` (stable re-export).
 */
import { message as staticMessage, Modal as StaticModal } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import type { HookAPI as ModalHookAPI } from 'antd/es/modal/useModal';
import type { NotificationInstance } from 'antd/es/notification/interface';

type MessageApi = Pick<
  MessageInstance,
  'success' | 'error' | 'info' | 'warning' | 'loading' | 'open' | 'destroy'
>;

type ModalApi = Pick<ModalHookAPI, 'confirm' | 'info' | 'success' | 'error' | 'warning'>;

let messageApi: MessageApi | null = null;
let modalApi: ModalApi | null = null;
let notificationApi: NotificationInstance | null = null;

export function bindAppMessage(api: MessageInstance) {
  messageApi = api;
}

export function bindAppModal(api: ModalHookAPI) {
  modalApi = api;
}

export function bindAppNotification(api: NotificationInstance) {
  notificationApi = api;
}

export function unbindAppFeedback() {
  messageApi = null;
  modalApi = null;
  notificationApi = null;
}

/** Context-aware message API (falls back to static only before App mounts / in unit tests). */
export const appMessage: MessageApi = {
  success: (...args) => (messageApi ?? staticMessage).success(...args),
  error: (...args) => (messageApi ?? staticMessage).error(...args),
  info: (...args) => (messageApi ?? staticMessage).info(...args),
  warning: (...args) => (messageApi ?? staticMessage).warning(...args),
  loading: (...args) => (messageApi ?? staticMessage).loading(...args),
  open: (...args) => (messageApi ?? staticMessage).open(...args),
  destroy: (...args) => (messageApi ?? staticMessage).destroy(...args),
};

/** Context-aware modal static helpers (`confirm` / `info` / …). */
export const appModal = {
  confirm: (...args: Parameters<typeof StaticModal.confirm>) =>
    (modalApi?.confirm ?? StaticModal.confirm)(...args),
  info: (...args: Parameters<typeof StaticModal.info>) =>
    (modalApi?.info ?? StaticModal.info)(...args),
  success: (...args: Parameters<typeof StaticModal.success>) =>
    (modalApi?.success ?? StaticModal.success)(...args),
  error: (...args: Parameters<typeof StaticModal.error>) =>
    (modalApi?.error ?? StaticModal.error)(...args),
  warning: (...args: Parameters<typeof StaticModal.warning>) =>
    (modalApi?.warning ?? StaticModal.warning)(...args),
};

/** Context-aware notification (optional; static path still warns if used pre-bind). */
export const appNotification = {
  success: (...args: Parameters<NotificationInstance['success']>) => {
    if (!notificationApi) {
      throw new Error('appNotification used before AntdAppShell mounted');
    }
    return notificationApi.success(...args);
  },
  error: (...args: Parameters<NotificationInstance['error']>) => {
    if (!notificationApi) throw new Error('appNotification used before AntdAppShell mounted');
    return notificationApi.error(...args);
  },
  info: (...args: Parameters<NotificationInstance['info']>) => {
    if (!notificationApi) throw new Error('appNotification used before AntdAppShell mounted');
    return notificationApi.info(...args);
  },
  warning: (...args: Parameters<NotificationInstance['warning']>) => {
    if (!notificationApi) throw new Error('appNotification used before AntdAppShell mounted');
    return notificationApi.warning(...args);
  },
};
