import { describe, expect, it } from 'vitest';

import {
  getHeatCalcElectricalContinueBlockMessage,
  getHeatCalcElectricalContinueState,
} from '@/pages/heatcalc/heatCalcContinueToElectricalModel';

describe('getHeatCalcElectricalContinueState', () => {
  it('blocks empty project', () => {
    const state = getHeatCalcElectricalContinueState([]);
    expect(state).toMatchObject({
      objectCount: 0,
      invalidCount: 0,
      ready: false,
      disabled: true,
      tooltip: 'Добавьте объекты',
    });
  });

  it('blocks when any object is invalid', () => {
    const state = getHeatCalcElectricalContinueState([
      { is_valid: true },
      { is_valid: false },
    ]);
    expect(state.ready).toBe(false);
    expect(state.disabled).toBe(false);
    expect(state.invalidCount).toBe(1);
    expect(state.tooltip).toContain('1 объект(ов) с ошибками');
  });

  it('ready when all objects valid', () => {
    const state = getHeatCalcElectricalContinueState([
      { is_valid: true },
      { is_valid: true },
    ]);
    expect(state).toMatchObject({
      objectCount: 2,
      invalidCount: 0,
      ready: true,
      disabled: false,
    });
    expect(state.tooltip).toContain('Электротехнический расчёт');
  });
});

describe('getHeatCalcElectricalContinueBlockMessage', () => {
  it('returns null when ready', () => {
    expect(getHeatCalcElectricalContinueBlockMessage({
      ready: true,
      objectCount: 1,
      invalidCount: 0,
    })).toBeNull();
  });

  it('warns on empty', () => {
    expect(getHeatCalcElectricalContinueBlockMessage({
      ready: false,
      objectCount: 0,
      invalidCount: 0,
    })).toEqual({
      level: 'warning',
      text: 'Добавьте хотя бы один объект перед электрорасчётом',
    });
  });

  it('errors on invalid objects', () => {
    expect(getHeatCalcElectricalContinueBlockMessage({
      ready: false,
      objectCount: 3,
      invalidCount: 2,
    })).toEqual({
      level: 'error',
      text: 'Нельзя перейти: объектов с ошибками — 2. Исправьте исходные данные.',
    });
  });
});
