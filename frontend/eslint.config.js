/**
 * Flat ESLint config (ESLint 9). Replaces legacy .eslintrc.cjs.
 *
 * Agent-friendly architecture rules live here for fast feedback:
 * feature boundaries, type escapes, static antd feedback APIs.
 * Heavier CSS/LOC ratchets remain in Vitest architecture tests.
 *
 * Note: flat config does NOT merge same-name rules across blocks — each
 * `files` override must list the full `no-restricted-imports` set it needs.
 *
 * Architecture/isolation scanners: fs + RegExp rules off (threat model: local trusted paths).
 */
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import security from 'eslint-plugin-security';
import globals from 'globals';

const securityRules = security.configs['recommended-legacy']?.rules
  ?? security.configs.recommended?.rules
  ?? {};

/** Shared type-escape bans (mirrors AF9-TYPE-GATE-01 for production). */
const typeEscapeRestrictedSyntax = [
  {
    selector:
      "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
    message:
      '[Arch:AS_UNKNOWN_AS] Double cast `as unknown as T` is forbidden in production. FIX: model the real type, narrow with a type guard, or parse with zod. Do not grow typeEscapeBaseline.',
  },
  {
    selector: "TSAsExpression[typeAnnotation.type='TSNeverKeyword']",
    message:
      '[Arch:AS_NEVER] `as never` is forbidden in production. FIX: fix the type relationship or isolate a third-party adapter with an explicit owner.',
  },
];

/** Static antd feedback APIs break ConfigProvider theme / console seal. */
const antdFeedbackRestrictedSyntax = [
  {
    selector:
      "ImportDeclaration[source.value='antd'] > ImportSpecifier[imported.name='message']",
    message:
      '[Arch:STATIC_ANTD_MESSAGE] Do not import static `message` from `antd`. FIX: `import { appMessage } from \'@/feedback/appFeedback\'`.',
  },
  {
    selector: "ImportDeclaration[source.value=/^antd\\/es\\/message/]",
    message:
      '[Arch:STATIC_ANTD_MESSAGE] Do not import antd message directly. FIX: `import { appMessage } from \'@/feedback/appFeedback\'`.',
  },
];

const uiKitDeepImportPattern = {
  group: [
    '@/components/ui-kit/*',
    '@/components/ui-kit/**',
    '**/components/ui-kit/*',
    '**/components/ui-kit/**',
  ],
  message:
    '[Arch:UIKIT_DEEP_IMPORT] Import UI-kit only via `@/components/ui-kit` public barrel. FIX: change import to `@/components/ui-kit`.',
};

const heatImportsElecPattern = {
  group: ['@/pages/electrical', '@/pages/electrical/*', '**/pages/electrical', '**/pages/electrical/*'],
  message:
    '[Arch:HEAT_IMPORTS_ELEC] heatcalc must not import electrical. FIX: move shared pure helpers to domain/, types/, or utils/ with a neutral name.',
};

const elecImportsHeatPattern = {
  group: ['@/pages/heatcalc', '@/pages/heatcalc/*', '**/pages/heatcalc', '**/pages/heatcalc/*'],
  message:
    '[Arch:ELEC_IMPORTS_HEAT] electrical must not import heatcalc. FIX: shared adapters only via utils/domain/types.',
};

const componentsImportPagesPattern = {
  group: ['@/pages/*', '@/pages/**', '**/pages/*', '**/pages/**'],
  message:
    '[Arch:COMPONENTS_IMPORT_PAGES] components must not import pages (inverted dep). FIX: move shared logic to hooks/, domain/, or utils/; keep allowlist empty.',
};

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'eslint.config.js',
      'scripts/**',
      'public/**',
      'storybook-static/**',
      '.storybook/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      security,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...securityRules,
      // Fail the gate: package.json uses --max-warnings 0.
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: false },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      // Mirror typeEscapeRatchet: ban ts-ignore / bare expect-error / nocheck.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 12,
        },
      ],
      // TypeScript + React types own symbols (React namespace, EventListener, HeadersInit)
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Too many false-positives on Ant Design map/index access
      'security/detect-object-injection': 'off',
      'no-restricted-syntax': [
        'error',
        ...typeEscapeRestrictedSyntax,
        ...antdFeedbackRestrictedSyntax,
      ],
    },
  },
  // --- Architecture: feature boundaries (full pattern sets; flat config does not merge) ---
  {
    files: ['src/pages/heatcalc/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [heatImportsElecPattern, uiKitDeepImportPattern] },
      ],
    },
  },
  {
    files: ['src/pages/electrical/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [elecImportsHeatPattern, uiKitDeepImportPattern] },
      ],
    },
  },
  {
    files: ['src/pages/**/*.{ts,tsx}'],
    ignores: [
      'src/pages/heatcalc/**/*.{ts,tsx}',
      'src/pages/electrical/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [uiKitDeepImportPattern] },
      ],
    },
  },
  {
    files: ['src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [uiKitDeepImportPattern] },
      ],
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}'],
    ignores: ['src/components/ui-kit/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [componentsImportPagesPattern, uiKitDeepImportPattern] },
      ],
    },
  },
  {
    // UI-kit must not know about feature/domain/store/API/hooks/pages.
    files: ['src/components/ui-kit/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            componentsImportPagesPattern,
            {
              group: [
                '@/domain/*',
                '@/domain/**',
                '@/store/*',
                '@/store/**',
                '@/api/*',
                '@/api/**',
                '@/hooks/*',
                '@/hooks/**',
              ],
              message:
                '[Arch:UIKIT_BOUNDARY] ui-kit must not import feature/domain/store/api/hooks. FIX: pass data via props; keep kit presentational.',
            },
          ],
        },
      ],
    },
  },
  {
    // Feedback binder is the only place allowed to touch static antd message.
    files: ['src/feedback/appFeedbackApi.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...typeEscapeRestrictedSyntax],
    },
  },
  {
    // Local architecture scanners / isolation asserts — intentional dynamic paths
    files: [
      'src/__tests__/unit/architecture/**/*.{ts,tsx}',
      'src/__tests__/unit/wizard/**/*.{ts,tsx}',
      'src/components/wizard/isolation/**/*.{ts,tsx}',
    ],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
      // Ratchet/tests may use type escapes for mocks; production gate stays strict.
      'no-restricted-syntax': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  {
    files: ['src/__tests__/**/*.{ts,tsx}'],
    rules: {
      'security/detect-unsafe-regex': 'off',
      'react-refresh/only-export-components': 'off',
      'no-restricted-syntax': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      // Tests may deep-import kit internals / mock layouts freely.
      'no-restricted-imports': 'off',
    },
  },
  {
    // Thin re-export / DOM id helpers next to components
    files: [
      'src/components/heatcalc/HeatCalcNormalGlideGrid.tsx',
      'src/pages/electrical/ElectricalVariantTabs.tsx',
      'src/pages/electrical/ElectricalAssignmentPanel.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
];
