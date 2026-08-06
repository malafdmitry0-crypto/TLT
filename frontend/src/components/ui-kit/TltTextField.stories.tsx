import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { TltTextField } from '../form-controls';

const meta = {
  title: 'UI Kit/TltTextField',
  component: TltTextField,
  parameters: {
    docs: {
      description: {
        component:
          'TLT text input façade over Ant Input. Prefer with CompactField for label/hint/error chrome. Import from `@/components/ui-kit`.',
      },
    },
  },
  args: {
    'aria-label': 'Наименование',
    placeholder: 'Введите значение',
    defaultValue: 'Труба DN100',
    onChange: fn(),
  },
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'password', 'email', 'search', 'tel', 'url'],
    },
  },
} satisfies Meta<typeof TltTextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    defaultValue: undefined,
    placeholder: 'Пустое поле',
  },
};

export const Password: Story = {
  args: {
    type: 'password',
    'aria-label': 'Пароль',
    defaultValue: 'secret',
    placeholder: 'Пароль',
  },
};

export const AssociatedLabel: Story = {
  args: {
    'aria-label': undefined,
    id: 'employee-email',
    name: 'email',
    type: 'email',
    defaultValue: undefined,
    placeholder: undefined,
  },
  render: (args) => (
    <>
      <label htmlFor="employee-email">Email</label>
      <TltTextField {...args} />
    </>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByRole('textbox', { name: 'Email' });
    await expect(input).not.toHaveAttribute('aria-label');
  },
};

export const Invalid: Story = {
  args: {
    'aria-invalid': true,
    defaultValue: '',
    placeholder: 'Обязательное поле',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: 'Только чтение',
  },
};

export const MaxLength: Story = {
  args: {
    maxLength: 12,
    defaultValue: 'Короткий',
    placeholder: 'До 12 символов',
  },
};

export const TypesValue: Story = {
  play: async ({ canvas, args }) => {
    const input = canvas.getByLabelText('Наименование');
    await userEvent.clear(input);
    await userEvent.type(input, 'Ёмкость V1');
    await expect(args.onChange).toHaveBeenCalled();
    await expect(input).toHaveValue('Ёмкость V1');
  },
};
