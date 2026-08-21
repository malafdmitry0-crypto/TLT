/**
 * Истории `HeatFormField` — слайс 3 переверстки.
 *
 * Проверяют главное обещание компонента: подпись, подсказка и единица берутся
 * из реестра, а не из JSX. Поэтому в историях нет ни одного строкового литерала
 * единицы — ожидания читаются из того же конфига, что и продукт. Если реестр и
 * рендер разъедутся, история упадёт.
 *
 * См. docs/tnp/cases/heat-frontend-restyle-prompt.md §4.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Form } from 'antd';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldInputConfig,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import { TltSelect } from '@/components/ui-kit';
import HeatFormField from './HeatFormField';
import { WizardStoryShell } from './__fixtures__/wizardStoryDecorators';

const meta = {
  title: 'Wizard/HeatFormField',
  component: HeatFormField,
  parameters: { layout: 'padded' },
  render: (args) => (
    <WizardStoryShell>
      <Form layout="vertical" requiredMark={false}>
        <HeatFormField {...args} />
      </Form>
    </WizardStoryShell>
  ),
  args: {
    id: 'outer_diameter_mm',
    objectType: 'pipe',
    className: 'fit-label-form-item short-number-form-item helped-form-item',
    testId: 'outer-diameter-input',
  },
} satisfies Meta<typeof HeatFormField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Числовое поле: контрол, подпись и единица собираются из реестра. */
export const Number: Story = {
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector('[data-testid="outer-diameter-input"]');
    await expect(input).not.toBeNull();

    // единица — из конфига, а не литералом в JSX: ровно то, ради чего компонент
    const unit = getHeatCalcFieldInputConfig('outer_diameter_mm', 'pipe')?.unit;
    await expect(unit).toBeTruthy();
    const addon = canvasElement.querySelector('.unit-input-number__addon');
    await expect(addon).toHaveTextContent(unit!);

    // подпись — тоже из реестра; FieldLabel склеивает слова без пробела (слайс 1)
    const expectedLabel = getHeatCalcFieldLabel('outer_diameter_mm', {
      context: 'form',
      objectType: 'pipe',
    });
    const label = canvasElement.querySelector('.ant-form-item-label label');
    await expect(label?.textContent).toBe(expectedLabel.replace(/\s+/g, ''));
  },
};

/** Классы `Form.Item` приходят снаружи — DOM-контракт шагов не меняется. */
export const KeepsFormItemClasses: Story = {
  play: async ({ canvasElement }) => {
    const item = canvasElement.querySelector('.ant-form-item');
    for (const cls of [
      'fit-label-form-item',
      'short-number-form-item',
      'helped-form-item',
    ]) {
      await expect(item).toHaveClass(cls);
    }
  },
};

/** Подсказка из реестра доезжает до подписи через `HelpedControl`. */
export const AttachesRegistryHint: Story = {
  play: async ({ canvasElement }) => {
    const hint = getHeatCalcFieldDescription('outer_diameter_mm', {
      objectType: 'pipe',
    });
    await expect(hint).toBeTruthy();
    const label = canvasElement.querySelector<HTMLElement>(
      '.ant-form-item-label > label',
    );
    await expect(label?.dataset.fieldHelp).toBe(hint);
  },
};

/** Поле другого типа объекта: тот же id, свои подпись и единица. */
export const TankField: Story = {
  args: {
    id: 'ambient_temperature',
    objectType: 'tank',
    className: 'fit-label-form-item helped-form-item',
    testId: 'ambient-temperature-input',
  },
  play: async ({ canvasElement }) => {
    const unit = getHeatCalcFieldInputConfig('ambient_temperature', 'tank')?.unit;
    const addon = canvasElement.querySelector('.unit-input-number__addon');
    if (unit) await expect(addon).toHaveTextContent(unit);
    await expect(
      canvasElement.querySelector('[data-testid="ambient-temperature-input"]'),
    ).not.toBeNull();
  },
};

/** Нестандартный контрол приходит через children — числовой не собирается. */
export const CustomControl: Story = {
  args: {
    id: 'pipe_material',
    className: 'pipe-material-form-item reduced-select-form-item helped-form-item',
    children: (
      <TltSelect
        data-testid="pipe-material-select"
        options={[{ value: 'carbon_steel', label: 'Сталь углеродистая' }]}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[data-testid="pipe-material-select"]'),
    ).not.toBeNull();
    // числовой контрол не должен появиться рядом
    await expect(canvasElement.querySelector('.unit-input-number__addon')).toBeNull();
  },
};
