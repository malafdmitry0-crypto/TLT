/**
 * Outer insulation layer field configs (layer 2 / 3) for InsulationLayersTable.
 * Kept separate from the row component so Fast Refresh stays component-only.
 */

export type OuterInsulationLayerConfig = {
  layer: 2 | 3;
  materialField: string;
  thicknessField: string;
  lambdaField: string;
  tempMinField: string;
  tempMaxField: string;
  tempRangeField: string;
  materialClassName: string;
  thicknessClassName: string;
  materialTestId: string;
  thicknessTestId: string;
  modalTitle: string;
  dataTestIdPrefix: string;
};

export const SECOND_INSULATION_LAYER: OuterInsulationLayerConfig = {
  layer: 2,
  materialField: 'second_insulation_material',
  thicknessField: 'second_insulation_thickness_mm',
  lambdaField: 'second_insulation_lambda',
  tempMinField: 'second_insulation_temperature_min',
  tempMaxField: 'second_insulation_temperature_max',
  tempRangeField: 'second_insulation_temperature_range',
  materialClassName:
    'fixed-select-form-item layer-material-form-item second-layer-material-form-item helped-form-item',
  thicknessClassName:
    'numeric-form-item short-number-form-item second-layer-thickness-form-item helped-form-item',
  materialTestId: 'second-insulation-material-select',
  thicknessTestId: 'second-insulation-thickness-input',
  modalTitle: 'Материал 2-го слоя',
  dataTestIdPrefix: 'second-insulation',
};

export const THIRD_INSULATION_LAYER: OuterInsulationLayerConfig = {
  layer: 3,
  materialField: 'third_insulation_material',
  thicknessField: 'third_insulation_thickness_mm',
  lambdaField: 'third_insulation_lambda',
  tempMinField: 'third_insulation_temperature_min',
  tempMaxField: 'third_insulation_temperature_max',
  tempRangeField: 'third_insulation_temperature_range',
  materialClassName:
    'fixed-select-form-item layer-material-form-item third-layer-material-form-item helped-form-item',
  thicknessClassName:
    'numeric-form-item short-number-form-item third-layer-thickness-form-item helped-form-item',
  materialTestId: 'third-insulation-material-select',
  thicknessTestId: 'third-insulation-thickness-input',
  modalTitle: 'Материал 3-го слоя',
  dataTestIdPrefix: 'third-insulation',
};
