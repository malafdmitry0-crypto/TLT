import type { Meta, StoryObj } from '@storybook/react-vite';
import { SpecificationReadinessAlert } from './SpecificationReadinessAlert';

const meta = {
  title: 'Specification/ReadinessAlert',
  component: SpecificationReadinessAlert,
  args: {
    onRecovery: () => undefined,
    onRetry: () => undefined,
    blocker: null,
  },
} satisfies Meta<typeof SpecificationReadinessAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = { args: { state: 'loading' } };

export const BlockedElectrical: Story = {
  args: {
    state: 'blocked',
    blocker: {
      code: 'SPEC_VARIANT_NOT_READY',
      kind: 'blocking',
      message: 'Назначение ЭР не готово к формированию спецификации',
      source_stage: 'electrical',
      scope: 'electrical_variant',
      electrical_variant_id: '3e4f22b3-14ac-4a9d-892c-7d9e85a21c2e',
      electrical_variant_name: 'ЭР1',
      reason: 'project_section_current_limit_changed',
      count: 6,
      object_ids: [],
      next_action: 'open_electrical_variant',
    },
  },
};

export const Unavailable: Story = { args: { state: 'unavailable' } };
