import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import HeatCalcWizardFormPanel from '@/pages/heatcalc/HeatCalcWizardFormPanel';
import type { ProjectObject } from '@/types/project';
import { getDefaultFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import {
  applyFormFieldDraft,
  type DraftRowsById,
} from '@/utils/heatCalcInlineEdit';

const wizardMock = vi.hoisted(() => ({
  latestProps: null as Record<string, unknown> | null,
}));

vi.mock('@/components/wizard/ObjectWizard', async () => {
  const React = await import('react');
  return {
    default: function FakeObjectWizard(props: Record<string, unknown>) {
      wizardMock.latestProps = props;
      const onDraftValuesChange = props.onDraftValuesChange as
        | ((changedValues: Record<string, unknown>, allValues: Record<string, unknown>) => void)
        | undefined;
      return React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'fake-object-wizard',
          onClick: () => onDraftValuesChange?.({ name: 'draft' }, { name: 'draft' }),
        },
        'wizard',
      );
    },
  };
});

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'pipe-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
    version: 1,
    params: { name: 'Труба DN100', outer_diameter: 0.1143 },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeProps(overrides: Partial<Parameters<typeof HeatCalcWizardFormPanel>[0]> = {}) {
  return {
    formBlockVisible: true,
    formPlacement: 'top',
    wizardState: { type: 'pipe' },
    newWizardRevision: 1,
    closeWizard: vi.fn(),
    handleWizardSubmit: vi.fn(),
    submittingObject: false,
    excelModeEnabled: false,
    wizardBaseObject: null,
    wizardFormObject: null,
    draftRowsById: {},
    wizardDraftFieldErrors: undefined,
    fieldInputSettings: getDefaultFieldInputSettings(),
    formSectionWeights: [1, 1, 1],
    onFormSectionWeightsChange: vi.fn(),
    onFormSectionWeightsCommit: vi.fn(),
    onDraftValuesChange: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof HeatCalcWizardFormPanel>[0];
}

describe('HeatCalcWizardFormPanel', () => {
  beforeEach(() => {
    wizardMock.latestProps = null;
  });

  it('keeps the existing shell classes and hidden state without mounting the wizard', () => {
    render(<HeatCalcWizardFormPanel {...makeProps({
      formBlockVisible: false,
      formPlacement: 'right',
    })}
    />);

    const shell = screen.getByLabelText('Блок заполнения параметров');
    expect(shell).toHaveClass('inline-form-shell');
    expect(shell).toHaveClass('heatcalc-form-pane--right');
    expect(shell).not.toBeVisible();
    expect(screen.queryByTestId('fake-object-wizard')).not.toBeInTheDocument();
  });

  it('passes draft-backed Excel form props through the lazy ObjectWizard', async () => {
    const record = makeObject();
    const draft = applyFormFieldDraft(null, record, 'name', 'Черновик трубы')!;
    const draftRowsById: DraftRowsById = { [record.id]: draft };
    const onDraftValuesChange = vi.fn();

    render(<HeatCalcWizardFormPanel {...makeProps({
      wizardState: { type: 'pipe', editingObject: record },
      excelModeEnabled: true,
      wizardBaseObject: record,
      wizardFormObject: {
        ...record,
        params: { ...record.params, name: 'Черновик трубы' },
      },
      draftRowsById,
      wizardDraftFieldErrors: { name: 'Ошибка имени' },
      onDraftValuesChange,
    })}
    />);

    const wizard = await screen.findByTestId('fake-object-wizard');
    expect(wizardMock.latestProps?.initialParams).toMatchObject({ name: 'Черновик трубы' });
    expect(wizardMock.latestProps?.initialFormValues).toMatchObject({ name: 'Черновик трубы' });
    expect(wizardMock.latestProps?.fieldErrors).toEqual({ name: 'Ошибка имени' });
    expect(wizardMock.latestProps?.sectionResizeEnabled).toBe(true);

    fireEvent.click(wizard);

    expect(onDraftValuesChange).toHaveBeenCalledWith({ name: 'draft' }, { name: 'draft' });
  });
});
