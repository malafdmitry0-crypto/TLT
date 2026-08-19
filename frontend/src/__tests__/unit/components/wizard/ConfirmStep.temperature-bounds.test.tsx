import { Form } from 'antd';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ConfirmStep from '@/components/wizard/steps/ConfirmStep';
import type { ObjectType } from '@/constants/objectTypes';

const minimumLabel = 'Минимальная температура окружающей среды';
const maximumLabel = 'Максимальная температура окружающей среды';

function renderConfirm(
  objectType: ObjectType,
  temperatureValues: Record<string, unknown>,
) {
  return render(
    <Form initialValues={{
      name: 'Объект',
      outer_diameter_mm: 108,
      pipe_length: 10,
      shape: 'cylindrical',
      diameter_mm: 1000,
      height_mm: 2000,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      process_temperature: 80,
      ambient_temperature: -20,
      ...temperatureValues,
    }}>
      <ConfirmStep objectType={objectType} />
    </Form>,
  );
}

describe('ConfirmStep ambient temperature bounds', () => {
  it('shows distinct minimum and optional maximum for an outdoor pipe', () => {
    renderConfirm('pipe', { placement: 'outdoor', max_ambient_temperature: 0 });

    expect(screen.getByText(minimumLabel)).toBeInTheDocument();
    expect(screen.getByText(maximumLabel)).toBeInTheDocument();
    expect(screen.getByText('0°C')).toBeInTheDocument();
  });

  it('omits an empty maximum and both inapplicable underground-pipe bounds', () => {
    const empty = renderConfirm('pipe', { placement: 'outdoor' });
    expect(screen.getByText(minimumLabel)).toBeInTheDocument();
    expect(screen.queryByText(maximumLabel)).not.toBeInTheDocument();
    empty.unmount();

    renderConfirm('pipe', { placement: 'underground', max_ambient_temperature: 30 });
    expect(screen.queryByText(minimumLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(maximumLabel)).not.toBeInTheDocument();
  });

  it('keeps both bounds for an underground tank', () => {
    renderConfirm('tank', { placement: 'underground', max_ambient_temperature: 25 });

    expect(screen.getByText(minimumLabel)).toBeInTheDocument();
    expect(screen.getByText(maximumLabel)).toBeInTheDocument();
    expect(screen.getByText('25°C')).toBeInTheDocument();
  });
});
