import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { TltNumberField } from '../form-controls';

const meta = {
  title: 'UI Kit/TltNumberField',
  component: TltNumberField,
  parameters: {
    docs: {
      description: {
        component:
          'TLT number input with optional unit addon and RU decimal comma. Prefer with CompactField. Import from `@/components/ui-kit`.',
      },
    },
  },
  args: {
    'aria-label': 'Температура',
    unit: '°C',
    defaultValue: 80,
    min: -60,
    max: 600,
    onChange: fn(),
  },
} satisfies Meta<typeof TltNumberField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutUnit: Story = {
  args: {
    unit: undefined,
    'aria-label': 'Коэффициент',
    defaultValue: 1.5,
    min: undefined,
    max: undefined,
  },
};

export const Invalid: Story = {
  args: {
    status: 'error',
    'aria-invalid': true,
    defaultValue: -100,
  },
};

export const Warning: Story = {
  args: {
    status: 'warning',
    defaultValue: 550,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: 20,
  },
};

export const Pressure: Story = {
  args: {
    'aria-label': 'Давление',
    unit: 'МПа',
    defaultValue: 1.25,
    min: 0,
    max: 40,
    step: 0.01,
  },
};

export const TypesValue: Story = {
  play: async ({ canvas, args }) => {
    const input = canvas.getByLabelText('Температура');
    await userEvent.clear(input);
    await userEvent.type(input, '120');
    await expect(args.onChange).toHaveBeenCalled();
  },
};
