import { TltSelect } from '@/components/form-controls';
import { TltForm } from '@/components/ui-kit';
import { heatCalcSelectOptions } from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import type { InsulationEntry } from '@/types/reference';
import InsulationLayersTable from '../InsulationLayersTable';
import InsulationSettingsRow from '../InsulationSettingsRow';
import type { ReferencePickerOption } from '../ReferencePicker';
import type { ObjectWizardLayoutVariant } from '../ObjectWizardPanelTypes';

interface Props {
  objectType: HeatCalcObjectType;
  layout: ObjectWizardLayoutVariant;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  watchedValues?: Record<string, unknown>;
  layerCount: number;
  insulationMaterials: InsulationEntry[];
  insulationMaterialOptions: ReferencePickerOption[];
  insulationMaterialsError: boolean;
  isInsulationMaterialsFetching: boolean;
  secondInsulationMaterial?: string;
  thirdInsulationMaterial?: string;
  selectedSecondInsulation?: InsulationEntry;
  selectedThirdInsulation?: InsulationEntry;
  onProgrammaticValuesChange: (changedValues: Record<string, unknown>) => void;
  /**
   * true (default side): settings-row + table.
   * false (wide dual): только table — settings уже в HeatCalcObjectFieldsPanel.
   */
  includeSettingsRow?: boolean;
}

/**
 * Изоляция: optional settings-row + protected InsulationLayersTable.
 * Wide dual-form: settings в HeatCalcObjectFieldsPanel, здесь только table.
 */
export default function InsulationLayersStep({
  objectType,
  layout,
  fieldInputSettings,
  watchedValues,
  layerCount,
  insulationMaterials,
  insulationMaterialOptions,
  insulationMaterialsError,
  isInsulationMaterialsFetching,
  secondInsulationMaterial,
  thirdInsulationMaterial,
  selectedSecondInsulation,
  selectedThirdInsulation,
  onProgrammaticValuesChange,
  includeSettingsRow = true,
}: Props) {
  return (
    <>
      {includeSettingsRow ? (
        <InsulationSettingsRow
          objectType={objectType}
          fieldInputSettings={fieldInputSettings}
          watchedValues={watchedValues}
        />
      ) : null}

      {/* ⛔ PROTECTED: InsulationLayersTable — менять только по прямому запросу */}
      <InsulationLayersTable
        objectType={objectType}
        layout={layout}
        fieldInputSettings={fieldInputSettings}
        layerCount={layerCount}
        insulationMaterials={insulationMaterials}
        insulationMaterialOptions={insulationMaterialOptions}
        insulationMaterialsError={insulationMaterialsError}
        isInsulationMaterialsFetching={isInsulationMaterialsFetching}
        secondInsulationMaterial={secondInsulationMaterial}
        thirdInsulationMaterial={thirdInsulationMaterial}
        selectedSecondInsulation={selectedSecondInsulation}
        selectedThirdInsulation={selectedThirdInsulation}
        onProgrammaticValuesChange={onProgrammaticValuesChange}
      />

      {/* скрытый носитель round-trip: ни подписи, ни правил — не поле формы */}
      <TltForm.Item name="insulation_cover_material" hidden>
        <TltSelect
          data-testid="insulation-cover-material-select"
          options={heatCalcSelectOptions(objectType, 'insulation_cover_material')}
        />
      </TltForm.Item>
    </>
  );
}
