/**
 * @module specification/page-chrome
 * Generation settings + add/preflight modals.
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import {
  Checkbox,
  Modal,
  Space,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  CompactField,
  CompactFieldGrid,
  TltAlert,
  TltButton,
  TltNumberField,
  TltSelect,
} from '@/components/ui-kit';
import {
  type AccessoryExtendedInfo,
  type SpecificationDiagnostic,
  type SpecificationGroupingMode,
} from '@/api/specifications';
import {
  specificationBackendFieldErrors,
  type SpecGenerateField,
} from '@/pages/specification/specGenerateOptionsModel';
import {
  DEFAULT_SPECIFICATION_GROUPING_MODE,
  resolveSpecificationCatalogLabel,
} from '@/pages/specification/specGenerationOptionsSyncModel';
import type { Specification } from '@/types/specification';
import { SpecificationReadinessAlert } from '@/pages/specification/SpecificationReadinessAlert';
import { SpecificationTnpFields } from '@/pages/specification/SpecificationTnpFields';
import type { SpecificationReadinessView } from '@/pages/specification/specificationReadinessModel';
import '../workflow-params.css';
import './specification-page.css';
import './specification-settings-modal.css';

const { Text } = Typography;

type PendingMutation = {
  isPending: boolean;
};

/** Explicit props-in / events-out for Spec chrome (AF9-TYPE-SPEC-CHROME-01). */
export type SpecPageChromeProps = {
  settingsOpen: boolean;
  toggleSettings: (open: boolean) => void;
  canMutateProject: boolean;
  selectedGenerateErIds: string[];
  setSelectedGenerateErIds: (ids: string[]) => void;
  availableGenerateVariants: Array<{ id: string; name: string }>;
  reserveCoeff: string;
  setReserveCoeff: (value: string) => void;
  exZone: boolean;
  setExZone: (value: boolean) => void;
  indicationOnBoxes: boolean;
  setIndicationOnBoxes: (value: boolean) => void;
  endSectionIndication: boolean;
  setEndSectionIndication: (value: boolean) => void;
  topIndication: boolean;
  setTopIndication: (value: boolean) => void;
  minLengthK2i: string;
  setMinLengthK2i: (value: string) => void;
  groupingMode: SpecificationGroupingMode;
  setGroupingMode: (value: SpecificationGroupingMode) => void;
  generationDiagnostics: SpecificationDiagnostic[];
  /** Required catalog choices for the active generation workflow. */
  candidateSelection?: ReactNode;
  spec: Specification | null | undefined;
  mut: PendingMutation;
  generationWorkflowPending: boolean;
  runGenerate: (excludeUnassignedConfirmed?: boolean) => void;
  canManuallyEdit: boolean;
  hasItems: boolean;
  isSpecStale: boolean;
  setAddOpen: (open: boolean) => void;
  addOpen: boolean;
  handleAdd: () => void;
  saveMut: PendingMutation;
  selectedAccessoryId: string | null;
  setSelectedAccessoryId: (id: string | null) => void;
  qty: number;
  setQty: (value: number) => void;
  accessories: AccessoryExtendedInfo[];
  preflightOpen: boolean;
  setPreflightOpen: (open: boolean) => void;
  setPendingGenerate: (
    value: {
      generateVariantIds: string[];
      options: import('@/api/specifications').SpecificationOptions;
    } | null,
  ) => void;
  confirmPartialGenerate: () => void;
  /** Navigate to ER unassigned tab without confirming partial generate (case §7.3). */
  fixUnassignedAssignments?: () => void;
  preflightSummary: string | null;
  readiness: SpecificationReadinessView;
  retryReadiness: () => unknown;
  handleReadinessRecovery: () => void;
};

