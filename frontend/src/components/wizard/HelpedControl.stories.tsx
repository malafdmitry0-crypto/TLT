/**
 * Характеризация «как есть» — слайс 1 переверстки.
 *
 * `HelpedControl` до сих пор не покрыт ничем: ни unit, ни e2e. При этом он
 * работает с DOM императивно — находит подпись через
 * `closest('.ant-form-item')` → `.ant-form-item-label > label`, вешает на неё
 * `data-field-help` и создаёт тултип в `document.body`.
 *
 * Любая правка разметки подписи может сломать его молча, поэтому контракт
 * фиксируется ДО правок стиля. См. промпт §4d.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { Form } from 'antd';
import { TltNumberField } from '@/components/ui-kit';
import HelpedControl from './HelpedControl';
import { WizardStoryShell } from './__fixtures__/wizardStoryDecorators';

const HINT = 'Наружный диаметр трубы без изоляции, в миллиметрах.';

const meta = {
  title: 'Wizard/HelpedControl',
  component: HelpedControl,
  parameters: { layout: 'padded' },
  render: (args) => (
    <WizardStoryShell>
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="Наружный диаметр" name="outer_diameter_mm">
          <HelpedControl {...args}>
            <TltNumberField unit="мм" />
          </HelpedControl>
        </Form.Item>
      </Form>
    </WizardStoryShell>
  ),
  args: { hint: HINT, children: <TltNumberField unit="мм" /> },
} satisfies Meta<typeof HelpedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Подсказка навешивается на подпись поля, а не на сам контрол. */
export const AttachesHintToLabel: Story = {
  play: async ({ canvasElement }) => {
    // обёртка контрола
    await expect(
      canvasElement.querySelector('.field-control-with-help'),
    ).not.toBeNull();

    // ключевой контракт: атрибуты уезжают на label формы
    const label = canvasElement.querySelector<HTMLElement>(
      '.ant-form-item-label > label',
    );
    await expect(label).not.toBeNull();
    await waitFor(async () => {
      await expect(label?.dataset.fieldHelp).toBe(HINT);
      await expect(label?.dataset.fieldHelpFloating).toBe('true');
    });
  },
};

/** Наведение на подпись показывает плавающий тултип в body с ролью tooltip. */
export const ShowsTooltipOnHover: Story = {
  play: async ({ canvasElement }) => {
    const label = canvasElement.querySelector<HTMLElement>(
      '.ant-form-item-label > label',
    );
    await expect(label).not.toBeNull();

    await userEvent.hover(label!);

    // тултип создаётся вне канвы — ищем в document
    await waitFor(
      async () => {
        const tip = document.querySelector('.field-help-floating-tooltip');
        await expect(tip).not.toBeNull();
        await expect(tip).toHaveAttribute('role', 'tooltip');
        await expect(tip).toHaveTextContent(HINT);
        await expect(label).toHaveAttribute('aria-describedby', tip!.id);
      },
      { timeout: 3000 },
    );

    await userEvent.unhover(label!);
  },
};

/** Пустая подсказка — ничего не навешивается, поле остаётся обычным. */
export const NoHint: Story = {
  args: { hint: '   ' },
  play: async ({ canvasElement }) => {
    const label = canvasElement.querySelector<HTMLElement>(
      '.ant-form-item-label > label',
    );
    await expect(label?.dataset.fieldHelp).toBeUndefined();
  },
};
