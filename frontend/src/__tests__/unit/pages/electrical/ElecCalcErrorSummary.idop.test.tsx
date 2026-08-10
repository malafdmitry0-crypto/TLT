import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ElecCalcErrorSummary from '@/pages/electrical/ElecCalcErrorSummary';
import { getElectricalErrorGuidance } from '@/utils/electricalErrorGuidance';

describe('ElecCalcErrorSummary Iдоп guidance', () => {
  it('shows a Russian project-level explanation instead of the backend code', () => {
    const guidance = getElectricalErrorGuidance({
      error: 'SECTION_CURRENT_LIMIT_REQUIRED',
      errorCode: 'SECTION_CURRENT_LIMIT_REQUIRED',
    });

    render(
      <ElecCalcErrorSummary
        failedCount={1}
        activeRowId="object-1"
        item={{
          objectId: 'object-1',
          rowNumber: 1,
          objectName: 'Труба 1',
          error: 'SECTION_CURRENT_LIMIT_REQUIRED',
          cableType: 'self_regulating_tt',
          errorContext: null,
          errorCode: 'SECTION_CURRENT_LIMIT_REQUIRED',
          suggestedActions: null,
        }}
        guidance={guidance}
      />,
    );

    expect(screen.getByText(
      'Задайте допустимый стартовый ток одной секции в настройках проекта',
    )).toBeInTheDocument();
    expect(screen.getByText('Задать Iдоп проекта')).toBeInTheDocument();
    expect(screen.queryByText('Проверить параметры объекта')).not.toBeInTheDocument();
    expect(screen.queryByText('SECTION_CURRENT_LIMIT_REQUIRED')).not.toBeInTheDocument();
  });
});
