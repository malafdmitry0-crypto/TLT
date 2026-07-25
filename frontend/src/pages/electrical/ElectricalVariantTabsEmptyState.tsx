/**
 * Empty / readiness / loading chrome for ElectricalVariantTabs.
 */
import {
  Space,
  Spin,
  Typography,
} from 'antd';
import { extractApiErrorMessage } from '@/api/client';
import { TltAlert, TltButton, TltCard } from '@/components/ui-kit';
import type {
  ElectricalVariantPendingOperation,
  ElectricalVariantSelectionController,
} from './useElectricalVariantSelection';
import { ignoreHandledError } from './electricalVariantAsyncHelpers';

const PENDING_OPERATION_LABELS: Record<
  Exclude<ElectricalVariantPendingOperation, null>,
  string
> = {
  initialize: 'Создаём первый ЭР…',
  create: 'Создаём пустой ЭР…',
  copy: 'Копируем выбранный ЭР…',
  rename: 'Сохраняем новое название ЭР…',
  activate: 'Переключаем текущий ЭР…',
  delete: 'Удаляем выбранный ЭР…',
  reconcile: 'Сверяем список ЭР с сервером…',
};

export function LoadingCard({ text }: { text: string }) {
  return (
    <TltCard padding="compact" className="electrical-variant-tabs electrical-variant-tabs--loading">
      <Space role="status" aria-live="polite"><Spin size="small" /><Typography.Text>{text}</Typography.Text></Space>
    </TltCard>
  );
}

export function MutationStatus({ operation }: { operation: ElectricalVariantPendingOperation }) {
  if (!operation) return null;
  return (
    <Space role="status" aria-live="polite" size={6}>
      <Spin size="small" /><Typography.Text>{PENDING_OPERATION_LABELS[operation]}</Typography.Text>
    </Space>
  );
}

export interface ElectricalVariantTabsEmptyProps {
  controller: ElectricalVariantSelectionController;
  canMutate?: boolean;
}

export function EmptyElectricalVariantState({
  controller,
  canMutate = true,
}: ElectricalVariantTabsEmptyProps) {
  if (controller.isReadinessLoading && !controller.readiness) {
    return <LoadingCard text="Проверяем готовность к созданию ЭР…" />;
  }

  if (controller.readinessError) {
    return (
      <TltAlert
        tone="danger"
        title="Не удалось проверить готовность к созданию ЭР"
        action={(
          <TltButton
            size="compact"
            loading={controller.isReadinessFetching}
            onClick={() => ignoreHandledError(controller.retryReadiness())}
            aria-label="Повторить проверку готовности ЭР"
          >
            Повторить
          </TltButton>
        )}
      >
        {extractApiErrorMessage(controller.readinessError)}
      </TltAlert>
    );
  }

  const readiness = controller.readiness;
  if (!readiness) {
    return <LoadingCard text="Проверяем готовность к созданию ЭР…" />;
  }

  const readinessDescription = (
    <Space direction="vertical" size={4} style={{ width: '100%' }}>
      <Typography.Text>
        Готово объектов: {readiness.ready_objects} из {readiness.total_objects}.
      </Typography.Text>
      {readiness.issues.length > 0 && (
        <ul className="electrical-variant-list">
          {readiness.issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.object_id ?? 'project'}-${index}`}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </Space>
  );

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <MutationStatus operation={controller.pendingOperation} />
      {!canMutate && (
        <TltAlert tone="info" title="Режим просмотра">
          Создать первый ЭР может только владелец проекта или администратор.
        </TltAlert>
      )}
      {controller.mutationError != null && (
        <TltAlert
          tone="danger"
          title="Не удалось создать ЭР"
          onDismiss={controller.clearMutationError}
        >
          {extractApiErrorMessage(controller.mutationError)}
        </TltAlert>
      )}
      {controller.mutationNotice && (
        <TltAlert
          tone="success"
          title="Результат операции подтверждён"
          onDismiss={controller.clearMutationError}
        >
          {controller.mutationNotice}
        </TltAlert>
      )}
      <TltAlert
        tone={readiness.ready ? 'info' : 'warning'}
        title={
          readiness.ready
            ? 'Можно создать первый электротехнический расчёт'
            : 'ЭР пока нельзя создать'
        }
        action={(
          <TltButton
            variant="primary"
            disabled={
              !readiness.ready
              || !canMutate
              || controller.isMutating
              || controller.isReadinessFetching
            }
            loading={controller.isMutating || controller.isReadinessFetching}
            onClick={() => ignoreHandledError(controller.initializeVariant())}
            aria-label={
              readiness.ready
                ? 'Создать ЭР1'
                : 'Создать ЭР1 — сначала завершите теплорасчёт'
            }
          >
            Создать ЭР1
          </TltButton>
        )}
      >
        {readinessDescription}
      </TltAlert>
    </Space>
  );
}
