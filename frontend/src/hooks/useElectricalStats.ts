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

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstFinite(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

function installedCableLength(calc: ElectricalCalcSummary) {
  const layout = recordValue(calc.results?.layout);
  return firstFinite(
    layout.actual_installed_length_m,
    calc.results?.installed_cable_length,
  ) ?? 0;
}

function calculationTotalPower(calc: ElectricalCalcSummary) {
  const electrical = recordValue(calc.results?.electrical);
  return firstFinite(electrical.total_power_w, calc.results?.total_power) ?? 0;
}

function workingCurrent(calc: ElectricalCalcSummary) {
  const electrical = recordValue(calc.results?.electrical);
  return firstFinite(
    electrical.working_current_a,
    calc.results?.working_current,
    calc.results?.section_working_current_a,
    calc.results?.current,
  ) ?? 0;
}

function startCurrent(calc: ElectricalCalcSummary) {
  const electrical = recordValue(calc.results?.electrical);
  return firstFinite(
    electrical.start_current_a,
    calc.results?.start_current,
    calc.results?.starting_current,
    calc.results?.section_start_current_a,
  ) ?? 0;
}

function sectionCount(calc: ElectricalCalcSummary): number | undefined {
  const sectionPlan = recordValue(calc.results?.section_plan);
  return firstFinite(
    sectionPlan.count,
    calc.results?.section_count,
    calc.results?.num_sections,
  );
}

function emptyBucket(): SystemSummaryBucket {
  return {
    objectCount: 0,
    cableLengthM: 0,
    sectionCount: null,
    powerW: 0,
    startCurrentA: 0,
    workingCurrentA: 0,
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
  bucket.cableLengthM += installedCableLength(calc);
  bucket.powerW += calculationTotalPower(calc);
  bucket.workingCurrentA += workingCurrent(calc);
  // Do not fall back to working current for start — show 0 if unknown.
  bucket.startCurrentA += startCurrent(calc);
  // Real section_count from Phase-4 catalog only (not num_circuits).
  const sections = sectionCount(calc);
  if (sections !== undefined && sections > 0) {
    bucket.sectionCount = (bucket.sectionCount ?? 0) + sections;
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
      (sum, c) => sum + installedCableLength(c),
      0,
    );
    const totalPower = successCalcs.reduce(
      (sum, c) => sum + calculationTotalPower(c),
      0,
    );
    const totalCurrent = successCalcs.reduce(
      (sum, c) => sum + workingCurrent(c),
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
        return sectionCount(c) === undefined;
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
