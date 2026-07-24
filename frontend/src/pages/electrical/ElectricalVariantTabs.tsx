import { useEffect, useRef, type KeyboardEvent } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  Popconfirm,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { extractApiErrorMessage } from '@/api/client';
import { ROUTES } from '@/routes/routes';
import type {
  ElectricalVariantPendingOperation,
  ElectricalVariantSelectionController,
} from './useElectricalVariantSelection';
import { useElectricalVariantRename } from './useElectricalVariantRename';

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
      <Space role="status" aria-live="polite"><Spin size="small" /><Typography.Text>{text}</Typography.Text></Space>
    </Card>
  );
}

function MutationStatus({ operation }: { operation: ElectricalVariantPendingOperation }) {
  if (!operation) return null;
  return (
    <Space role="status" aria-live="polite" size={6}>
      <Spin size="small" /><Typography.Text>{PENDING_OPERATION_LABELS[operation]}</Typography.Text>
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
  const navigate = useNavigate();
  const tablistRef = useRef<HTMLDivElement>(null);
  const rename = useElectricalVariantRename({
    variants: controller.variants,
    selectedVariant: controller.selectedVariant,
    renameVariant: controller.renameVariant,
    clearMutationError: controller.clearMutationError,
    tablistRef,
  });
  const {
    editingVariantId,
    renameValue,
    setRenameValue,
    renameValidationError,
    setRenameValidationError,
    renameInputRef,
    isRenaming,
    startRename,
    handleRenameKeyDown,
    handleRenameBlur,
  } = rename;

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
  const lifecycleWriteLocked = controller.isMutating || isRenaming;

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
    <div
      className="electrical-variant-tabs"
      aria-busy={controller.isFetching || controller.isMutating}
      data-testid="electrical-variant-tabs"
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
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

        {/* One row: ER tabs + lifecycle actions (mockup toolbar). */}
        <div className="electrical-variant-tabs__row">
          <div
            ref={tablistRef}
            className="electrical-variant-tabs__scroller"
            role="tablist"
            aria-label="Варианты ЭР"
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
                  >
                    <button
                      type="button"
                      id={electricalVariantTabId(variant.id)}
                      role="tab"
                      className={`electrical-variant-tab${isSelected ? ' electrical-variant-tab--active' : ''}`}
                      aria-selected={isSelected}
                      aria-controls={electricalVariantPanelId(variant.id)}
                      aria-label={variant.name}
                      tabIndex={-1}
                      data-electrical-variant-id={variant.id}
                      title={variant.name}
                      onKeyDown={(event) => handleTabKeyDown(index, event)}
                    >
                      {variant.name}
                    </button>
                    <Input
                      ref={renameInputRef}
                      size="small"
                      value={renameValue}
                      maxLength={128}
                      status={renameValidationError ? 'error' : undefined}
                      aria-label={`Новое название ЭР «${variant.name}»`}
                      aria-invalid={renameValidationError ? 'true' : 'false'}
                      aria-describedby={renameValidationError ? 'electrical-variant-rename-error' : undefined}
                      style={{ width: 200 }}
                      onChange={(event) => {
                        setRenameValue(event.target.value);
                        if (event.target.value.trim()) setRenameValidationError(null);
                      }}
                      onKeyDown={handleRenameKeyDown}
                      onBlur={handleRenameBlur}
                      readOnly={controller.isMutating}
                      aria-busy={controller.isMutating}
                    />
                    {renameValidationError && (
                      <Typography.Text
                        id="electrical-variant-rename-error"
                        type="danger"
                        style={{ fontSize: 12 }}
                      >
                        {renameValidationError}
                      </Typography.Text>
                    )}
                  </div>
                );
              }

              return (
                <button
                  key={variant.id}
                  type="button"
                  id={electricalVariantTabId(variant.id)}
                  role="tab"
                  className={`electrical-variant-tab${isSelected ? ' electrical-variant-tab--active' : ''}`}
                  aria-selected={isSelected}
                  aria-controls={electricalVariantPanelId(variant.id)}
                  aria-label={variant.name}
                  tabIndex={isSelected ? 0 : -1}
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
                >
                  {variant.name}
                </button>
              );
            })}
          </div>

          <div className="electrical-variant-tabs__actions">
            <Tooltip title={reachedLimit ? 'В проекте уже создано 5 ЭР' : undefined}>
              <span>
                <Button
                  size="small"
                  className="electrical-variant-action electrical-variant-action--create"
                  loading={controller.pendingOperation === 'create'}
                  disabled={!canMutate || reachedLimit || lifecycleWriteLocked}
                  aria-label={
                    reachedLimit
                      ? 'Добавить пустой ЭР — достигнут лимит 5'
                      : 'Добавить пустой ЭР'
                  }
                  onClick={() => ignoreHandledError(controller.createVariant())}
                >
                  Добавить новый расчёт
                </Button>
              </span>
            </Tooltip>

            <Tooltip title={reachedLimit ? 'В проекте уже создано 5 ЭР' : undefined}>
              <span>
                <Button
                  size="small"
                  className="electrical-variant-action electrical-variant-action--copy"
                  loading={controller.pendingOperation === 'copy'}
                  disabled={!canMutate || reachedLimit || lifecycleWriteLocked}
                  aria-label={
                    reachedLimit
                      ? `Создать копию «${selected.name}» — достигнут лимит 5`
                      : `Создать копию выбранного ЭР «${selected.name}»`
                  }
                  onClick={() => ignoreHandledError(controller.copySelectedVariant())}
                >
                  Добавить новый расчёт на основании ЭР
                </Button>
              </span>
            </Tooltip>

            <Button
              size="small"
              type="link"
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
                size="small"
                danger
                className="electrical-variant-action electrical-variant-action--delete"
                loading={controller.pendingOperation === 'delete'}
                disabled={!canMutate || isLastVariant || lifecycleWriteLocked}
                aria-label={
                  isLastVariant
                    ? `Нельзя удалить последний ЭР «${selected.name}»`
                    : `Удалить ЭР «${selected.name}»`
                }
              >
                Удалить текущий расчёт
              </Button>
            </Popconfirm>

            <Button
              size="small"
              className="electrical-variant-action electrical-variant-action--spec"
              icon={<FileTextOutlined />}
              onClick={() => navigate(ROUTES.specification)}
              aria-label="Сформировать спецификацию"
            >
              Сформировать спецификацию
            </Button>
          </div>
        </div>
      </Space>
    </div>
  );
}
