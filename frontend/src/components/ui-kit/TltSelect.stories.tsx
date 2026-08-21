import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { TltSelect } from '../form-controls';

const materialOptions = [
  { value: 'steel', label: 'Сталь' },
  { value: 'copper', label: 'Медь' },
  { value: 'plastic', label: 'Пластик', disabled: true },
];

const meta = {
  title: 'UI Kit/TltSelect',
  component: TltSelect,
  parameters: {
    docs: {
      description: {
        component:
          'TLT select façade. Options shape: `{ value, label, disabled? }`. Prefer with CompactField. Import from `@/components/ui-kit`.',
      },
    },
  },
  args: {
    'aria-label': 'Материал',
    placeholder: 'Выберите материал',
    options: materialOptions,
    defaultValue: 'steel',
    onChange: fn(),
  },
} satisfies Meta<typeof TltSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    defaultValue: null,
    placeholder: 'Ничего не выбрано',
  },
};

export const AllowClear: Story = {
  args: {
    allowClear: true,
    defaultValue: 'copper',
  },
};

export const Invalid: Story = {
  args: {
    status: 'error',
    'aria-invalid': true,
    defaultValue: null,
    placeholder: 'Обязательный выбор',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: 'steel',
  },
};

export const Required: Story = {
  args: {
    required: true,
    defaultValue: null,
    placeholder: 'Обязательно',
  },
};

export const SelectsOption: Story = {
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByLabelText('Материал');
    await userEvent.click(trigger);
    const option = await canvas.findByText('Медь');
    await userEvent.click(option);
    await expect(args.onChange).toHaveBeenCalled();
  },
};
