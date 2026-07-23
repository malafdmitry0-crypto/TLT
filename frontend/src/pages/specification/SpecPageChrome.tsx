/**
 * @module specification/page-chrome
 * Settings drawer + add/preflight modals.
 */
import type { ReactNode } from 'react';
import {
  Button,
  Checkbox,
  Drawer,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  CompactField,
  TltButton,
  TltNumberField,
  TltSelect,
} from '@/components/ui-kit';
import type { SpecGroupBy as GroupBy } from '@/pages/specification/specFormatModel';
import type {
  AccessoryExtendedInfo,
  SpecificationSettings,
} from '@/api/specifications';
import type { Specification, SpecificationItem } from '@/types/specification';
import '../workflow-params.css';

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
  fullModeActive: boolean;
  selectedGenerateErIds: string[];
  setSelectedGenerateErIds: (ids: string[]) => void;
  availableGenerateVariants: Array<{ id: string; name: string }>;
  reserveCoeff: number;
  setReserveCoeff: (value: number) => void;
  connectorKitSectionsPerKit: 1 | 2;
  setConnectorKitSectionsPerKit: (value: 1 | 2) => void;
  exZone: boolean;
  setExZone: (value: boolean) => void;
  indicationOnBoxes: boolean;
  setIndicationOnBoxes: (value: boolean) => void;
  endSectionIndication: boolean;
  setEndSectionIndication: (value: boolean) => void;
  topIndication: boolean;
  setTopIndication: (value: boolean) => void;
  minLengthK2i: number;
  setMinLengthK2i: (value: number) => void;
  groupBy: GroupBy;
  setGroupBy: (value: GroupBy) => void;
  mergeIdentical: boolean;
  setMergeIdentical: (value: boolean) => void;
  items: SpecificationItem[];
  categoriesCount: number;
  projectSettings: SpecificationSettings | null | undefined;
  spec: Specification | null | undefined;
  mut: PendingMutation;
  saveDefaultsMut: MutateMutation;
  runGenerate: (partial?: boolean) => void;
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
      options?: import('@/api/specifications').SpecificationOptions;
    } | null,
  ) => void;
  confirmPartialGenerate: () => void;
  preflightSummary: string | null;
};