export function SpecPageChrome(p: SpecPageChromeProps): ReactNode {
  const {
    settingsOpen, toggleSettings, canMutateProject,
    selectedGenerateErIds, setSelectedGenerateErIds, availableGenerateVariants,
    reserveCoeff, setReserveCoeff,
    exZone, setExZone, indicationOnBoxes, setIndicationOnBoxes,
    endSectionIndication, setEndSectionIndication, topIndication, setTopIndication,
    minLengthK2i, setMinLengthK2i, groupingMode, setGroupingMode, generationDiagnostics,
    candidateSelection,
    spec, mut, generationWorkflowPending, runGenerate,
    canManuallyEdit, hasItems, isSpecStale, setAddOpen, addOpen, handleAdd, saveMut,
    selectedAccessoryId, setSelectedAccessoryId, qty, setQty, accessories,
    preflightOpen, setPreflightOpen, setPendingGenerate, confirmPartialGenerate,
    fixUnassignedAssignments, preflightSummary,
    readiness, retryReadiness, handleReadinessRecovery,
  } = p;
  const visibleErrors = useMemo(
    () => specificationBackendFieldErrors(generationDiagnostics),
    [generationDiagnostics],
  );
  useEffect(() => {
    const order: Array<[SpecGenerateField, string]> = [
      ['groupingMode', 'spec-grouping-mode'],
      ['exZone', 'spec-ex'],
      ['indicationOnBoxes', 'spec-k1i'],
      ['endSectionIndication', 'spec-k2i'],
      ['topIndication', 'spec-kiu'],
      ['minLengthK2i', 'spec-l-k2i'],
      ['reserveCoeff', 'spec-r-gr'],
    ];
    const target = order.find(([field]) => visibleErrors[field]);
    if (target) {
      window.setTimeout(() => {
        const control = document.getElementById(target[1]);
        control?.scrollIntoView?.({ block: 'center' });
        control?.focus();
      }, 0);
    }
  }, [visibleErrors]);
  const hasReadinessBlocker = readiness.blockers.length > 0
    || readiness.primaryBlocker != null;
  const generationDisabled = !canMutateProject
    || selectedGenerateErIds.length === 0
    || (readiness.state === 'blocked' && hasReadinessBlocker)
    || readiness.state === 'calculating'
    || generationWorkflowPending
    || mut.isPending;
  const manualAddDisabledReason = isSpecStale
    ? 'Эта спецификация устарела. Сформируйте её заново, чтобы добавить позиции вручную.'
    : !hasItems
      ? 'Сначала сформируйте спецификацию, чтобы добавить позиции вручную.'
      : null;
  const catalogLabel = resolveSpecificationCatalogLabel(spec?.snapshot);

  return (
    <>
      {!preflightOpen && (
        <Modal
        title="Настройки формирования спецификации"
        width={720}
        open={settingsOpen}
        onCancel={() => toggleSettings(false)}
        footer={(
          <div className="specification-settings-footer">
            <div className="specification-settings-footer-feedback" aria-live="polite">
              <SpecificationReadinessAlert
                state={readiness.state}
                blocker={readiness.primaryBlocker}
                blockers={readiness.blockers}
                onRecovery={handleReadinessRecovery}
                onRetry={() => { void retryReadiness(); }}
              />
              {generationDiagnostics.length > 0 && (
                <TltAlert
                  tone="danger"
                  title="Backend заблокировал формирование"
                  className="specification-settings-diagnostics"
                >
                  <ul>
                    {generationDiagnostics.map((diagnostic) => (
                      <li key={`${diagnostic.kind}:${diagnostic.code}:${String(diagnostic.details.reason ?? '')}`}>
                        <strong>{diagnostic.code}</strong>
                        {' — '}
                        {diagnostic.message}
                      </li>
                    ))}
                  </ul>
                </TltAlert>
              )}
            </div>
            <TltButton
              variant="primary"
              icon={<ReloadOutlined />}
              className="specification-settings-action"
              disabled={generationDisabled}
              loading={mut.isPending}
              onClick={() => runGenerate(false)}
              aria-label={hasItems ? 'Пересчитать' : 'Сформировать'}
            >
              {hasItems
                ? `Пересчитать выбранные ЭР (${selectedGenerateErIds.length})`
                : `Сформировать выбранные ЭР (${selectedGenerateErIds.length})`}
            </TltButton>
          </div>
        )}
        destroyOnHidden={false}
        className="specification-settings-modal"
      >
        <div className="specification-settings-body" data-testid="spec-params-panel">
          <section className="specification-settings-section">
            <Text strong>Область формирования</Text>
            <Text type="secondary" className="specification-settings-intro">
              Один набор параметров применяется ко всем явно выбранным ЭР.
            </Text>
            <CompactField
              className="specification-settings-field"
              layout="vertical"
              label="ЭР для генерации"
              controlWidth="100%"
            >
              <Checkbox.Group
                className="specification-settings-er-checkbox-group"
                value={selectedGenerateErIds}
                onChange={(ids) => setSelectedGenerateErIds(ids as string[])}
                options={availableGenerateVariants.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                aria-label="Выбор ЭР для генерации спецификации"
              />
            </CompactField>
            <div className="specification-settings-er-actions">
              <TltButton
                type="button"
                variant="secondary"
                onClick={() => setSelectedGenerateErIds(availableGenerateVariants.map((item) => item.id))}
                disabled={availableGenerateVariants.length === 0}
              >
                Выбрать все
              </TltButton>
            </div>
            <CompactFieldGrid columns={2} flow="rows" sizing="equal" density="comfortable" antFormAdapter={false}>
              <CompactField layout="vertical" label="Номенклатурная база" controlWidth="100%">
                <TltSelect
                  disabled
                  className="specification-settings-field-full"
                  value={catalogLabel}
                  options={[{ value: catalogLabel, label: catalogLabel }]}
                  aria-label="Стандартная номенклатурная база"
                />
              </CompactField>
              <CompactField
                layout="vertical"
                label="Группировка строк при формировании"
                controlWidth="100%"
                required
                error={visibleErrors.groupingMode
                  ? <span id="spec-grouping-mode-error">{visibleErrors.groupingMode}</span>
                  : undefined}
              >
                <TltSelect
                  id="spec-grouping-mode"
                  className="specification-settings-field-full"
                  required
                  status={visibleErrors.groupingMode ? 'error' : ''}
                  aria-describedby={visibleErrors.groupingMode
                    ? 'spec-grouping-mode-error'
                    : undefined}
                  value={groupingMode ?? DEFAULT_SPECIFICATION_GROUPING_MODE}
                  disabled={!canMutateProject}
                  onChange={(value) => {
                    if (value === 'separate_by_object_type' || value === 'merge_materials') {
                      setGroupingMode(value);
                    }
                  }}
                  options={[
                    { value: 'separate_by_object_type', label: 'Разделять по типам объектов' },
                    { value: 'merge_materials', label: 'Объединять материалы' },
                  ]}
                  aria-label="Группировка строк при формировании"
                />
              </CompactField>
            </CompactFieldGrid>
          </section>

          <section className="specification-settings-section">
            <Text strong>Требования ТНП (Ex и индикация)</Text>
            <SpecificationTnpFields
              disabled={!canMutateProject}
              errors={visibleErrors}
              fields={[
                { field: 'exZone', id: 'spec-ex', label: 'Ex — взрывоопасная зона', value: exZone, setValue: setExZone, ariaLabel: 'Параметр Ex' },
                { field: 'indicationOnBoxes', id: 'spec-k1i', label: 'К1i — питание на коробках', value: indicationOnBoxes, setValue: setIndicationOnBoxes, ariaLabel: 'Параметр К1i' },
                { field: 'endSectionIndication', id: 'spec-k2i', label: 'К2i — индикация в конце секции', value: endSectionIndication, setValue: setEndSectionIndication, ariaLabel: 'Параметр К2i' },
                { field: 'topIndication', id: 'spec-kiu', label: 'Кiu — индикация сверху коробки', value: topIndication, setValue: setTopIndication, ariaLabel: 'Параметр Кiu' },
              ]}
              minLengthK2i={minLengthK2i}
              reserveCoeff={reserveCoeff}
              setMinLengthK2i={setMinLengthK2i}
              setReserveCoeff={setReserveCoeff}
            />
          </section>

          {(candidateSelection || canManuallyEdit) && (
            <section className="specification-settings-section">
              {candidateSelection}
              {canManuallyEdit && (
                <Space direction="vertical" className="tlt-field--fill" size={4}>
                  <TltButton
                    icon={<PlusOutlined />}
                    className="specification-settings-action"
                    disabled={manualAddDisabledReason !== null}
                    aria-label="Добавить из БД"
                    aria-describedby={manualAddDisabledReason
                      ? 'specification-manual-add-disabled-reason'
                      : undefined}
                    onClick={() => {
                      toggleSettings(false);
                      setAddOpen(true);
                    }}
                  >
                    Добавить из БД
                  </TltButton>
                  {manualAddDisabledReason && (
                    <Text
                      id="specification-manual-add-disabled-reason"
                      type="secondary"
                      className="specification-add-hint"
                    >
                      {manualAddDisabledReason}
                    </Text>
                  )}
                </Space>
              )}
            </section>
          )}
        </div>
        </Modal>
      )}

      <Modal
        title="Добавить позицию из расширенной БД"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={handleAdd}
        confirmLoading={saveMut.isPending}
        okText="Добавить"
        cancelText="Отмена"
        okButtonProps={{ disabled: !selectedAccessoryId || qty <= 0 }}
      >
        <Space direction="vertical" className="tlt-field--fill">
          <TltSelect
            placeholder="Выберите аксессуар"
            value={selectedAccessoryId ?? undefined}
            onChange={(value) => setSelectedAccessoryId(value == null ? null : String(value))}
            className="tlt-field--fill"
            options={accessories.map((a) => ({
              value: a.id,
              label: `${a.category} · ${a.name}${a.article ? ` (${a.article})` : ''}`,
            }))}
            aria-label="Выберите аксессуар"
          />
          <TltNumberField
            min={0.1}
            step={1}
            value={qty}
            onChange={(v) => setQty(Number(v ?? 1))}
            className="specification-settings-field-full"
            placeholder="Количество"
            aria-label="Количество"
          />
          <Text type="secondary" className="specification-add-hint">
            Ручные позиции помечены тегом «ручная» и сохраняются при пересчёте.
          </Text>
        </Space>
      </Modal>
      {preflightOpen && (
        <Modal
        title="Подтверждение исключения неназначенных объектов"
        open
        onCancel={() => {
          setPreflightOpen(false);
          setPendingGenerate(null);
        }}
        onOk={confirmPartialGenerate}
        okText="Подтвердить и сформировать"
        cancelText="Отмена"
        confirmLoading={mut.isPending}
        footer={(_, { OkBtn, CancelBtn }) => (
          <Space wrap>
            <CancelBtn />
            {fixUnassignedAssignments && (
              <TltButton
                data-testid="spec-preflight-fix"
                onClick={() => fixUnassignedAssignments()}
              >
                Исправить
              </TltButton>
            )}
            <OkBtn />
          </Space>
        )}
      >
        {preflightSummary ? (
          <TltAlert
            tone="warning"
            className="specification-preflight-summary"
            data-testid="spec-preflight-summary"
            title="Есть объекты без назначения в ЭР"
          >
            <div className="specification-preflight-summary__body">
              {preflightSummary.split('\n').map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </TltAlert>
        ) : (
          <Text type="secondary">Подтвердите исключение неназначенных объектов или исправьте назначения.</Text>
        )}
        </Modal>
      )}
    </>
  );
}
