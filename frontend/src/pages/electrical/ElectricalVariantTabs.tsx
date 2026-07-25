import { useEffect, useRef, type KeyboardEvent } from 'react';
import {
  Popconfirm,
  Space,
  Tooltip,
  Typography,
} from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { extractApiErrorMessage } from '@/api/client';
import {
  TltAlert,
  TltButton,
} from '@/components/ui-kit';
import { ROUTES } from '@/routes/routes';
import type {
  ElectricalVariantSelectionController,
} from './useElectricalVariantSelection';
import { useElectricalVariantRename } from './useElectricalVariantRename';
import {
  EmptyElectricalVariantState,
    LoadingCard,
  MutationStatus,
} from './ElectricalVariantTabsEmptyState';
import { ignoreHandledError } from './electricalVariantAsyncHelpers';

const MAX_ELECTRICAL_VARIANTS = 5;

export function electricalVariantTabId(variantId: string): string {
  return `electrical-variant-tab-${variantId}`;
}

export function electricalVariantPanelId(variantId: string): string {
  return `electrical-variant-panel-${variantId}`;
}

export interface ElectricalVariantTabsProps {
  controller: ElectricalVariantSelectionController;
  canMutate?: boolean;
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
      <TltAlert
        tone="danger"
        title="Не удалось загрузить электротехнические решения"
        action={(
          <TltButton
            size="compact"
            loading={controller.isFetching}
            onClick={() => ignoreHandledError(controller.retryList())}
            aria-label="Повторить загрузку ЭР"
          >
            Повторить
          </TltButton>
        )}
      >
        {extractApiErrorMessage(controller.listError)}
      </TltAlert>
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
      <TltAlert
        tone="danger"
        title="Не удалось выбрать ЭР"
        action={(
          <TltButton
            size="compact"
            loading={controller.isFetching}
            onClick={() => ignoreHandledError(controller.retryList())}
          >
            Обновить
          </TltButton>
        )}
      >
        Обновите список электротехнических решений.
      </TltAlert>
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
          <TltAlert tone="info" title="Режим просмотра">
            Изменять ЭР может только владелец проекта или администратор.
          </TltAlert>
        )}
        {controller.mutationError != null && !editingVariantId && (
          <TltAlert
            tone="danger"
            title="Не удалось подтвердить результат операции с ЭР"
            onDismiss={controller.clearMutationError}
          >
            {extractApiErrorMessage(controller.mutationError)}
          </TltAlert>
        )}
        {controller.mutationNotice && !editingVariantId && (
          <TltAlert
            tone="success"
            title="Результат операции подтверждён"
            onDismiss={controller.clearMutationError}
          >
            {controller.mutationNotice}
          </TltAlert>
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
                    <input
                      ref={renameInputRef}
                      className="electrical-variant-rename-input tlt-text-field__input tlt-field--w200"
                      value={renameValue}
                      maxLength={128}
                      aria-label={`Новое название ЭР «${variant.name}»`}
                      aria-invalid={renameValidationError ? 'true' : 'false'}
                      aria-describedby={renameValidationError ? 'electrical-variant-rename-error' : undefined}
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
                        className="electrical-variant-hint"
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
                <TltButton
                  size="compact"
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
                </TltButton>
              </span>
            </Tooltip>

            <Tooltip title={reachedLimit ? 'В проекте уже создано 5 ЭР' : undefined}>
              <span>
                <TltButton
                  size="compact"
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
                </TltButton>
              </span>
            </Tooltip>

            <TltButton
              size="compact"
              variant="link"
              loading={controller.pendingOperation === 'rename'}
              disabled={!canMutate || lifecycleWriteLocked}
              aria-label={`Переименовать ЭР «${selected.name}»`}
              onClick={startRename}
            >
              Переименовать
            </TltButton>

            <Popconfirm
              disabled={!canMutate || isLastVariant || lifecycleWriteLocked}
              title={`Удалить ЭР «${selected.name}»?`}
              description="Будут удалены назначения объектов, электрические расчёты и выбранные кабели, кандидаты и их папки, а также спецификация этого ЭР. Действие нельзя отменить."
              okText="Удалить"
              cancelText="Отмена"
              okButtonProps={{ danger: true }}
              onConfirm={() => ignoreHandledError(controller.deleteVariant(selected.id))}
            >
              <TltButton
                size="compact"
                variant="danger"
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
              </TltButton>
            </Popconfirm>

            <TltButton
              size="compact"
              className="electrical-variant-action electrical-variant-action--spec"
              icon={<FileTextOutlined />}
              onClick={() => navigate(ROUTES.specification)}
              aria-label="Сформировать спецификацию"
            >
              Сформировать спецификацию
            </TltButton>
          </div>
        </div>
      </Space>
    </div>
  );
}
