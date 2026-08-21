/**
 * @module heatcalc/continue-to-electrical-model
 * @owner heat
 * @depends none
 * @does-not electrical page modules
 *
 * PDF-HEAT-10 / PDF §5.13: readiness for Heat → Electrical transition.
 */

export type HeatCalcElectricalContinueObject = {
  is_valid: boolean;
};

export type HeatCalcElectricalContinueState = {
  objectCount: number;
  invalidCount: number;
  ready: boolean;
  disabled: boolean;
  tooltip: string;
};

export type HeatCalcElectricalContinueBlockMessage = {
  level: 'warning' | 'error';
  text: string;
};

/** Derive toolbar enablement/tooltip for «Далее → Электротехнический расчёт». */
export function getHeatCalcElectricalContinueState(
  objects: readonly HeatCalcElectricalContinueObject[],
): HeatCalcElectricalContinueState {
  const objectCount = objects.length;
  const invalidCount = objects.filter((obj) => !obj.is_valid).length;
  const ready = objectCount > 0 && invalidCount === 0;
  const disabled = objectCount === 0;
  const tooltip = objectCount === 0
    ? 'Добавьте объекты'
    : invalidCount > 0
      ? `Есть ${invalidCount} объект(ов) с ошибками — исправьте перед переходом`
      : 'Далее → Электротехнический расчёт (PDF §5.13)';

  return {
    objectCount,
    invalidCount,
    ready,
    disabled,
    tooltip,
  };
}

/** User-facing block message when continue is not ready; null when ready. */
export function getHeatCalcElectricalContinueBlockMessage(
  state: Pick<HeatCalcElectricalContinueState, 'ready' | 'objectCount' | 'invalidCount'>,
): HeatCalcElectricalContinueBlockMessage | null {
  if (state.ready) return null;
  if (state.objectCount === 0) {
    return {
      level: 'warning',
      text: 'Добавьте хотя бы один объект перед электрорасчётом',
    };
  }
  return {
    level: 'error',
    text: `Нельзя перейти: объектов с ошибками — ${state.invalidCount}. Исправьте исходные данные.`,
  };
}
