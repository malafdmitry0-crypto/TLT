import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ElecCalcErrorSummary from '@/pages/electrical/ElecCalcErrorSummary';
import { getElectricalErrorGuidance } from '@/utils/electricalErrorGuidance';

describe('ElecCalcErrorSummary I доп guidance', () => {
  it('shows concrete cable temperature limits instead of formula symbols', () => {
    const backendError = 'Температуры объекта находятся вне допустимого диапазона кабелей';
    const errorContext = {
      outer_diameter_mm: 89,
      ambient_temperature_c: -41,
      cold_start_temperature_c: -20,
      climate_city: 'Москва',
      climate_temperature_basis: 't_abs_min',
      climate_policy_rule: 'pipe_diameter_lt_100',
      minimum_supported_ambient_temperature_c: -40,
      product_temperature_c: 151,
      maximum_supported_product_temperature_c: 150,
      violations: ['ambient_below_minimum', 'product_above_maximum'],
    };
    const guidance = getElectricalErrorGuidance({
      error: backendError,
      errorCode: 'ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED',
      errorContext,
      suggestedActions: ['CHECK_AMBIENT_TEMPERATURE', 'CHECK_PROCESS_TEMPERATURE'],
    });

    render(
      <ElecCalcErrorSummary
        failedCount={1}
        activeRowId="pipe-1"
        item={{
          stage: 'electrical',
          objectId: 'pipe-1',
          rowNumber: 2,
          objectName: 'Труба 2',
          error: backendError,
          cableType: 'self_regulating_tt',
          errorContext,
          errorCode: 'ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED',
          suggestedActions: ['CHECK_AMBIENT_TEMPERATURE', 'CHECK_PROCESS_TEMPERATURE'],
        }}
        guidance={guidance}
      />,
    );

    const region = screen.getByLabelText('Сообщения об ошибках объектов');
    expect(region).toHaveTextContent('Температура окружающей среды -41 °C');
    expect(region).toHaveTextContent('минимум -40 °C');
    expect(region).toHaveTextContent('Температура продукта 151 °C');
    expect(region).toHaveTextContent('максимум 150 °C');
    const diagnostics = screen.getByLabelText('Диагностические параметры электрорасчёта');
    expect(diagnostics).toHaveTextContent('D 89 мм');
    expect(diagnostics).toHaveTextContent('T среды -41 °C');
    expect(diagnostics).toHaveTextContent('Tвкл -20 °C');
    expect(diagnostics).toHaveTextContent('Москва · t_abs_min');
    expect(region).not.toHaveTextContent('T_env');
    expect(region).not.toHaveTextContent('T_product');
  });

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
          stage: 'electrical',
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
    expect(screen.getByText('Задать I доп проекта')).toBeInTheDocument();
    expect(screen.queryByText('Проверить параметры объекта')).not.toBeInTheDocument();
    expect(screen.queryByText('SECTION_CURRENT_LIMIT_REQUIRED')).not.toBeInTheDocument();
  });

  it('replaces the tank pipe-layout backend error with actionable Russian copy', () => {
    const backendError = 'Tank layout does not accept pipe winding inputs';
    const guidance = getElectricalErrorGuidance({
      error: backendError,
      errorCode: 'ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED',
      suggestedActions: ['SET_TANK_LAYOUT'],
    });

    render(
      <ElecCalcErrorSummary
        failedCount={1}
        activeRowId="tank-1"
        item={{
          stage: 'electrical',
          objectId: 'tank-1',
          rowNumber: 3,
          objectName: 'Р-601 отстойник',
          error: backendError,
          cableType: 'self_regulating_tt',
          errorContext: { fields: ['winding_pitch'] },
          errorCode: 'ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED',
          suggestedActions: ['SET_TANK_LAYOUT'],
        }}
        guidance={guidance}
      />,
    );

    const region = screen.getByLabelText('Сообщения об ошибках объектов');
    expect(region).toHaveTextContent('Для резервуара нельзя задавать трубный шаг намотки');
    expect(region).toHaveTextContent('Неверная укладка резервуара');
    expect(region).toHaveTextContent('Выбрать геометрию укладки');
    expect(region).not.toHaveTextContent(backendError);
    expect(region).not.toHaveTextContent('Проверить параметры объекта');
  });

  it('shows the object, heat stage, backend reason and recovery action', () => {
    render(
      <ElecCalcErrorSummary
        failedCount={1}
        activeRowId="object-2"
        item={{
          stage: 'heat',
          objectId: 'object-2',
          rowNumber: 2,
          objectName: 'Труба без диаметра',
          error: 'Заполните обязательные поля объекта\nНе заполнено: Наружный диаметр',
          cableType: null,
          errorContext: null,
          errorCode: 'missing_required_fields',
          suggestedActions: null,
        }}
        guidance={null}
      />,
    );

    const region = screen.getByLabelText('Сообщения об ошибках объектов');
    expect(region).toHaveTextContent('Тепловой расчёт');
    expect(region).toHaveTextContent('Объект 2: Труба без диаметра');
    expect(region).toHaveTextContent('Не заполнено: Наружный диаметр');
    expect(region).toHaveTextContent('Исправить исходные данные и выполнить расчёт теплопотерь');
  });
});
