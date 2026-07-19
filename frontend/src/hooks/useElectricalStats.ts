import { useMemo } from 'react';
import {
  isElectricalCalcSuccess,
  electricalCalcError,
  isElectricalCalcStale,
  isElectricalCalcUnsupported,
} from '@/utils/calcStatus';
import type { ProjectObject } from '@/types/project';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ElectricalSystemSummaries, SystemSummaryBucket } from '@/components/electrical/ElectricalSummary';

function orderCableLength(calc: ElectricalCalcSummary) {
  const explicitRaw = calc.results?.order_cable_length;
  if (explicitRaw !== null && explicitRaw !== undefined && explicitRaw !== '') {
    const explicitLength = Number(explicitRaw);
    if (Number.isFinite(explicitLength)) return explicitLength;
  }
  return 0;
}

function emptyBucket(): SystemSummaryBucket {
  return {
    objectCount: 0,
    cableLengthM: 0,
    sectionCount: null,
    powerW: 0,
    startCurrentA: 0,
  };
}

function systemKeyOf(calc: ElectricalCalcSummary): 'self_regulating' | 'resistive' | 'skin' | null {
  const t = String(calc.cable_type || '').toLowerCase();
  if (t === 'self_regulating' || t === 'self_regulating_tt' || t === '') return 'self_regulating';
  if (t === 'single_core' || t === 'three_core' || t === 'resistive') return 'resistive';
  if (t === 'skin' || t === 'skin_effect') return 'skin';
  return null;
}

function addToBucket(bucket: SystemSummaryBucket, calc: ElectricalCalcSummary): void {
  bucket.objectCount += 1;
  bucket.cableLengthM += orderCableLength(calc);
  bucket.powerW += Number(calc.results?.total_power ?? 0);
  const start = Number(
    calc.results?.start_current
    ?? calc.results?.starting_current
    ?? calc.results?.current
    ?? 0,
  );
  bucket.startCurrentA += Number.isFinite(start) ? start : 0;
  // SEEDS empty: do not invent section counts from num_circuits.
  const sectionsRaw = calc.results?.section_count ?? calc.results?.num_sections;
  if (sectionsRaw !== null && sectionsRaw !== undefined && sectionsRaw !== '') {
    const n = Number(sectionsRaw);
    if (Number.isFinite(n) && n > 0) {
      bucket.sectionCount = (bucket.sectionCount ?? 0) + n;
    }
  }
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
  /** PDF UI-PDF-02: four system buckets (success only). */
  systemSummaries: ElectricalSystemSummaries;
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

    const self_regulating = emptyBucket();
    const resistive = emptyBucket();
    const skin = emptyBucket();
    for (const calc of successCalcs) {
      const key = systemKeyOf(calc);
      if (key === 'self_regulating') addToBucket(self_regulating, calc);
      else if (key === 'resistive') addToBucket(resistive, calc);
      else if (key === 'skin') addToBucket(skin, calc);
      else addToBucket(self_regulating, calc);
    }
    const total = emptyBucket();
    for (const calc of successCalcs) {
      addToBucket(total, calc);
    }
    // If no section catalog data at all, keep sectionCount null on buckets.
    for (const b of [self_regulating, resistive, skin, total]) {
      if (b.sectionCount === 0 && successCalcs.every((c) => {
        const raw = c.results?.section_count ?? c.results?.num_sections;
        return raw === null || raw === undefined || raw === '';
      })) {
        b.sectionCount = null;
      }
    }

    return {
      calcByObjectId,
      validObjects,
      calcedCount,
      failedCount,
      allCalced,
      totalCableLength,
      totalPower,
      totalCurrent,
      systemSummaries: { self_regulating, resistive, skin, total },
    };
  }, [objects, elecCalcs, selectedLegacyVariantNumber]);
}
