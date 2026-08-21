import type { Meta, StoryObj } from '@storybook/react-vite';
import CompactField from './CompactField';
import CompactFieldGrid from './CompactFieldGrid';
import { TltNumberField, TltSelect, TltTextField } from '../form-controls';

const meta = {
  title: 'UI Kit/CompactFieldGrid',
  component: CompactFieldGrid,
  parameters: {
    controls: { exclude: ['children'] },
    docs: {
      description: {
        component:
          'Shared responsive layout for compact fields. Owns columns/flow/density only — not form state. Prefer this over app-wide CSS Grid for field rows.',
      },
    },
  },
  args: {
    // Placeholder — each story supplies real fields via render().
    children: null,
    columns: 3,
    density: 'compact',
    flow: 'columns',
    maxRowsPerColumn: 5,
    sizing: 'content',
    labelPlacement: 'left',
    antFormAdapter: false,
  },
  argTypes: {
    density: { control: 'select', options: ['compact', 'comfortable'] },
    flow: { control: 'select', options: ['rows', 'columns'] },
    sizing: { control: 'select', options: ['content', 'equal'] },
    labelPlacement: { control: 'select', options: ['left', 'top'] },
  },
} satisfies Meta<typeof CompactFieldGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

function SampleFields() {
  return (
    <>
      <CompactField label="Температура" required controlWidth="var(--tlt-field-ctrl-num)" hint="-60…600 °C">
        <TltNumberField aria-label="Температура" unit="°C" defaultValue={80} />
      </CompactField>
      <CompactField label="Давление" controlWidth="var(--tlt-field-ctrl-num)">
        <TltNumberField aria-label="Давление" unit="МПа" defaultValue={1.2} />
      </CompactField>
      <CompactField label="Наименование" controlWidth="var(--tlt-field-ctrl-name)">
        <TltTextField aria-label="Наименование" defaultValue="Труба DN100" />
      </CompactField>
      <CompactField label="Материал" required controlWidth="var(--tlt-field-ctrl-climate)">
        <TltSelect
          aria-label="Материал"
          placeholder="Выберите"
          defaultValue="steel"
          options={[
            { value: 'steel', label: 'Сталь' },
            { value: 'copper', label: 'Медь' },
          ]}
        />
      </CompactField>
      <CompactField label="Длина" controlWidth="var(--tlt-field-ctrl-num)">
        <TltNumberField aria-label="Длина" unit="м" defaultValue={50} />
      </CompactField>
      <CompactField label="Примечание" controlWidth="var(--tlt-field-ctrl-name)">
        <TltTextField aria-label="Примечание" placeholder="Опционально" />
      </CompactField>
    </>
  );
}

export const Default: Story = {
  render: (args) => (
    <CompactFieldGrid {...args}>
      <SampleFields />
    </CompactFieldGrid>
  ),
};

export const TwoColumns: Story = {
  args: { columns: 2 },
  render: (args) => (
    <CompactFieldGrid {...args}>
      <SampleFields />
    </CompactFieldGrid>
  ),
};

export const LabelsTop: Story = {
  args: { labelPlacement: 'top', columns: 2 },
  render: (args) => (
    <CompactFieldGrid {...args}>
      <SampleFields />
    </CompactFieldGrid>
  ),
};

export const ComfortableEqual: Story = {
  args: {
    density: 'comfortable',
    sizing: 'equal',
    columns: 2,
  },
  render: (args) => (
    <CompactFieldGrid {...args}>
      <SampleFields />
    </CompactFieldGrid>
  ),
};

export const FlowRows: Story = {
  args: {
    flow: 'rows',
    columns: 2,
    maxRowsPerColumn: 3,
  },
  render: (args) => (
    <CompactFieldGrid {...args}>
      <SampleFields />
    </CompactFieldGrid>
  ),
};
