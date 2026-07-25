import { useCallback, useMemo } from 'react';
import { Space } from 'antd';
import { TltBadge } from '@/components/ui-kit';

import type { CableInfo, CableSource } from '@/api/calculations';
import {
  AUTO_CABLE_MARK_VALUE,
  cableMarkOptionValue,
  catalogSourceFromSnapshot,
  externalCableOptionLabelSource,
  normalizeCableMarkOptionSource,
  normalizeCableSource,
  shouldShowProjectCableOption,
  type CableMarkOptionSource,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import type { CableStatusRow } from '@/pages/electrical/elecCalcCableCatalogModel';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { CableTtEntry, ResistiveCablesReference } from '@/types/reference';
import {
  visibleCableRowsForSource,
} from '@/utils/cableCatalogSourceLabels';

type UseElecCalcCableMarkOptionsOptions = {
  availableCableTypes: ReadonlySet<CableTypeKey>;
  cables: CableInfo[];
  builtinCables: CableInfo[];
  ttCables: CableTtEntry[];
  resistiveCables?: ResistiveCablesReference;
  builtinResistiveCables?: ResistiveCablesReference;
  effectiveSource: CableSource;
  aggressiveProduct: boolean;
  cableSizingEffectiveCableType: CableTypeKey;
};

export function useElecCalcCableMarkOptions({
  availableCableTypes,
  cables,
  builtinCables,
  ttCables,
  resistiveCables,
  builtinResistiveCables,
  effectiveSource,
  aggressiveProduct,
  cableSizingEffectiveCableType,
}: UseElecCalcCableMarkOptionsOptions) {
  const optionWithSourceLabel = useCallback((label: string, source?: CableMarkOptionSource | null) => {
    if (source !== 'extended' && source !== 'project') return label;
    const tag = source === 'extended'
      ? { tone: 'info' as const, label: 'внеш.' }
      : { tone: 'success' as const, label: 'проект' };
    return (
      <Space size={6}>
        <span>{label}</span>
        <TltBadge tone={tag.tone} className="electrical-inline-tag">{tag.label}</TltBadge>
      </Space>
    );
  }, []);
  const cableMarkOption = useCallback((
    mark: string,
    text: string,
    source?: string | null,
    disabled?: boolean,
    cableSource?: CableSource | null,
    displaySource?: CableMarkOptionSource | null,
  ): CableMarkSelectOption => ({
    value: cableMarkOptionValue(normalizeCableMarkOptionSource(source), mark),
    label: optionWithSourceLabel(
      text,
      displaySource === undefined ? normalizeCableMarkOptionSource(source) : displaySource,
    ),
    searchLabel: text,
    mark,
    optionSource: normalizeCableMarkOptionSource(source),
    cableSource: cableSource ?? normalizeCableSource(source) ?? undefined,
    disabled,
  }), [optionWithSourceLabel]);
  const autoCableMarkOption = useCallback((): CableMarkSelectOption => ({
    value: AUTO_CABLE_MARK_VALUE,
    label: 'Авто',
    searchLabel: 'Авто',
    mark: null,
    optionSource: 'builtin',
  }), []);
  const cableOptions = useMemo(
    () => visibleCableRowsForSource(cables, builtinCables, effectiveSource).map((c) => {
      const label = `${c.model} · ${c.power_per_meter ?? '—'} Вт/м`;
      return cableMarkOption(
        c.model ?? label,
        label,
        c.source,
        false,
        normalizeCableSource(c.source) ?? undefined,
        externalCableOptionLabelSource(c, cables, builtinCables, effectiveSource),
      );
    }),
    [builtinCables, cableMarkOption, cables, effectiveSource],
  );
  const manualCableOptionsForType = useCallback((type: CableTypeKey): CableMarkSelectOption[] => {
    if (!availableCableTypes.has(type)) return [];
    if (type === 'self_regulating') return cableOptions;
    if (type === 'self_regulating_tt') {
      // Первоисточник (Расчет_спецификации_трубы_самрег29_05_26.xlsx):
      // -СР = агрессивная среда, -СТ = неагрессивная.
      const suffix = aggressiveProduct ? 'СР' : 'СТ';
      return ttCables.map((c) => {
        const value = `${c.model}-${suffix}`;
        return cableMarkOption(
          value,
          `${value} · ${c.series} · ${c.nominal_power} Вт/м`,
          (c as { source?: string | null }).source,
        );
      });
    }
    if (type === 'single_core') {
      const rows = resistiveCables?.single_core ?? [];
      const builtinRows = builtinResistiveCables?.single_core ?? [];
      return visibleCableRowsForSource(rows, builtinRows, effectiveSource)
        .filter((c) => typeof c.model === 'string')
        .map((c) => {
          const row = c as CableStatusRow & { model: string };
          return cableMarkOption(
            row.model,
            `${row.model} · ${row.resistance_ohm_km ?? '—'} Ом/км`,
            row.source,
            false,
            normalizeCableSource(row.source) ?? undefined,
            externalCableOptionLabelSource(
              row,
              rows,
              builtinRows,
              effectiveSource,
            ),
          );
        });
    }
    if (type === 'three_core') {
      const rows = resistiveCables?.three_core ?? [];
      const builtinRows = builtinResistiveCables?.three_core ?? [];
      return visibleCableRowsForSource(rows, builtinRows, effectiveSource)
        .filter((c) => typeof c.model === 'string')
        .map((c) => {
          const row = c as CableStatusRow & { model: string };
          return cableMarkOption(
            row.model,
            `${row.model} · ${row.resistance_ohm_km ?? '—'} Ом/км · ${row.nominal_size_mm ?? '—'}`,
            row.source,
            false,
            normalizeCableSource(row.source) ?? undefined,
            externalCableOptionLabelSource(
              row,
              rows,
              builtinRows,
              effectiveSource,
            ),
          );
        });
    }
    return [];
  }, [
    aggressiveProduct,
    availableCableTypes,
    builtinResistiveCables,
    cableMarkOption,
    cableOptions,
    effectiveSource,
    resistiveCables,
    ttCables,
  ]);
  const cableMarkOptionsFor = useCallback((
    type: CableTypeKey,
    mark?: string,
    calc?: ElectricalCalcSummary,
  ) => {
    const manualOptions = manualCableOptionsForType(type);
    const savedSource = catalogSourceFromSnapshot(calc);
    const matchingCatalogOption = mark
      ? manualOptions.find((option) =>
          option.mark === mark && (!savedSource || option.cableSource === savedSource))
        ?? manualOptions.find((option) => option.mark === mark)
      : undefined;
    const projectOption = mark && shouldShowProjectCableOption(calc)
      ? cableMarkOption(
          mark,
          `${mark} · сохранён в проекте`,
          'project',
          false,
          savedSource ?? matchingCatalogOption?.cableSource ?? effectiveSource,
        )
      : null;
    // Сохранённая марка может не совпасть ни с одной сгенерированной опцией
    // (например, суффикс -СР/-СТ из расчёта при другом положении переключателя
    // агрессивности) — без fallback модалка теряла кабель и характеристики.
    const savedMarkFallbackOption = mark && !matchingCatalogOption && !projectOption
      ? cableMarkOption(
          mark,
          `${mark} · сохранён в расчёте`,
          savedSource ?? effectiveSource,
          false,
          savedSource ?? effectiveSource,
        )
      : null;
    return [
      autoCableMarkOption(),
      ...(projectOption ? [projectOption] : []),
      ...(savedMarkFallbackOption ? [savedMarkFallbackOption] : []),
      ...manualOptions,
    ];
  }, [autoCableMarkOption, cableMarkOption, effectiveSource, manualCableOptionsForType]);
  const cableSizingManualOptions = useMemo(
    () => manualCableOptionsForType(cableSizingEffectiveCableType),
    [cableSizingEffectiveCableType, manualCableOptionsForType],
  );

  return {
    cableMarkOption,
    autoCableMarkOption,
    cableOptions,
    manualCableOptionsForType,
    cableMarkOptionsFor,
    cableSizingManualOptions,
  };
}
