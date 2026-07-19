import { useMemo } from 'react';
import {
  isElectricalCalcSuccess,
  electricalCalcError,
  isElectricalCalcStale,
  isElectricalCalcUnsupported,
} from '@/utils/calcStatus';
import type { ProjectObject } from '@/types/project';
import type { ElectricalCalcSummary } from '@/types/calculation';

function orderCableLength(calc: ElectricalCalcSummary) {
  const explicitRaw = calc.results?.order_cable_length;
  if (explicitRaw !== null && explicitRaw !== undefined && explicitRaw !== '') {
    const explicitLength = Number(explicitRaw);
    if (Number.isFinite(explicitLength)) return explicitLength;
  }
  return 0;
}

export interface ElectricalStats {
  /** Мапа object_id → расчёт только выбранного ЭР. */
  calcByObjectId: Record<string, ElectricalCalcSummary>;
  /** Объекты, прошедшие теплотехнический расчёт (is_valid). */
  validObjects: ProjectObject[];
  /** Сколько объектов имеют успешный электрорасчёт. */
  calcedCount: number;
  /** Сколько объектов завершились с ошибкой электрорасчёта. */
  failedCount: number;
  /** true если все валидные объекты рассчитаны. */
  allCalced: boolean;
  /** Суммы по успешным расчётам — для ElectricalSummary. */
  totalCableLength: number;
  totalPower: number;
  totalCurrent: number;
}

/**
 * Чистая агрегация статистики страницы электрорасчёта.
 * Выделено из ElecCalcPage для тестируемости и чтобы страница отвечала
 * только за layout.
 */
export function useElectricalStats(
  objects: ProjectObject[],
  elecCalcs: ElectricalCalcSummary[],
  selectedLegacyVariantNumber?: number,
): ElectricalStats {
  return useMemo(() => {
    // Backend query is expected to be variant-scoped. The explicit guard also
    // prevents stale/foreign rows from influencing totals if a legacy response
    // or an accidentally broad cache contains more than one numeric slot.
    const scopedCalcs = selectedLegacyVariantNumber == null
      ? elecCalcs
      : elecCalcs.filter((calc) => calc.variant_number === selectedLegacyVariantNumber);
    const calcByObjectId = scopedCalcs.reduce<Record<string, ElectricalCalcSummary>>(
      (acc, c) => {
        acc[String(c.object_id)] = c;
        return acc;
      },
      {},
    );

    const validObjects = objects.filter((o) => o.is_valid);
    const calcedCount = objects.filter((o) =>
      isElectricalCalcSuccess(calcByObjectId[o.id]),
    ).length;
    const failedCount = objects.filter(
      (o) => {
        const calc = calcByObjectId[o.id];
        return !!electricalCalcError(calc)
          && !isElectricalCalcUnsupported(calc)
          && !isElectricalCalcStale(calc);
      },
    ).length;
    const allCalced = calcedCount > 0 && calcedCount === validObjects.length;

    const successCalcs = scopedCalcs.filter((c) => isElectricalCalcSuccess(c));
    const totalCableLength = successCalcs.reduce(
      (sum, c) => sum + orderCableLength(c),
      0,
    );
    const totalPower = successCalcs.reduce(
      (sum, c) => sum + Number(c.results?.total_power ?? 0),
      0,
    );
    const totalCurrent = successCalcs.reduce(
      (sum, c) => sum + Number(c.results?.current ?? 0),
      0,
    );

    return {
      calcByObjectId,
      validObjects,
      calcedCount,
      failedCount,
      allCalced,
      totalCableLength,
      totalPower,
      totalCurrent,
    };
  }, [objects, elecCalcs, selectedLegacyVariantNumber]);
}
