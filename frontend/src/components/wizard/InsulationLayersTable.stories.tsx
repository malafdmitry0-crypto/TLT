/**
 * Характеризация «как есть» — слайс 1 переверстки.
 * Таблица слоёв изоляции: не antd Table, а ручной div-grid из пяти колонок.
 * E2E `heat-form-insulation-layout.spec.ts` фиксирует число треков — истории
 * закрепляют состав шапки и поведение кнопок «+» / «−».
 * См. docs/tnp/cases/heat-frontend-restyle-prompt.md §6.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { Form } from 'antd';
import InsulationLayersTable from './InsulationLayersTable';
import type { ReferencePickerOption } from './ReferencePicker';
import { insulationRows } from './__fixtures__/wizardReferenceFixtures';
import { WizardStoryShell } from './__fixtures__/wizardStoryDecorators';
import { expectIslandScale } from './__fixtures__/wizardIslandScale';

const materialOptions: ReferencePickerOption[] = insulationRows.map((row) => ({
  value: row.material,
  label: row.name,
  searchText: row.name,
}));

const meta = {
  title: 'Wizard/InsulationLayersTable',
  component: InsulationLayersTable,
  parameters: { layout: 'padded' },
  render: (args) => (
    <WizardStoryShell layout={args.layout}>
      <Form
        layout="vertical"
        requiredMark={false}
        initialValues={{
          insulation_material: 'mineral_wool',
          insulation_thickness_mm: 50,
          first_insulation_lambda: 0.045,
        }}
      >
        <InsulationLayersTable {...args} />
      </Form>
    </WizardStoryShell>
  ),
  args: {
    objectType: 'pipe',
    layout: 'wide',
    layerCount: 1,
    insulationMaterials: insulationRows,
    insulationMaterialOptions: materialOptions,
    insulationMaterialsError: false,
    isInsulationMaterialsFetching: false,
    onProgrammaticValuesChange: fn(),
  },
} satisfies Meta<typeof InsulationLayersTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Один слой — состояние по умолчанию для нового объекта. */
export const SingleLayer: Story = {
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('.insulation-layers-table');
    await expect(root).not.toBeNull();
    await expect(root).toHaveAttribute('data-wizard-island', 'insulation-layers-table');
    await expect(root).toHaveAttribute('data-protected', 'insulation-layers-table');

    // Шапка из пяти колонок — контракт e2e heat-form-insulation-layout.
    // Ищем строго в шапке: «Толщина» встречается и в подписи поля строки.
    const head = [...canvasElement.querySelectorAll('.insulation-layers-header *')]
      .map((el) => el.textContent?.trim())
      .filter(Boolean);
    for (const title of ['Материал изоляции', 'Толщина', 'λ слоя', 'Диапазон температур']) {
      await expect(head).toContain(title);
    }

    // §5.4: у таблицы своя высота 28px — решение владельца, соседи её не двигают
    await expectIslandScale(root, '.reference-picker-control', {
      height: 28,
      radius: '6px',
    });
  },
};

/** Два слоя: добавляется строка внешнего слоя со своим материалом. */
export const TwoLayers: Story = {
  args: {
    layerCount: 2,
    secondInsulationMaterial: 'foam_glass',
    selectedSecondInsulation: insulationRows[1],
  },
  play: async ({ canvasElement }) => {
    const groups = canvasElement.querySelectorAll('.insulation-layer-group');
    await expect(groups.length).toBeGreaterThan(1);
  },
};

/** Справочник не загрузился — материал выбрать нельзя. */
export const MaterialsError: Story = {
  args: {
    insulationMaterials: [],
    insulationMaterialOptions: [],
    insulationMaterialsError: true,
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('.insulation-layers-table');
    await expect(root).not.toBeNull();
  },
};

/** Боковая раскладка — вторая из двух, которые придётся верстать (§3.7). */
export const Side: Story = {
  args: { layout: 'side' },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('.insulation-layers-table');
    await expect(root).not.toBeNull();
  },
};
