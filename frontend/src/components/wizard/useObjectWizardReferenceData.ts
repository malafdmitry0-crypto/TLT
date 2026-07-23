/**
 * @module wizard/object-wizard-reference-data
 * @owner heat
 * @depends reference queries, option builders, climate key index
 * @does-not form ownership, validation timing, InsulationLayersTable, formulas
 *
 * WIZ1: reference queries + option/index derivation for ObjectWizard.
 * Lazy climate/soil loading flags stay co-located with their queries.
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getClimate, getInsulation, getPipeMaterials, getSoilConductivity } from '@/api/references';
import {
  buildInsulationReferenceOptions,
  buildPipeMaterialReferenceOptions,
  buildSoilReferenceOptions,
} from '@/utils/referenceOptions';
import { climateKey } from './objectWizardClimateModel';

export type UseObjectWizardReferenceDataInput = {
  selectedClimateKey: string;
  selectedGroundType: string;
  secondInsulationMaterial: string;
  thirdInsulationMaterial: string;
};

export function useObjectWizardReferenceData({
  selectedClimateKey,
  selectedGroundType,
  secondInsulationMaterial,
  thirdInsulationMaterial,
}: UseObjectWizardReferenceDataInput) {
  const [climateReferenceRequested, setClimateReferenceRequested] = useState(false);
  const [soilReferenceRequested, setSoilReferenceRequested] = useState(false);

  const {
    data: insulationMaterials = [],
    isError: insulationMaterialsError,
    isFetching: isInsulationMaterialsFetching,
  } = useQuery({
    queryKey: referenceQueryKeys.insulation,
    queryFn: getInsulation,
    ...referenceQueryOptions,
  });
  const { data: pipeMaterials = [] } = useQuery({
    queryKey: referenceQueryKeys.pipeMaterials,
    queryFn: getPipeMaterials,
    ...referenceQueryOptions,
  });
  const { data: climateEntries = [], isFetching: isClimateFetching } = useQuery({
    queryKey: referenceQueryKeys.climate,
    queryFn: getClimate,
    enabled: climateReferenceRequested || selectedClimateKey.length > 0,
    ...referenceQueryOptions,
  });
  const { data: soilEntries = [], isFetching: isSoilFetching } = useQuery({
    queryKey: referenceQueryKeys.soilConductivity,
    queryFn: getSoilConductivity,
    enabled: soilReferenceRequested || selectedGroundType.length > 0,
    ...referenceQueryOptions,
  });

  const insulationMaterialOptions = useMemo(
    () => [
      ...buildInsulationReferenceOptions(insulationMaterials),
      { value: 'other', label: 'Другое' },
    ],
    [insulationMaterials],
  );
  const pipeMaterialOptions = useMemo(
    () => [
      ...(pipeMaterials.length > 0
        ? buildPipeMaterialReferenceOptions(pipeMaterials)
        : [{ value: 'carbon_steel', label: 'Углеродистая сталь' }]),
      { value: 'other', label: 'Другой материал' },
    ],
    [pipeMaterials],
  );
  const climateOptions = useMemo(
    () => climateEntries.map((entry) => ({
      value: climateKey(entry),
      label: `${entry.city ?? entry.region} · ${entry.region}`,
      group: entry.region,
    })),
    [climateEntries],
  );
  // Lookup-таблица вместо линейного .find по 539 городам на каждый рендер формы.
  const climateByKey = useMemo(() => {
    const map = new Map<string, (typeof climateEntries)[number]>();
    for (const entry of climateEntries) map.set(climateKey(entry), entry);
    return map;
  }, [climateEntries]);
  const selectedClimate = useMemo(
    () => (selectedClimateKey ? climateByKey.get(selectedClimateKey) : undefined),
    [climateByKey, selectedClimateKey],
  );
  const soilOptions = useMemo(
    () => buildSoilReferenceOptions(soilEntries),
    [soilEntries],
  );
  const insulationByMaterial = useMemo(() => {
    const map = new Map<string, (typeof insulationMaterials)[number]>();
    for (const material of insulationMaterials) map.set(material.material, material);
    return map;
  }, [insulationMaterials]);
  const selectedSecondInsulation = useMemo(
    () => (secondInsulationMaterial ? insulationByMaterial.get(secondInsulationMaterial) : undefined),
    [insulationByMaterial, secondInsulationMaterial],
  );
  const selectedThirdInsulation = useMemo(
    () => (thirdInsulationMaterial ? insulationByMaterial.get(thirdInsulationMaterial) : undefined),
    [insulationByMaterial, thirdInsulationMaterial],
  );

  const requestClimateReference = useCallback(() => {
    setClimateReferenceRequested(true);
  }, []);
  const requestSoilReference = useCallback(() => {
    setSoilReferenceRequested(true);
  }, []);

  return {
    insulationMaterials,
    insulationMaterialsError,
    isInsulationMaterialsFetching,
    insulationMaterialOptions,
    pipeMaterialOptions,
    climateOptions,
    isClimateFetching,
    selectedClimate,
    soilOptions,
    isSoilFetching,
    selectedSecondInsulation,
    selectedThirdInsulation,
    requestClimateReference,
    requestSoilReference,
  };
}
