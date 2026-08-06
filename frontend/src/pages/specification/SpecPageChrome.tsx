/**
 * @module specification/page-chrome
 * Generation settings + add/preflight modals.
 */
import type { ReactNode } from 'react';
import {
  Checkbox,
  Modal,
  Segmented,
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
import type { SpecGroupBy as GroupBy } from '@/pages/specification/specFormatModel';
import type {
  AccessoryExtendedInfo,
  SpecificationDiagnostic,
  SpecificationGroupingMode,
  SpecificationSettings,
} from '@/api/specifications';
import { missingSpecGenerateFields } from '@/pages/specification/specGenerateOptionsModel';
import { resolveSpecificationCatalogLabel } from '@/pages/specification/specGenerationOptionsSyncModel';
import type { Specification, SpecificationItem } from '@/types/specification';
import '../workflow-params.css';
import './specification-page.css';
import './specification-settings-modal.css';

const { Text } = Typography;

type PendingMutation = {
  isPending: boolean;
};

type MutateMutation = PendingMutation & {
  mutate: () => void;
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
  exZone: boolean | null;
  setExZone: (value: boolean | null) => void;
  indicationOnBoxes: boolean | null;
  setIndicationOnBoxes: (value: boolean | null) => void;
  endSectionIndication: boolean | null;
  setEndSectionIndication: (value: boolean | null) => void;
  topIndication: boolean | null;
  setTopIndication: (value: boolean | null) => void;
  minLengthK2i: string;
  setMinLengthK2i: (value: string) => void;
  groupingMode: SpecificationGroupingMode | null;
  setGroupingMode: (value: SpecificationGroupingMode | null) => void;
  generationDiagnostics: SpecificationDiagnostic[];
  /** Required catalog choices for the active generation workflow. */
  candidateSelection?: ReactNode;
  groupBy: GroupBy;
  setGroupBy: (value: GroupBy) => void;
  mergeIdentical: boolean;
  setMergeIdentical: (value: boolean) => void;
  items: SpecificationItem[];
  categoriesCount: number;
  projectSettings: SpecificationSettings | null | undefined;
  spec: Specification | null | undefined;
  mut: PendingMutation;
  generationWorkflowPending: boolean;
  saveDefaultsMut: MutateMutation;
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
    groupBy, setGroupBy, mergeIdentical, setMergeIdentical,
    items, categoriesCount, projectSettings, spec, mut, generationWorkflowPending,
    saveDefaultsMut, runGenerate,
    canManuallyEdit, hasItems, isSpecStale, setAddOpen, addOpen, handleAdd, saveMut,
    selectedAccessoryId, setSelectedAccessoryId, qty, setQty, accessories,
    preflightOpen, setPreflightOpen, setPendingGenerate, confirmPartialGenerate,
    fixUnassignedAssignments, preflightSummary,
  } = p;
  const missingFields = missingSpecGenerateFields({
    exZone,
    reserveCoeff,
    indicationOnBoxes,
    endSectionIndication,
    topIndication,
    minLengthK2i,
    groupingMode,
  });
  const generationDisabled = !canMutateProject
    || selectedGenerateErIds.length === 0
    || missingFields.length > 0
    || generationWorkflowPending
    || mut.isPending;
  const projectSettingsDisabled = !canMutateProject
    || missingFields.length > 0
    || saveDefaultsMut.isPending;
  const manualAddDisabledReason = isSpecStale
    ? 'Эта спецификация устарела. Пересчитайте выбранную ЭР, чтобы добавить позиции вручную.'
    : !hasItems
      ? 'Сначала сформируйте спецификацию, чтобы добавить позиции вручную.'
      : null;
  const catalogLabel = resolveSpecificationCatalogLabel(
    spec?.snapshot,
    projectSettings?.settings as Record<string, unknown> | undefined,
  );

  return (
    <>
      <Modal
        title="Настройки формирования спецификации"
        width={720}
        open={settingsOpen}
        onCancel={() => toggleSettings(false)}
        footer={null}
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
            <CompactFieldGrid columns={2} antFormAdapter={false}>
              <CompactField layout="vertical" label="Номенклатурная база" controlWidth="100%">
                <TltSelect
                  disabled
                  value={catalogLabel}
                  options={[{ value: catalogLabel, label: catalogLabel }]}
                  aria-label="Стандартная номенклатурная база"
                />
              </CompactField>
              <CompactField layout="vertical" label="Группировка строк ЭР" controlWidth="100%">
                <TltSelect
                  value={groupingMode}
                  allowClear
                  placeholder="Не задано"
                  disabled={!canMutateProject}
                  onChange={(value) => setGroupingMode(
                    value === 'separate_by_object_type' || value === 'merge_materials'
                      ? value
                      : null,
                  )}
                  options={[
                    { value: 'separate_by_object_type', label: 'Раздельно по типу объекта' },
                    { value: 'merge_materials', label: 'Объединять одинаковые материалы' },
                  ]}
                  aria-label="Режим группировки спецификации"
                />
              </CompactField>
            </CompactFieldGrid>
          </section>

          <section className="specification-settings-section">
            <Text strong>Требования ТНП (Ex и индикация)</Text>
            <CompactFieldGrid columns={2} antFormAdapter={false}>
              {[
                ['Ex — взрывоопасная зона', exZone, setExZone, 'Параметр Ex'],
                ['К1i — питание на коробках', indicationOnBoxes, setIndicationOnBoxes, 'Параметр К1i'],
                ['К2i — индикация в конце секции', endSectionIndication, setEndSectionIndication, 'Параметр К2i'],
                ['Кiu — индикация сверху коробки', topIndication, setTopIndication, 'Параметр Кiu'],
              ].map(([label, value, setter, ariaLabel]) => (
                <CompactField key={String(ariaLabel)} layout="vertical" label={String(label)} controlWidth="100%">
                  <Checkbox
                    checked={value === true}
                    disabled={!canMutateProject}
                    onChange={(event) => (
                      setter as (nextValue: boolean | null) => void
                    )(event.target.checked)}
                    aria-label={String(ariaLabel)}
                  />
                </CompactField>
              ))}
              <CompactField layout="vertical" label="L,К2i — мин. длина секции, м" controlWidth="100%">
                <TltNumberField
                  aria-label="Параметр L К2i"
                  min={0}
                  step={0.1}
                  disabled={!canMutateProject}
                  value={minLengthK2i === '' ? null : Number(minLengthK2i)}
                  onChange={(value) => setMinLengthK2i(value == null ? '' : String(value))}
                  className="specification-settings-field-full"
                  unit="м"
                />
              </CompactField>
              <CompactField layout="vertical" label="R,гр — горячее резервирование" controlWidth="100%">
                <TltNumberField
                  aria-label="Параметр R гр"
                  step={0.1}
                  disabled={!canMutateProject}
                  value={reserveCoeff === '' ? null : Number(reserveCoeff)}
                  onChange={(value) => setReserveCoeff(value == null ? '' : String(value))}
                  className="specification-settings-field-full"
                />
              </CompactField>
            </CompactFieldGrid>
          </section>

          <section className="specification-settings-section">
            <Text strong>Отображение</Text>
            <div className="specification-settings-display">
              <Text className="specification-settings-display-label">Группировка</Text>
              <Segmented<GroupBy>
                block
                value={groupBy}
                onChange={setGroupBy}
                options={[
                  { label: 'Тип', value: 'object_section' },
                  { label: 'Кат.', value: 'category' },
                  { label: 'Ед.', value: 'unit' },
                  { label: 'Нет', value: 'none' },
                ]}
                className="specification-settings-group-by"
              />
              <Checkbox
                checked={mergeIdentical}
                onChange={(e) => setMergeIdentical(e.target.checked)}
                className="specification-settings-merge"
              >
                Объединить одинаковые (base+код)
              </Checkbox>
            </div>
            <div className="specification-settings-stats">
              <Text className="specification-settings-stats-line">
                Позиций: <strong>{items.length}</strong>
                {' · '}
                категорий: <strong>{categoriesCount}</strong>
              </Text>
              {projectSettings?.version != null && (
                <Text className="specification-settings-stats-meta">
                  Project defaults v{projectSettings.version}
                  {typeof spec?.snapshot?.settings_revision === 'number'
                    ? ` · snapshot v${spec.snapshot.settings_revision}`
                    : ''}
                </Text>
              )}
            </div>
          </section>

          <section className="specification-settings-section">
            {(selectedGenerateErIds.length === 0 || missingFields.length > 0) && (
              <TltAlert
                tone="warning"
                title="Заполните обязательные параметры"
                className="specification-settings-validation"
              >
                {selectedGenerateErIds.length === 0 ? 'Выберите хотя бы один ЭР. ' : ''}
                {missingFields.length > 0 ? `Не заданы: ${missingFields.join(', ')}.` : ''}
              </TltAlert>
            )}
            {generationDiagnostics.length > 0 && (
              <TltAlert
                tone="danger"
                title="Backend заблокировал формирование"
                className="specification-settings-diagnostics"
              >
                <ul>
                  {generationDiagnostics.map((diagnostic) => (
                    <li key={`${diagnostic.kind}:${diagnostic.code}`}>
                      <strong>{diagnostic.code}</strong>
                      {' — '}
                      {diagnostic.message}
                    </li>
                  ))}
                </ul>
              </TltAlert>
            )}
            {candidateSelection}
            <Space direction="vertical" className="tlt-field--fill" size={8}>
              <TltButton
                variant="primary"
                icon={<ReloadOutlined />}
                className="specification-settings-action"
                disabled={generationDisabled}
                loading={mut.isPending}
                onClick={() => runGenerate(false)}
                aria-label={hasItems ? 'Пересчитать' : 'Сформировать'}
              >
                {hasItems ? 'Пересчитать' : 'Сформировать'}
              </TltButton>
              <TltButton
                className="specification-settings-action"
                disabled={projectSettingsDisabled}
                loading={saveDefaultsMut.isPending}
                onClick={() => saveDefaultsMut.mutate()}
                aria-label="Сохранить настройки проекта"
              >
                Сохранить настройки проекта
              </TltButton>
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
            </Space>
          </section>
        </div>
      </Modal>

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
      <Modal
        title="Подтверждение исключения неназначенных объектов"
        open={preflightOpen}
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
    </>
  );
}
