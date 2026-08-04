/**
 * Характеризация «как есть» — слайс 1 переверстки.
 * Истории фиксируют текущий DOM-контракт панели до правок стиля:
 * классы островов, data-атрибуты, слоты, режим подписи по варианту раскладки.
 * См. docs/tnp/cases/heat-frontend-restyle-prompt.md §6.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Form } from 'antd';
import { TltNumberField, TltSelect, TltTextField } from '@/components/ui-kit';
import HeatCalcObjectFieldsPanel from './HeatCalcObjectFieldsPanel';
import { WizardStoryShell } from './__fixtures__/wizardStoryDecorators';
import { expectIslandScale } from './__fixtures__/wizardIslandScale';

/** Поля-заглушки: панель принимает содержимое слотами, состав приходит снаружи. */
function TextSlot() {
  return (
    <>
      <Form.Item label="Наименование" name="name">
        <TltTextField />
      </Form.Item>
      <Form.Item label="Материал трубы" name="pipe_material">
        <TltSelect
          options={[{ value: 'carbon_steel', label: 'Сталь углеродистая' }]}
        />
      </Form.Item>
    </>
  );
}

function GeometrySlot() {
  return (
    <>
      <Form.Item label="Наружный диаметр" name="outer_diameter_mm">
        <TltNumberField unit="мм" />
      </Form.Item>
      <Form.Item label="Толщина стенки" name="wall_thickness_mm">
        <TltNumberField unit="мм" />
      </Form.Item>
    </>
  );
}

function EnvironmentSlot() {
  return (
    <Form.Item label="Температура окружающей среды" name="ambient_temperature">
      <TltNumberField unit="°C" />
    </Form.Item>
  );
}

const meta = {
  title: 'Wizard/HeatCalcObjectFieldsPanel',
  component: HeatCalcObjectFieldsPanel,
  parameters: { layout: 'padded' },
  render: (args) => (
    <WizardStoryShell layout={args.layout}>
      <Form layout="vertical" requiredMark={false}>
        <HeatCalcObjectFieldsPanel {...args} />
      </Form>
    </WizardStoryShell>
  ),
  args: {
    layout: 'wide',
    objectType: 'pipe',
    geometry: <TextSlot />,
    climate: <GeometrySlot />,
    insulationSettings: <EnvironmentSlot />,
  },
} satisfies Meta<typeof HeatCalcObjectFieldsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Основной вариант: блок параметров сверху или снизу, подпись слева от поля. */
export const Wide: Story = {
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('.heat-object-fields');
    await expect(root).not.toBeNull();

    // остров и его защита — контракт архитектурных тестов
    await expect(root).toHaveClass('heat-object-fields--wide');
    await expect(root).toHaveAttribute('data-protected', 'heat-object-fields');
    await expect(root).toHaveAttribute('data-wizard-island', 'heat-object-fields');
    await expect(root).toHaveAttribute('data-object-type', 'pipe');

    // три слота с именами, которые проверяет ObjectWizardDependencies.layout-defaults
    const slots = [...canvasElement.querySelectorAll('[data-slot]')].map((el) =>
      el.getAttribute('data-slot'),
    );
    await expect(slots).toEqual(['wide', 'geometry-numeric', 'environment-numeric']);

    // wide → подпись слева: модификатор labels-top отсутствует
    const grid = canvasElement.querySelector('.heat-object-fields__geometry');
    await expect(grid).toHaveClass('tlt-compact-field-grid--ant-form');
    await expect(grid).not.toHaveClass('tlt-compact-field-grid--labels-top');
    await expect(grid).toHaveAttribute('data-density', 'compact');

    // §5.4: масштаб этого острова, а не зоны
    await expectIslandScale(root, '.ant-input', {
      height: 36,
      radius: '6px',
      labelSize: '9px',
    });
  },
};

/** Боковое размещение: другой набор слотов и подпись над контролом. */
export const Side: Story = {
  args: { layout: 'side' },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('.heat-object-fields');
    await expect(root).toHaveClass('heat-object-fields--side');

    const slots = [...canvasElement.querySelectorAll('[data-slot]')].map((el) =>
      el.getAttribute('data-slot'),
    );
    await expect(slots).toEqual(['geometry', 'climate', 'insulation-settings']);

    const grid = canvasElement.querySelector('.heat-object-fields__geometry');
    await expect(grid).toHaveClass('tlt-compact-field-grid--labels-top');
  },
};

/** Резервуар — панель та же, меняется только data-object-type. */
export const Tank: Story = {
  args: { objectType: 'tank' },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('.heat-object-fields');
    await expect(root).toHaveAttribute('data-object-type', 'tank');
  },
};
