import { describe, expect, it } from 'vitest';
import {
  cableTechnicalSignature,
  externalLabelSourceForCableRow,
  hasIdenticalBuiltinCable,
  shouldShowExternalCableLabel,
  visibleCableRowsForSource,
  type CableCatalogRow,
} from '@/utils/cableCatalogSourceLabels';

describe('cableCatalogSourceLabels', () => {
  it('не помечает внешний саморег как внешний, если он технически совпадает со встроенным', () => {
    const builtin: CableCatalogRow = {
      source: 'builtin',
      brand: 'ТЛТ',
      model: 'ТЛТ-75',
      power_per_meter: 75,
      max_temperature: 110,
      min_temperature: -50,
      voltage: 220,
    };
    const duplicateExternal: CableCatalogRow = {
      source: 'extended',
      brand: 'ТЛТ',
      model: 'ТЛТ-75',
      power_per_meter: 75,
      max_temperature: 110,
      min_temperature: -50,
      params: { voltage: 220 },
    };

    expect(cableTechnicalSignature(duplicateExternal)).toBe(cableTechnicalSignature(builtin));
    expect(hasIdenticalBuiltinCable(duplicateExternal, [builtin])).toBe(true);
    expect(shouldShowExternalCableLabel(duplicateExternal, [builtin], 'all')).toBe(false);
    expect(visibleCableRowsForSource([builtin, duplicateExternal], [builtin], 'all')).toEqual([
      builtin,
    ]);
  });

  it('помечает уникальный внешний саморег только в смешанном режиме', () => {
    const builtin: CableCatalogRow = {
      source: 'builtin',
      brand: 'ТЛТ',
      model: 'ТЛТ-75',
      power_per_meter: 75,
      max_temperature: 110,
      min_temperature: -50,
      voltage: 220,
    };
    const external: CableCatalogRow = {
      source: 'extended',
      brand: 'ВНШ-СР',
      model: 'ВНШ-СР-18',
      power_per_meter: 18,
      max_temperature: 90,
      min_temperature: -55,
      params: { voltage: 220 },
    };

    expect(shouldShowExternalCableLabel(external, [builtin], 'extended')).toBe(false);
    expect(shouldShowExternalCableLabel(external, [builtin], 'all')).toBe(true);
  });

  it('сравнивает одножильные резистивные кабели по каноническим сопротивлению и сечению', () => {
    const builtin: CableCatalogRow = {
      source: 'builtin',
      brand: 'ТТ Р1',
      model: 'ТТ Р1 8000',
      resistance_ohm_km: 8000,
      conductor_section_mm2: 0.14,
      diameter_mm: 3.52,
    };
    const duplicateExternal: CableCatalogRow = {
      source: 'extended',
      brand: 'ТТ Р1',
      model: 'ТТ Р1 8000',
      resistance_per_meter: 8,
      conductor_cross_section: 0.14,
      diameter_mm: 3.52,
    };

    expect(hasIdenticalBuiltinCable(duplicateExternal, [builtin])).toBe(true);
    expect(visibleCableRowsForSource([builtin, duplicateExternal], [builtin], 'all')).toEqual([
      builtin,
    ]);
  });

  it('сравнивает трёхжильные резистивные кабели по каноническим алиасам', () => {
    const builtin: CableCatalogRow = {
      source: 'builtin',
      brand: 'ТТ Р3',
      model: 'ТТ Р3 х 4,0-1,0',
      resistance_ohm_km: 4.4,
      conductor_section_mm2: 4,
      nominal_size_mm: '3×4.0',
    };
    const duplicateExternal: CableCatalogRow = {
      source: 'extended',
      brand: 'ТТ Р3',
      model: 'ТТ Р3 х 4,0-1,0',
      params: {
        resistance_per_meter: 0.0044,
        conductor_cross_section: 4,
        nominal_size_mm: '3×4.0',
      },
    };

    expect(hasIdenticalBuiltinCable(duplicateExternal, [builtin])).toBe(true);
    expect(shouldShowExternalCableLabel(duplicateExternal, [builtin], 'all')).toBe(false);
  });

  it('сравнивает резистивные кабели с реальным fallback сопротивления по сечению', () => {
    const builtin: CableCatalogRow = {
      source: 'builtin',
      brand: 'ТТ Р3',
      model: 'ТТ Р3 х 4,0-1,0',
      nominal_size_mm: '23,60 х 10,40',
      max_temperature: 130,
      min_temperature: -60,
    };
    const duplicateExternal: CableCatalogRow = {
      source: 'extended',
      brand: 'ТТ Р3',
      model: 'ТТ Р3 х 4,0-1,0',
      resistance_per_meter: 0.004375,
      params: {
        conductor_section_mm2: 4,
        nominal_size_mm: '23,60 х 10,40',
      },
      max_temperature: 130,
      min_temperature: -60,
    };

    expect(cableTechnicalSignature(duplicateExternal)).toBe(cableTechnicalSignature(builtin));
    expect(hasIdenticalBuiltinCable(duplicateExternal, [builtin])).toBe(true);
    expect(visibleCableRowsForSource([builtin, duplicateExternal], [builtin], 'all')).toEqual([
      builtin,
    ]);
  });

  it('убирает внешние дубли из all-каталога даже если отдельный builtin-запрос ещё не пришёл', () => {
    const builtin: CableCatalogRow = {
      source: 'builtin',
      brand: 'ТТ Р3',
      model: 'ТТ Р3 х 1,0-0,6',
      nominal_size_mm: '13,68 х 7,46',
      max_temperature: 130,
      min_temperature: -60,
    };
    const duplicateExternal: CableCatalogRow = {
      source: 'extended',
      brand: 'ТТ Р3',
      model: 'ТТ Р3 х 1,0-0,6',
      resistance_per_meter: 0.0175,
      conductor_section_mm2: 1,
      nominal_size_mm: '13,68 х 7,46',
      max_temperature: 130,
      min_temperature: -60,
    };
    const uniqueExternal: CableCatalogRow = {
      source: 'extended',
      brand: 'КМСО',
      model: 'КМСО-1,5-25',
      resistance_per_meter: 12.5,
      conductor_section_mm2: 1.5,
      max_temperature: 90,
      min_temperature: -60,
    };

    expect(
      visibleCableRowsForSource([builtin, duplicateExternal, uniqueExternal], [], 'all'),
    ).toEqual([builtin, uniqueExternal]);
    expect(
      externalLabelSourceForCableRow(
        duplicateExternal,
        [builtin, duplicateExternal, uniqueExternal],
        [],
        'all',
      ),
    ).toBeNull();
    expect(
      externalLabelSourceForCableRow(
        uniqueExternal,
        [builtin, duplicateExternal, uniqueExternal],
        [],
        'all',
      ),
    ).toBe('extended');
  });

  it('оставляет метку внешнего кабеля, если технические параметры отличаются', () => {
    const builtin: CableCatalogRow = {
      source: 'builtin',
      brand: 'ТТ Р1',
      model: 'ТТ Р1 8000',
      resistance_ohm_km: 8000,
      conductor_section_mm2: 0.14,
    };
    const changedExternal: CableCatalogRow = {
      source: 'extended',
      brand: 'ТТ Р1',
      model: 'ТТ Р1 8000',
      resistance_per_meter: 7.5,
      conductor_section_mm2: 0.14,
    };

    expect(hasIdenticalBuiltinCable(changedExternal, [builtin])).toBe(false);
    expect(shouldShowExternalCableLabel(changedExternal, [builtin], 'all')).toBe(true);
  });
});
