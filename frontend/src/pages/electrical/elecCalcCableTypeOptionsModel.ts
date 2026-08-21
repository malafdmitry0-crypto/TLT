/**
 * @module electrical/cable-type-options-model
 * @owner electrical
 * @depends elecCalcAssignmentScopeModel, domain labels
 * @does-not heat
 */
import type { ElectricalQueryAssignment } from '@/types/calculation';
import type { ElectricalCalculationCableSource } from '@/utils/electricalTableViewSettings';
import {
  CABLE_TYPE_LABEL,
  type CableTypeKey,
} from '@/domain/electrical/elecCalcMainTableModel';
import { electricalSystemForCableType } from '@/pages/electrical/elecCalcAssignmentScopeModel';

export type CableTypeSelectOption = {
  label: string;
  value: CableTypeKey;
};

export type CableSourceSelectOption = {
  label: string;
  value: ElectricalCalculationCableSource;
};

export function buildCableTypeSelectOptions(
  availableCableTypeKeys: readonly CableTypeKey[],
): CableTypeSelectOption[] {
  return availableCableTypeKeys.map((k) => ({
    label: CABLE_TYPE_LABEL[k],
    value: k,
  }));
}

export function filterCableTypeOptionsForAssignment(
  options: readonly CableTypeSelectOption[],
  assignment: ElectricalQueryAssignment | undefined,
): CableTypeSelectOption[] {
  const assignedSystem = assignment?.system_type;
  if (assignedSystem !== 'self_regulating' && assignedSystem !== 'resistive') {
    return [];
  }
  return options.filter(
    (option) => electricalSystemForCableType(option.value) === assignedSystem,
  );
}

export function buildCableSourceSelectOptions(
  isEmployee: boolean,
): CableSourceSelectOption[] {
  return [
    { label: 'Встроенная', value: 'builtin' },
    ...(isEmployee
      ? [
          { label: 'Внешняя', value: 'extended' as ElectricalCalculationCableSource },
          { label: 'Все', value: 'all' as ElectricalCalculationCableSource },
        ]
      : []),
  ];
}

export const CABLE_TYPE_SELECTION_INCOMPATIBLE_WARNING =
  'Выбранные объекты назначены в другую систему. Снимите выбор или выберите совместимый тип кабеля.';
