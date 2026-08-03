/**
 * Wizard dual-form isolation registry.
 *
 * Three islands must not share CSS roots, must not import each other,
 * and must not be restyled via broad shell selectors.
 *
 * See WIZARD-ISLANDS.md. Architecture tests enforce this and throw
 * WizardIsolationError with AI-actionable messages.
 */

export type WizardIslandId =
  | 'heat-object-fields'
  | 'cable-algorithm'
  | 'insulation-layers-table';

export interface WizardIslandDefinition {
  id: WizardIslandId;
  /** Primary CSS class on the island root element */
  rootClass: string;
  /** data-protected attribute value */
  dataProtected: string;
  /** Co-located CSS file (relative to components/wizard/) */
  cssFile: string;
  /** Primary React component file */
  componentFile: string;
  /** data-wizard-zone value when placed in shell */
  zoneAttr?: string;
  /** Human name for errors */
  label: string;
  /** Protected: edits only on direct user request */
  protected: boolean;
}

/** Canonical island table — single source for scanners and runtime guards. */
export const WIZARD_ISLANDS: readonly WizardIslandDefinition[] = [
  {
    id: 'heat-object-fields',
    rootClass: 'heat-object-fields',
    dataProtected: 'heat-object-fields',
    cssFile: 'heat-object-fields.css',
    componentFile: 'HeatCalcObjectFieldsPanel.tsx',
    zoneAttr: 'heat-object-fields',
    label: 'HeatCalcObjectFieldsPanel (поля теплорасчёта)',
    protected: true,
  },
  {
    id: 'cable-algorithm',
    rootClass: 'object-wizard-cable-panel',
    dataProtected: 'heat-cable-algorithm',
    cssFile: 'cable-algorithm-panel.css',
    componentFile: 'CableAlgorithmPanel.tsx',
    zoneAttr: 'cable-algorithm',
    label: 'CableAlgorithmPanel (алгоритм выбора кабеля)',
    protected: false,
  },
  {
    id: 'insulation-layers-table',
    rootClass: 'insulation-layers-table',
    dataProtected: 'insulation-layers-table',
    cssFile: 'insulation-layers-table.css',
    componentFile: 'InsulationLayersTable.tsx',
    zoneAttr: 'insulation-layers',
    label: 'InsulationLayersTable (таблица слоёв)',
    protected: true,
  },
] as const;

export const WIZARD_ISLAND_BY_ID: Readonly<Record<WizardIslandId, WizardIslandDefinition>> =
  Object.fromEntries(WIZARD_ISLANDS.map((i) => [i.id, i])) as Record<
    WizardIslandId,
    WizardIslandDefinition
  >;

/** CSS files that must NEVER style form controls inside islands via broad parents. */
export const WIZARD_SHELL_CSS_FILES = ['styles.css'] as const;

/**
 * Forbidden patterns in styles.css (and other shell CSS).
 * Each match is a hard isolation failure.
 */
export const WIZARD_SHELL_FORBIDDEN_CSS_PATTERNS: readonly {
  id: string;
  pattern: RegExp;
  message: string;
  fix: string;
}[] = [
  {
    id: 'wide-panel-form-item-global',
    // .object-wizard-wide-panel .ant-form-item { without island root in same selector
    pattern:
      /\.object-wizard-wide-panel\s+\.ant-form-item(?![^{]*\{)[^{]*\{/g,
    message:
      'styles.css styles .object-wizard-wide-panel .ant-form-item globally — this leaks into InsulationLayersTable.',
    fix:
      'Scope to .heat-object-fields .ant-form-item only, or move rules into heat-object-fields.css. Never style all form-items under wide-panel.',
  },
  {
    id: 'wide-panel-reference-picker-global',
    pattern:
      /\.object-wizard-wide-panel\s+\.reference-picker-control(?![^\n{]*heat-object-fields)[^\n{]*\{/g,
    message:
      'styles.css styles .reference-picker-control under entire wide-panel (hits table material column).',
    fix:
      'Move to heat-object-fields.css under .heat-object-fields, or insulation-layers-table.css under .insulation-layers-table.',
  },
  {
    id: 'wide-panel-field-label-global',
    pattern:
      /\.object-wizard-wide-panel\s+\.field-label-two-line(?![^\n{]*heat-object-fields)[^\n{]*\{/g,
    message:
      'styles.css styles .field-label-two-line under entire wide-panel (cross-island).',
    fix:
      'Scope under .heat-object-fields or .object-wizard-cable-panel only.',
  },
];

/** Import edges that are forbidden (from → to). */
export const WIZARD_FORBIDDEN_IMPORT_EDGES: readonly {
  from: WizardIslandId;
  to: WizardIslandId;
  reason: string;
}[] = [
  {
    from: 'heat-object-fields',
    to: 'insulation-layers-table',
    reason: 'Heat fields must not import the layers table (shell composes both).',
  },
  {
    from: 'heat-object-fields',
    to: 'cable-algorithm',
    reason: 'Heat fields must not import cable panel (ObjectWizard dual-form composes both).',
  },
  {
    from: 'cable-algorithm',
    to: 'heat-object-fields',
    reason: 'Cable panel must not import heat fields panel.',
  },
  {
    from: 'cable-algorithm',
    to: 'insulation-layers-table',
    reason: 'Cable panel must not import layers table.',
  },
  {
    from: 'insulation-layers-table',
    to: 'heat-object-fields',
    reason: 'Layers table must not import heat fields panel.',
  },
  {
    from: 'insulation-layers-table',
    to: 'cable-algorithm',
    reason: 'Layers table must not import cable panel.',
  },
];

export class WizardIsolationError extends Error {
  readonly code: string;
  readonly island?: WizardIslandId;
  readonly fix: string;

  constructor(opts: {
    code: string;
    message: string;
    fix: string;
    island?: WizardIslandId;
  }) {
    super(
      `[WizardIsolationError:${opts.code}] ${opts.message}\n` +
        `FIX: ${opts.fix}` +
        (opts.island ? `\nISLAND: ${opts.island}` : ''),
    );
    this.name = 'WizardIsolationError';
    this.code = opts.code;
    this.fix = opts.fix;
    this.island = opts.island;
  }
}
