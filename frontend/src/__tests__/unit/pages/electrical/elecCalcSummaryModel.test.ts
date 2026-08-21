import { describe, expect, it } from 'vitest';

import type { SystemSummaryBucket } from '@/components/electrical/ElectricalSummary';
import type { ElectricalStats } from '@/hooks/useElectricalStats';
import { buildElecCalcSummaryViewModel } from '@/pages/electrical/elecCalcSummaryModel';
import type { ElectricalCalcSummary, ElectricalPageSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

function object(id: string, isValid: boolean): ProjectObject {
  return {
    id,
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 1,
    version: 1,
    params: {},
    results: null,
    is_valid: isValid,
    validation_errors: null,
    created_at: '2026-05-31T00:00:00Z',
    updated_at: '2026-05-31T00:00:00Z',
  };
}

function calc(objectId: string, cableMarkSource: 'auto' | 'manual'): ElectricalCalcSummary {
  return {
    id: `calc-${objectId}`,
    project_id: 'project-1',
    object_id: objectId,
    cable_type: 'self_regulating',
    cable_mark: 'ТЛТ-10',
    cable_mark_source: cableMarkSource,
    variant_number: 1,
    results: {},
  };
}

/** Typed PDF §6.2 empty system bucket (no invent). */
function emptyBucket(overrides: Partial<SystemSummaryBucket> = {}): SystemSummaryBucket {
  return {
    objectCount: 0,
    cableLengthM: 0,
    sectionCount: null,
    powerW: 0,
    startCurrentA: 0,
    workingCurrentA: 0,
    ...overrides,
  };
}

function stats(overrides: Partial<ElectricalStats> = {}): ElectricalStats {
  return {
    calcByObjectId: {},
    validObjects: [],
    calcedCount: 0,
    failedCount: 0,
    allCalced: false,
    totalCableLength: 0,
    totalPower: 0,
    totalCurrent: 0,
    systemSummaries: {
      self_regulating: emptyBucket(),
      resistive: emptyBucket(),
      skin: emptyBucket(),
      total: emptyBucket(),
    },
    ...overrides,
  };
}

function pageSummary(overrides: Partial<ElectricalPageSummary> = {}): ElectricalPageSummary {
  return {
    total_objects: 100,
    valid_objects: 80,
    invalid_objects: 20,
    electrical_calculations_total: 7,
    calculated_count: 10,
    failed_count: 3,
    manual_cable_mark_count: 5,
    total_cable_length: 42.5,
    total_power: 999,
    total_current: 12.34,
    ...overrides,
  };
}

describe('buildElecCalcSummaryViewModel', () => {
  it('builds toolbar counts and labels from visible stats when backend summary is absent', () => {
    const objects = [
      object('object-1', true),
      object('object-2', false),
      object('object-3', true),
    ];
    const result = buildElecCalcSummaryViewModel({
      objects,
      elecCalcsCount: 2,
      selectedRowKeys: ['object-1', 'object-2'],
      stats: stats({
        calcByObjectId: {
          'object-2': calc('object-2', 'manual'),
          'object-3': calc('object-3', 'auto'),
        },
        validObjects: [objects[0], objects[2]],
        calcedCount: 2,
        failedCount: 1,
        totalCableLength: 15.25,
        totalPower: 1250,
        totalCurrent: 4.5,
      }),
      activeJobStatus: null,
    });

    expect(result.totalObjects).toBe(3);
    expect(result.validObjectsCount).toBe(2);
    expect(result.selectedValidObjectsCount).toBe(1);
    expect(result.selectedHeatLossFailedCount).toBe(1);
    expect(result.manualCableCount).toBe(1);
    expect(result.selectedManualCableCount).toBe(1);
    expect(result.summaryPowerDisplay).toBe('1.25 кВт');
    expect(result.bannerStats).toBe('15.3 м · 1.25 кВт · 4.50 А · рассчитано: 2/3');
    expect(result.selectedRecalcDisabled).toBe(false);
    expect(result.selectedRecalcTooltip).toBeUndefined();
    expect(result.selectedRecalcCountLabel).toBe('1/2');
    expect(result.sourceVariantCalculationCount).toBe(2);
    expect(result.projectObjectsForCopyCount).toBe(3);
  });

  it('prefers backend page summary for project-wide totals', () => {
    const result = buildElecCalcSummaryViewModel({
      pageSummary: pageSummary(),
      objects: [object('object-1', true)],
      elecCalcsCount: 1,
      selectedRowKeys: [],
      stats: stats({
        validObjects: [object('object-1', true)],
        calcedCount: 1,
        failedCount: 0,
        totalCableLength: 10,
        totalPower: 5000,
        totalCurrent: 1,
      }),
      activeJobStatus: null,
    });

    expect(result.totalObjects).toBe(100);
    expect(result.validObjectsCount).toBe(80);
    expect(result.calculatedCount).toBe(10);
    expect(result.failedCount).toBe(3);
    expect(result.manualCableCount).toBe(5);
    expect(result.summaryPowerDisplay).toBe('999 Вт');
    expect(result.bannerStats).toBe('42.5 м · 999 Вт · 12.34 А · рассчитано: 10/100');
    expect(result.sourceVariantCalculationCount).toBe(7);
    expect(result.projectObjectsForCopyCount).toBe(100);
  });

  it('prefers server system summaries over loaded-page aggregation', () => {
    const result = buildElecCalcSummaryViewModel({
      pageSummary: pageSummary({
        system_summaries: {
          self_regulating: { object_count: 7, cable_length_m: 70, section_count: 3, power_w: 700, start_current_a: 7, working_current_a: 5 },
          resistive: { object_count: 2, cable_length_m: 20, section_count: 2, power_w: 200, start_current_a: 2, working_current_a: 1 },
          skin: { object_count: 0, cable_length_m: 0, section_count: 0, power_w: 0, start_current_a: 0, working_current_a: 0 },
          total: { object_count: 9, cable_length_m: 90, section_count: 5, power_w: 900, start_current_a: 9, working_current_a: 6 },
        },
      }),
      objects: [object('object-1', true)], elecCalcsCount: 1, selectedRowKeys: [],
      stats: stats({ systemSummaries: { self_regulating: emptyBucket({ objectCount: 1 }), resistive: emptyBucket(), skin: emptyBucket(), total: emptyBucket({ objectCount: 1 }) } }),
      activeJobStatus: null,
    });
    expect(result.systemSummaries.total.objectCount).toBe(9);
    expect(result.systemSummaries.self_regulating.cableLengthM).toBe(70);
    expect(result.totalSections).toBe(5);
    expect(result.totalStartCurrentA).toBe(9);
  });

  it('keeps recalculation disabled while a job is active and formats progress', () => {
    const result = buildElecCalcSummaryViewModel({
      objects: [object('object-1', false)],
      elecCalcsCount: 0,
      selectedRowKeys: ['object-1'],
      stats: stats(),
      activeJobStatus: 'running',
      jobProgress: {
        current: 2,
        total: 10,
        phase: null,
        percent: null,
      },
    });

    expect(result.isJobActive).toBe(true);
    expect(result.selectedRecalcDisabled).toBe(true);
    expect(result.selectedRecalcTooltip).toBe(
      'Сначала рассчитайте теплопотери для выбранных объектов',
    );
    expect(result.jobProgressLabel).toBe('2/10');
    expect(result.bannerStats).toBe('расчёт не выполнен');
  });
});
