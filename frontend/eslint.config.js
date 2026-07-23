/**
 * Flat ESLint config (ESLint 9). Replaces legacy .eslintrc.cjs.
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
      'react-refresh/only-export-components': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      // TypeScript + React types own symbols (React namespace, EventListener, HeadersInit)
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Too many false-positives on Ant Design map/index access
      'security/detect-object-injection': 'off',
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
    },
  },
  {
    files: ['src/__tests__/**/*.{ts,tsx}'],
    rules: {
      'security/detect-unsafe-regex': 'off',
      'react-refresh/only-export-components': 'off',
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
