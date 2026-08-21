module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:security/recommended-legacy',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['react-refresh', 'security'],
  rules: {
    'react-refresh/only-export-components': 'warn',
    '@typescript-eslint/no-explicit-any': 'error',
    // Security — warn, чтобы не блокировать build, но видеть в CI
    'security/detect-object-injection': 'off', // слишком много false-positives на antd
  },
};
