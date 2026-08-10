/**
 * @module specification/settings-form-hydration
 * @owner specification
 */
import { useEffect } from 'react';
import { buildSpecSettingsFormSnapshot } from '@/pages/specification/specGenerationOptionsSyncModel';
import type { useSpecPageFormState } from '@/pages/specification/useSpecPageFormState';
import type { Specification } from '@/types/specification';

type SpecForm = ReturnType<typeof useSpecPageFormState>;

export function useSpecSettingsFormHydration(
  spec: Specification | null | undefined,
  form: SpecForm,
) {
  useEffect(() => {
    const opts = spec?.snapshot?.resolved_options ?? {};
    const snapshot = buildSpecSettingsFormSnapshot(opts);
    form.setExZone(snapshot.exZone);
    form.setReserveCoeff(snapshot.reserveCoeff);
    form.setIndicationOnBoxes(snapshot.indicationOnBoxes);
    form.setEndSectionIndication(snapshot.endSectionIndication);
    form.setTopIndication(snapshot.topIndication);
    form.setMinLengthK2i(snapshot.minLengthK2i);
    form.setGroupingMode(snapshot.groupingMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- state setters are stable
  }, [
    spec?.id,
    spec?.snapshot?.resolved_options,
  ]);
}
