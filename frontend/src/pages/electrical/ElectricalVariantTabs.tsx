import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { InputRef } from 'antd';
import {
  Alert,
  Button,
  Card,
  Flex,
  Input,
  Popconfirm,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import { extractApiErrorMessage } from '@/api/client';
import type {
  ElectricalVariantPendingOperation,
  ElectricalVariantSelectionController,
} from './useElectricalVariantSelection';

const MAX_ELECTRICAL_VARIANTS = 5;

export function electricalVariantTabId(variantId: string): string {
  return `electrical-variant-tab-${variantId}`;
}

export function electricalVariantPanelId(variantId: string): string {
  return `electrical-variant-panel-${variantId}`;
}

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

export interface ElectricalVariantTabsProps {
  controller: ElectricalVariantSelectionController;
  canMutate?: boolean;
}

function ignoreHandledError(operation: Promise<unknown>): void {
  void operation.catch(() => undefined);
}

function LoadingCard({ text }: { text: string }) {
  return (
    <Card size="small" className="electrical-variant-tabs electrical-variant-tabs--loading">
      <Space role="status" aria-live="polite">
        <Spin size="small" />
        <Typography.Text>{text}</Typography.Text>
      </Space>
    </Card>
  );
}

function MutationStatus({
  operation,
}: {
  operation: ElectricalVariantPendingOperation;
}) {
  if (!operation) return null;
  return (
    <Space role="status" aria-live="polite" size={6}>
      <Spin size="small" />
      <Typography.Text>{PENDING_OPERATION_LABELS[operation]}</Typography.Text>
    </Space>
  );
}

function EmptyElectricalVariantState({
  controller,
  canMutate = true,
}: ElectricalVariantTabsProps) {
  if (controller.isReadinessLoading && !controller.readiness) {
    return <LoadingCard text="Проверяем готовность к созданию ЭР…" />;
  }

  if (controller.readinessError) {
    return (
      <Alert
        type="error"
        showIcon
        message="Не удалось проверить готовность к созданию ЭР"
        description={extractApiErrorMessage(controller.readinessError)}
        action={(
          <Button
            size="small"
            loading={controller.isReadinessFetching}
            onClick={() => ignoreHandledError(controller.retryReadiness())}
            aria-label="Повторить проверку готовности ЭР"
          >
            Повторить
          </Button>
        )}
      />
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
        <ul style={{ margin: 0, paddingInlineStart: 20 }}>
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
        <Alert
          type="info"
          showIcon
          message="Режим просмотра"
          description="Создать первый ЭР может только владелец проекта или администратор."
        />
      )}
      {controller.mutationError != null && (
        <Alert
          type="error"
          showIcon
          closable
          onClose={controller.clearMutationError}
          message="Не удалось создать ЭР"
          description={extractApiErrorMessage(controller.mutationError)}
        />
      )}
      {controller.mutationNotice && (
        <Alert
          type="success"
          showIcon
          closable
          onClose={controller.clearMutationError}
          message="Результат операции подтверждён"
          description={controller.mutationNotice}
        />
      )}
      <Alert
        type={readiness.ready ? 'info' : 'warning'}
        showIcon
        message={
          readiness.ready
            ? 'Можно создать первый электротехнический расчёт'
            : 'ЭР пока нельзя создать'
        }
        description={readinessDescription}
        action={(
          <Button
            type="primary"
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
          </Button>
        )}
      />
    </Space>
  );
}

