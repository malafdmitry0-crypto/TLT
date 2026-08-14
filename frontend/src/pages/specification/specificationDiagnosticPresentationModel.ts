/**
 * @module specification/diagnostic-presentation
 * @owner specification
 * Safe user-facing presentation for machine-readable generation diagnostics.
 */
import type { SpecificationDiagnostic } from '@/api/specifications';

export type SpecificationDiagnosticPresentation = {
  title: string;
  message: string;
};

const FALLBACK_PRESENTATION: SpecificationDiagnosticPresentation = {
  title: 'Формирование спецификации недоступно',
  message: 'Проверьте настройки и состояние расчёта, затем повторите формирование.',
};

const SETTINGS_FIELDS = new Set([
  'grouping_mode', 'Ex', 'K1i', 'K2i', 'Kiu', 'L_K2i_m', 'R_gr',
]);
const SETTINGS_INPUT_INVALID_PRESENTATION: SpecificationDiagnosticPresentation = {
  title: 'Проверьте настройки формирования',
  message: 'Исправьте отмеченные поля и повторите формирование спецификации.',
};

const PRESENTATIONS: Record<string, SpecificationDiagnosticPresentation> = {
  SPEC_VARIANT_NOT_READY: {
    title: 'Электротехнический расчёт не готов',
    message: 'Перейдите в ЭР, выполните пересчёт и повторите формирование спецификации.',
  },
  SPEC_ACCESSORY_SELECTION_REQUIRED: {
    title: 'Требуется выбрать комплектующие',
    message: 'Выберите комплектующие для всех предложенных групп и повторите формирование.',
  },
  SPEC_UNASSIGNED_CONFIRMATION_REQUIRED: {
    title: 'Есть объекты без назначения',
    message: 'Подтвердите их исключение из спецификации или исправьте назначения в ЭР.',
  },
};

export function presentSpecificationDiagnostic(
  diagnostic: Pick<SpecificationDiagnostic, 'code'>
    & Partial<Pick<SpecificationDiagnostic, 'issues'>>,
): SpecificationDiagnosticPresentation {
  if (
    diagnostic.code === 'SPEC_FORMULA_INPUT_INVALID'
    && diagnostic.issues?.some((issue) => (
      typeof issue.field === 'string' && SETTINGS_FIELDS.has(issue.field)
    ))
  ) return SETTINGS_INPUT_INVALID_PRESENTATION;
  return PRESENTATIONS[diagnostic.code] ?? FALLBACK_PRESENTATION;
}

export function formatSpecificationConfirmationSummary(
  diagnostics: readonly SpecificationDiagnostic[],
): string {
  const messages = diagnostics.map((diagnostic) => (
    presentSpecificationDiagnostic(diagnostic).message
  ));
  return [...new Set(messages)].join('\n');
}
