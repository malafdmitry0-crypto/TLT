import type { ProjectObject } from '@/types/project';
import { formatNumber } from '@/utils/formatters';
import {
  normalizeCalculationDetailsSettings,
  type HeatCalcCalculationDetailMetric,
  type HeatCalcCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';
import { sourceSuffix, sourceText } from '@/utils/heatCalcPageUtils';

interface HeatCalcAssumptionsPanelProps {
  calculationDetailsSettings: HeatCalcCalculationDetailsSettings;
  selectedObject?: ProjectObject | null;
}

export default function HeatCalcAssumptionsPanel({
  calculationDetailsSettings,
  selectedObject,
}: HeatCalcAssumptionsPanelProps) {
  const selectedResults = selectedObject?.results as Record<string, unknown> | undefined;
  const selectedParams = selectedObject?.params as Record<string, unknown> | undefined;
  if (!selectedObject || !selectedResults) return null;

  const resultValue = (key: string, digits = 3) => {
    const value = Number(selectedResults[key]);
    return Number.isFinite(value) ? formatNumber(value, digits) : '—';
  };
  const paramValue = (key: string, digits = 1) => {
    const value = Number(selectedParams?.[key]);
    return Number.isFinite(value) ? formatNumber(value, digits) : '—';
  };
  const resultDetailValue = (key: string, digits: number, unit = '') => {
    const value = resultValue(key, digits);
    return value === '—' ? '—' : `${value}${unit}`;
  };

  const isPipe = selectedObject.object_type === 'pipe';
  const isUnderground = selectedParams?.placement === 'underground'
    || (!isPipe && selectedParams?.burial_depth != null);
  const enabledMetrics = new Set(normalizeCalculationDetailsSettings(calculationDetailsSettings).visibleMetrics);
  const details: Array<{ key: string; label: string; value: string }> = [];

  function addDetail(metric: HeatCalcCalculationDetailMetric, label: string, value: string) {
    if (!enabledMetrics.has(metric) || value === '—') return;
    details.push({ key: metric, label, value });
  }

  const processTemperature = Number(selectedParams?.process_temperature);
  const mediumTemperature = Number(isPipe && isUnderground
    ? selectedParams?.ground_temperature
    : selectedParams?.ambient_temperature);
  if (Number.isFinite(processTemperature) && Number.isFinite(mediumTemperature)) {
    addDetail('delta_t', 'ΔT', `${formatNumber(processTemperature - mediumTemperature, 0)}°C`);
  }

  addDetail('applied_alpha_vnesh', 'α примен.', resultDetailValue('alpha_vnesh_applied', 1, ' Вт/м²К'));
  addDetail('applied_safety_factor', 'Kзап примен.', resultValue('safety_factor_applied', 2));
  addDetail(
    'insulation_resistance',
    'Rиз',
    resultValue(isPipe
      ? 'insulation_resistance'
      : 'insulation_resistance_areal_bare', 4),
  );

  if (isPipe) {
    addDetail('external_resistance', isUnderground ? 'Rгр' : 'Rвнеш', resultValue('external_resistance', 4));
    addDetail('effective_length', 'Lэфф', resultDetailValue('effective_length', 1, ' м'));
    addDetail('wall_resistance', 'Rст', resultValue('wall_resistance', 4));
    addDetail('thermal_resistance', 'RΣ', resultValue('thermal_resistance', 4));
  } else {
    addDetail(
      'external_resistance',
      'Rвнеш',
      resultValue('external_resistance_areal_bare', 4),
    );
    if (isUnderground) {
      addDetail('ground_resistance', 'Rгр', resultValue('ground_resistance_areal_bare', 4));
    }
    addDetail('surface_area_bare', 'Sпов.', resultDetailValue('surface_area_bare', 1, ' м²'));
    addDetail(
      'wall_resistance',
      'Rст',
      resultValue('wall_resistance_areal_bare', 4),
    );
    if (isUnderground) {
      addDetail('air_surface_area', 'Sвозд', resultDetailValue('air_surface_area', 1, ' м²'));
      addDetail('ground_surface_area', 'Sгр', resultDetailValue('ground_surface_area', 1, ' м²'));
    }
  }

  const windSpeed = Number(selectedResults.wind_speed_applied);
  if (Number.isFinite(windSpeed)) {
    addDetail('wind_speed', 'ветер', `${formatNumber(windSpeed, 1)} м/с`);
  }
  if (sourceSuffix(selectedParams?.ambient_temperature_source)) {
    const ambientValue = paramValue('ambient_temperature', 0);
    if (ambientValue !== '—') {
      addDetail(
        'temperature_source',
        'T окр.',
        `${ambientValue}°C${sourceSuffix(selectedParams?.ambient_temperature_source)}`,
      );
    }
  }
  if (sourceSuffix(selectedParams?.wind_speed_source)) {
    addDetail('wind_speed_source', 'ветер ист.', sourceText(selectedParams?.wind_speed_source));
  }
  if (isUnderground) {
    addDetail('ground_conductivity', 'λгр', resultDetailValue('ground_conductivity_applied', 2, ' Вт/мК'));
  }

  if (details.length === 0) return null;

  return (
    <div className="calc-assumptions-panel">
      <strong>Расшифровка расчёта:</strong>
      {details.map((detail) => (
        <span key={`${detail.key}:${detail.label}`}>{detail.label}: {detail.value}</span>
      ))}
    </div>
  );
}