export default function ElectricalVariantTabs({
  controller,
  canMutate = true,
}: ElectricalVariantTabsProps) {
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameValidationError, setRenameValidationError] = useState<string | null>(null);
  const renameInputRef = useRef<InputRef>(null);
  const tablistRef = useRef<HTMLDivElement>(null);
  const focusVariantAfterEditRef = useRef<string | null>(null);
  const renameSubmissionRef = useRef(false);
  const cancelRenameRef = useRef(false);

  useEffect(() => {
    if (!editingVariantId) return;
    if (!controller.variants.some((variant) => variant.id === editingVariantId)) {
      setEditingVariantId(null);
      setRenameValidationError(null);
    }
  }, [controller.variants, editingVariantId]);

  useEffect(() => {
    if (editingVariantId) {
      renameInputRef.current?.focus({ cursor: 'all' });
    }
  }, [editingVariantId]);

  useEffect(() => {
    if (editingVariantId !== null || !focusVariantAfterEditRef.current) return;
    const variantId = focusVariantAfterEditRef.current;
    focusVariantAfterEditRef.current = null;
    tablistRef.current
      ?.querySelector<HTMLButtonElement>(`[data-electrical-variant-id="${variantId}"]`)
      ?.focus();
  }, [editingVariantId]);

  useEffect(() => {
    if (!controller.selectedVariantId) return;
    tablistRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-electrical-variant-id="${controller.selectedVariantId}"]`,
      )
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [controller.selectedVariantId, controller.variants.length]);

  if (controller.isLoading) {
    return <LoadingCard text="Загружаем список ЭР…" />;
  }

  if (controller.isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="Не удалось загрузить электротехнические решения"
        description={extractApiErrorMessage(controller.listError)}
        action={(
          <Button
            size="small"
            loading={controller.isFetching}
            onClick={() => ignoreHandledError(controller.retryList())}
            aria-label="Повторить загрузку ЭР"
          >
            Повторить
          </Button>
        )}
      />
    );
  }

  if (controller.isEmpty) {
    return (
      <EmptyElectricalVariantState
        controller={controller}
        canMutate={canMutate}
      />
    );
  }

  const selected = controller.selectedVariant;
  if (!selected) {
    return (
      <Alert
        type="error"
        showIcon
        message="Не удалось выбрать ЭР"
        description="Обновите список электротехнических решений."
        action={(
          <Button
            size="small"
            loading={controller.isFetching}
            onClick={() => ignoreHandledError(controller.retryList())}
          >
            Обновить
          </Button>
        )}
      />
    );
  }

  const reachedLimit = controller.variants.length >= MAX_ELECTRICAL_VARIANTS;
  const isLastVariant = controller.variants.length === 1;
  const lifecycleWriteLocked = controller.isMutating || editingVariantId !== null;

  const startRename = () => {
    controller.clearMutationError();
    setRenameValidationError(null);
    setRenameValue(selected.name);
    setEditingVariantId(selected.id);
  };

  const cancelRename = () => {
    cancelRenameRef.current = true;
    focusVariantAfterEditRef.current = editingVariantId;
    setEditingVariantId(null);
    setRenameValidationError(null);
    queueMicrotask(() => {
      cancelRenameRef.current = false;
    });
  };

  const commitRename = async (restoreTabFocus: boolean) => {
    if (!editingVariantId || renameSubmissionRef.current) return;
    const target = controller.variants.find((variant) => variant.id === editingVariantId);
    if (!target) {
      setEditingVariantId(null);
      return;
    }

    const trimmedName = renameValue.trim();
    if (!trimmedName) {
      setRenameValidationError('Название ЭР не может быть пустым');
      return;
    }
    if (trimmedName === target.name) {
      if (restoreTabFocus) focusVariantAfterEditRef.current = target.id;
      setEditingVariantId(null);
      setRenameValidationError(null);
      return;
    }

    renameSubmissionRef.current = true;
    controller.clearMutationError();
    setRenameValidationError(null);
    try {
      await controller.renameVariant(target.id, trimmedName);
      if (restoreTabFocus) focusVariantAfterEditRef.current = target.id;
      setEditingVariantId(null);
    } catch (error) {
      setRenameValidationError(extractApiErrorMessage(error));
    } finally {
      renameSubmissionRef.current = false;
    }
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitRename(true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelRename();
    }
  };

  const handleTabKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLElement>,
  ) => {
    let targetIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      targetIndex = (index + 1) % controller.variants.length;
    } else if (event.key === 'ArrowLeft') {
      targetIndex = (index - 1 + controller.variants.length) % controller.variants.length;
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = controller.variants.length - 1;
    }
    if (targetIndex === null) return;

    event.preventDefault();
    const targetVariant = controller.variants[targetIndex];
    // Current tab = working ER (selected + is_active when allowed).
    if (canMutate) {
      ignoreHandledError(controller.selectAndActivateVariant(targetVariant.id));
    } else {
      controller.selectVariant(targetVariant.id);
    }
    const tablist = event.currentTarget.closest('[role="tablist"]');
    const tabs = tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[targetIndex]?.focus();
  };

  return (
    <Card
      size="small"
      className="electrical-variant-tabs"
      title="Электротехнические решения"
      aria-busy={controller.isFetching || controller.isMutating}
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <MutationStatus operation={controller.pendingOperation} />
        {!canMutate && (
          <Alert
            type="info"
            showIcon
            message="Режим просмотра"
            description="Изменять ЭР может только владелец проекта или администратор."
          />
        )}
        {controller.mutationError != null && !editingVariantId && (
          <Alert
            type="error"
            showIcon
            closable
            onClose={controller.clearMutationError}
            message="Не удалось подтвердить результат операции с ЭР"
            description={extractApiErrorMessage(controller.mutationError)}
          />
        )}
        {controller.mutationNotice && !editingVariantId && (
          <Alert
            type="success"
            showIcon
            closable
            onClose={controller.clearMutationError}
            message="Результат операции подтверждён"
            description={controller.mutationNotice}
          />
        )}

        <div
          ref={tablistRef}
          className="electrical-variant-tabs__scroller"
          role="tablist"
          aria-label="Электротехнические решения"
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: 8,
            maxWidth: '100%',
            overflowX: 'auto',
            overflowY: 'hidden',
            padding: '2px 2px 6px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {controller.variants.map((variant, index) => {
            const isSelected = variant.id === selected.id;
            const isEditing = variant.id === editingVariantId;
            if (isEditing) {
              return (
                <div
                  key={variant.id}
                  className="electrical-variant-tabs__rename"
                  role="presentation"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    flex: '0 0 auto',
                  }}
                >
                  <Button
                    id={electricalVariantTabId(variant.id)}
                    role="tab"
                    aria-selected={isSelected}
                    aria-controls={electricalVariantPanelId(variant.id)}
                    aria-label={variant.name}
                    tabIndex={-1}
                    type={isSelected ? 'primary' : 'default'}
                    data-electrical-variant-id={variant.id}
                    title={variant.name}
                    onKeyDown={(event) => handleTabKeyDown(index, event)}
                    style={{
                      flex: '0 0 auto',
                      height: 'auto',
                      minHeight: 30,
                      maxWidth: 'min(420px, 72vw)',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {variant.name}
                    </span>
                  </Button>
                  <div style={{ flex: '0 0 min(320px, 72vw)' }}>
                    <Input
                      ref={renameInputRef}
                      value={renameValue}
                      maxLength={128}
                      status={renameValidationError ? 'error' : undefined}
                      aria-label={`Новое название ЭР «${variant.name}»`}
                      aria-invalid={renameValidationError ? 'true' : 'false'}
                      aria-describedby={renameValidationError ? 'electrical-variant-rename-error' : undefined}
                      onChange={(event) => {
                        setRenameValue(event.target.value);
                        if (event.target.value.trim()) setRenameValidationError(null);
                      }}
                      onKeyDown={handleRenameKeyDown}
                      onBlur={() => {
                        if (!cancelRenameRef.current) void commitRename(false);
                      }}
                      readOnly={controller.isMutating}
                      aria-busy={controller.isMutating}
                    />
                    {renameValidationError && (
                      <Typography.Text
                        id="electrical-variant-rename-error"
                        type="danger"
                        style={{ display: 'block', marginTop: 4 }}
                      >
                        {renameValidationError}
                      </Typography.Text>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <Button
                key={variant.id}
                id={electricalVariantTabId(variant.id)}
                role="tab"
                aria-selected={isSelected}
                aria-controls={electricalVariantPanelId(variant.id)}
                aria-label={variant.name}
                tabIndex={isSelected ? 0 : -1}
                type={isSelected ? 'primary' : 'default'}
                data-electrical-variant-id={variant.id}
                title={variant.name}
                onClick={() => {
                  if (canMutate) {
                    ignoreHandledError(controller.selectAndActivateVariant(variant.id));
                  } else {
                    controller.selectVariant(variant.id);
                  }
                }}
                onKeyDown={(event) => handleTabKeyDown(index, event)}
                style={{
                  flex: '0 0 auto',
                  height: 'auto',
                  minHeight: 30,
                  maxWidth: 'min(420px, 72vw)',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {variant.name}
                </span>
              </Button>
            );
          })}
        </div>

        <Flex gap={8} wrap="wrap" className="electrical-variant-tabs__actions">
          <Tooltip title={reachedLimit ? 'В проекте уже создано 5 ЭР' : undefined}>
            <span>
              <Button
                loading={controller.pendingOperation === 'create'}
                disabled={!canMutate || reachedLimit || lifecycleWriteLocked}
                aria-label={
                  reachedLimit
                    ? 'Добавить пустой ЭР — достигнут лимит 5'
                    : 'Добавить пустой ЭР'
                }
                onClick={() => ignoreHandledError(controller.createVariant())}
              >
                Добавить пустой ЭР
              </Button>
            </span>
          </Tooltip>

          <Tooltip title={reachedLimit ? 'В проекте уже создано 5 ЭР' : undefined}>
            <span>
              <Button
                loading={controller.pendingOperation === 'copy'}
                disabled={!canMutate || reachedLimit || lifecycleWriteLocked}
                aria-label={
                  reachedLimit
                    ? `Создать копию «${selected.name}» — достигнут лимит 5`
                    : `Создать копию выбранного ЭР «${selected.name}»`
                }
                onClick={() => ignoreHandledError(controller.copySelectedVariant())}
              >
                Создать копию
              </Button>
            </span>
          </Tooltip>

          <Button
            loading={controller.pendingOperation === 'rename'}
            disabled={!canMutate || lifecycleWriteLocked}
            aria-label={`Переименовать ЭР «${selected.name}»`}
            onClick={startRename}
          >
            Переименовать
          </Button>

          <Popconfirm
            disabled={!canMutate || isLastVariant || lifecycleWriteLocked}
            title={`Удалить ЭР «${selected.name}»?`}
            description="Будут удалены назначения объектов, электрические расчёты и выбранные кабели, кандидаты и их папки, а также спецификация этого ЭР. Действие нельзя отменить."
            okText="Удалить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            onConfirm={() => ignoreHandledError(controller.deleteVariant(selected.id))}
          >
            <Button
              danger
              loading={controller.pendingOperation === 'delete'}
              disabled={!canMutate || isLastVariant || lifecycleWriteLocked}
              aria-label={
                isLastVariant
                  ? `Нельзя удалить последний ЭР «${selected.name}»`
                  : `Удалить ЭР «${selected.name}»`
              }
            >
              Удалить
            </Button>
          </Popconfirm>
        </Flex>
      </Space>
    </Card>
  );
}
