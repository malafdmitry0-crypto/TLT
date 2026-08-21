import type { Meta, StoryObj } from '@storybook/react-vite';
import CompactField from './CompactField';
import CompactFieldGrid from './CompactFieldGrid';
import { TltNumberField, TltSelect, TltTextField } from '../form-controls';

const meta = {
  title: 'UI Kit/CompactField',
  component: CompactField,
  parameters: { controls: { exclude: ['children'] } },
} satisfies Meta<typeof CompactField>;

export default meta;
type Story = StoryObj<typeof CompactField>;

export const NumberRequired: Story = {
  args: {
    label: 'Температура',
    required: true,
    controlWidth: 'var(--tlt-field-ctrl-num)',
    hint: '-60…600 °C',
    children: <TltNumberField aria-label="Температура" unit="°C" defaultValue={80} />,
  },
};

export const WithError: Story = {
  args: {
    label: 'Температура',
    required: true,
    controlWidth: 'var(--tlt-field-ctrl-num)',
    error: 'Минимум −60 °C',
    children: <TltNumberField aria-label="Температура" unit="°C" defaultValue={-100} />,
  },
};

export const TextAndSelect: Story = {
  render: () => (
    <CompactFieldGrid columns={2} density="compact">
      <CompactField label="Наименование" controlWidth="var(--tlt-field-ctrl-name)">
        <TltTextField aria-label="Наименование" defaultValue="Труба DN100" />
      </CompactField>
      <CompactField label="Материал" required controlWidth="var(--tlt-field-ctrl-climate)">
        <TltSelect
          aria-label="Материал"
          placeholder="Выберите"
          options={[
            { value: 'steel', label: 'Сталь' },
            { value: 'copper', label: 'Медь' },
          ]}
        />
      </CompactField>
    </CompactFieldGrid>
  ),
};

export const Disabled: Story = {
  args: {
    label: 'Длина',
    controlWidth: 'var(--tlt-field-ctrl-num)',
    children: <TltNumberField aria-label="Длина" unit="м" defaultValue={50} disabled />,
  },
};
