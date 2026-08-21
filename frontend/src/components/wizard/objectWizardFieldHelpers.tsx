/**
 * @module wizard/object-wizard-field-helpers
 * @owner heat
 * Label / help / control wrappers shared by ObjectWizard step slots.
 */
import type { ReactElement } from 'react';

import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import type { HeatCalcObjectType } from '@/types/project';
import FieldLabel from './FieldLabel';
import HelpedControl from './HelpedControl';

export function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

export function fieldLabel(fieldId: string, objectType?: HeatCalcObjectType) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType })} />;
}

export function fieldHelp(fieldId: string, objectType?: HeatCalcObjectType, mode?: string) {
  return getHeatCalcFieldDescription(fieldId, { objectType, mode });
}