export function SpecPageChrome(p: SpecPageChromeProps): ReactNode {
  const {
    settingsOpen, toggleSettings, canMutateProject, fullModeActive,
    selectedGenerateErIds, setSelectedGenerateErIds, availableGenerateVariants,
    reserveCoeff, setReserveCoeff, connectorKitSectionsPerKit, setConnectorKitSectionsPerKit,
    exZone, setExZone, indicationOnBoxes, setIndicationOnBoxes,
    endSectionIndication, setEndSectionIndication, topIndication, setTopIndication,
    minLengthK2i, setMinLengthK2i, groupBy, setGroupBy, mergeIdentical, setMergeIdentical,
    items, categoriesCount, projectSettings, spec, mut, saveDefaultsMut, runGenerate,
    canManuallyEdit, hasItems, isSpecStale, setAddOpen, addOpen, handleAdd, saveMut,
    selectedAccessoryId, setSelectedAccessoryId, qty, setQty, accessories,
    preflightOpen, setPreflightOpen, setPendingGenerate, confirmPartialGenerate, preflightSummary,
  } = p;

  return (
    <>
      <Drawer
        title="Настройки спецификации"
        placement="right"
        width={400}
        open={settingsOpen}
        onClose={() => toggleSettings(false)}
        destroyOnClose={false}
        className="specification-settings-drawer"
      >
        <div className="specification-settings-body" data-testid="spec-params-panel">
          <section className="specification-settings-section">
            <Text strong>ЭР и резерв R,гр</Text>
            <Text type="secondary" style={{ display: 'block', fontSize: 12, margin: '6px 0 10px' }}>
              Канонический режим: полный data-driven BOM (PDL-ER-29).
            </Text>
            {/* Multi-select remains Ant Design — TltSelect is single-value only. */}
            <CompactField
              className="specification-settings-field"
              layout="vertical"
              label="ЭР для генерации"
              controlWidth="100%"
            >
              <Select
                mode="multiple"
                size="small"
                allowClear
                style={{ minWidth: 220, width: '100%' }}
                placeholder="Выберите ЭР"
                value={selectedGenerateErIds}
                onChange={(ids: string[]) => setSelectedGenerateErIds(ids)}
                options={availableGenerateVariants.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                aria-label="Выбор ЭР для генерации спецификации"
              />
            </CompactField>
            <div style={{ marginTop: 8 }}>
              <TltButton
                type="button"
                size="compact"
                variant="secondary"
                onClick={() => setSelectedGenerateErIds(availableGenerateVariants.map((item) => item.id))}
                disabled={availableGenerateVariants.length === 0}
              >
                Выбрать все
              </TltButton>
            </div>
            <CompactField
              className="specification-settings-field"
              layout="vertical"
              label="Коэффициент горячего резервирования R,гр (1–3)"
              controlWidth="100%"
            >
              <TltNumberField
                aria-label="Резерв R,гр"
                min={1}
                max={3}
                step={0.1}
                disabled={!canMutateProject || !fullModeActive}
                value={reserveCoeff}
                onChange={(v) => setReserveCoeff(Number(v ?? 1))}
                style={{ width: '100%' }}
              />
            </CompactField>
            <CompactField
              className="specification-settings-field"
              layout="vertical"
              label="Соединительный комплект: секций на 1 шт. (PDF §7.10)"
              controlWidth="100%"
            >
              <TltSelect
                disabled={!canMutateProject || !fullModeActive}
                value={connectorKitSectionsPerKit}
                onChange={(v) => setConnectorKitSectionsPerKit(v === 2 || v === '2' ? 2 : 1)}
                options={[
                  { value: 1, label: '1 — КСН-1 / КСВ-1 (по умолчанию)' },
                  { value: 2, label: '2 — КСН-2 / КСВ-2' },
                ]}
                aria-label="Секций на соединительный комплект"
              />
            </CompactField>
          </section>

          <section className="specification-settings-section">
            <Text strong>Требования ТНП (Ex и индикация)</Text>
            <Space direction="vertical" size={6} style={{ marginTop: 10, width: '100%' }}>
              <Checkbox
                disabled={!canMutateProject || !fullModeActive}
                checked={exZone}
                onChange={(e) => setExZone(e.target.checked)}
              >
                Взрывоопасная зона (Ex)
              </Checkbox>
              <Checkbox
                disabled={!canMutateProject || !fullModeActive}
                checked={indicationOnBoxes}
                onChange={(e) => setIndicationOnBoxes(e.target.checked)}
              >
                Индикация питания на коробках (К1i)
              </Checkbox>
              <Checkbox
                disabled={!canMutateProject || !fullModeActive}
                checked={endSectionIndication}
                onChange={(e) => setEndSectionIndication(e.target.checked)}
              >
                Индикация в конце нагревательной секции (К2i)
              </Checkbox>
              <Checkbox
                disabled={!canMutateProject || !fullModeActive}
                checked={topIndication}
                onChange={(e) => setTopIndication(e.target.checked)}
              >
                Индикация сверху коробки (Кiu)
              </Checkbox>
              {fullModeActive && endSectionIndication && (
                <CompactField
                  className="specification-settings-field"
                  layout="vertical"
                  label="Мин. длина секции для К2i (L,К2i), м"
                  controlWidth="100%"
                >
                  <TltNumberField
                    aria-label="Мин. длина секции для К2i"
                    min={0}
                    step={10}
                    disabled={!canMutateProject}
                    value={minLengthK2i}
                    onChange={(v) => setMinLengthK2i(Number(v ?? 0))}
                    style={{ width: '100%' }}
                    unit="м"
                  />
                </CompactField>
              )}
            </Space>
          </section>

          <section className="specification-settings-section">
            <Text strong>Отображение</Text>
            <div style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12, color: '#888' }}>Группировка</Text>
              <Segmented<GroupBy>
                block
                size="small"
                value={groupBy}
                onChange={setGroupBy}
                options={[
                  { label: 'Тип', value: 'object_section' },
                  { label: 'Кат.', value: 'category' },
                  { label: 'Ед.', value: 'unit' },
                  { label: 'Нет', value: 'none' },
                ]}
                style={{ marginTop: 4 }}
              />
              <Checkbox
                checked={mergeIdentical}
                onChange={(e) => setMergeIdentical(e.target.checked)}
                style={{ fontSize: 12, marginTop: 10 }}
              >
                Объединить одинаковые (base+код)
              </Checkbox>
            </div>
            <div
              style={{
                marginTop: 12,
                padding: '8px 10px',
                background: '#f6f8fa',
                borderRadius: 6,
                border: '1px solid #e8e8e8',
              }}
            >
              <Text style={{ fontSize: 12, display: 'block' }}>
                Позиций: <strong>{items.length}</strong>
                {' · '}
                категорий: <strong>{categoriesCount}</strong>
              </Text>
              {projectSettings?.version != null && (
                <Text style={{ fontSize: 11, color: '#888', display: 'block', marginTop: 4 }}>
                  Project defaults v{projectSettings.version}
                  {typeof spec?.generation_options?.settings_version === 'number'
                    ? ` · snapshot v${spec.generation_options.settings_version as number}`
                    : ''}
                </Text>
              )}
            </div>
          </section>

          <section className="specification-settings-section">
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                block
                loading={mut.isPending}
                disabled={!canMutateProject}
                onClick={() => {
                  runGenerate(false);
                  toggleSettings(false);
                }}
              >
                {hasItems ? 'Пересчитать' : 'Сформировать'}
              </Button>
              <Button
                block
                loading={saveDefaultsMut.isPending}
                disabled={!canMutateProject}
                onClick={() => saveDefaultsMut.mutate()}
                aria-label="Сохранить defaults спецификации"
              >
                Сохранить defaults
              </Button>
              {canManuallyEdit && (
                <Button
                  icon={<PlusOutlined />}
                  block
                  disabled={!hasItems || isSpecStale}
                  onClick={() => {
                    toggleSettings(false);
                    setAddOpen(true);
                  }}
                >
                  Добавить из БД
                </Button>
              )}
            </Space>
          </section>
        </div>
      </Drawer>

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
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select<string>
            showSearch
            placeholder="Выберите аксессуар"
            value={selectedAccessoryId ?? undefined}
            onChange={setSelectedAccessoryId}
            style={{ width: '100%' }}
            optionFilterProp="label"
            options={accessories.map((a) => ({
              value: a.id,
              label: `${a.category} · ${a.name}${a.article ? ` (${a.article})` : ''}`,
            }))}
          />
          <InputNumber
            min={0.1}
            step={1}
            value={qty}
            onChange={(v) => setQty(Number(v ?? 1))}
            style={{ width: '100%' }}
            placeholder="Количество"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Ручные позиции помечены тегом «ручная». При пересчёте они удаляются — добавьте
            заново после генерации.
          </Text>
        </Space>
      </Modal>
      <Modal
        title="Подтверждение partial-генерации"
        open={preflightOpen}
        onCancel={() => {
          setPreflightOpen(false);
          setPendingGenerate(null);
        }}
        onOk={confirmPartialGenerate}
        okText="Подтвердить и сформировать"
        cancelText="Отмена"
        confirmLoading={mut.isPending}
      >
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
          {preflightSummary}
        </pre>
      </Modal>
    </>
  );
}
