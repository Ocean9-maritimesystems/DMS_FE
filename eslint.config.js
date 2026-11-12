import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Lint rules (npm run lint). Mistakes that break the app are errors; older code that still has `any` types,
 * unused variables and the like reports warnings, to be cleaned up file by file.
 */
export default tseslint.config(
    { ignores: ['build', 'node_modules', 'public', 'coverage'] },
    {
        files: ['src/**/*.{ts,tsx}'],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.browser,
        },
        plugins: { 'react-hooks': reactHooks },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
            'no-console': ['warn', { allow: ['warn', 'error'] }],
        },
    },
    {
        files: ['src/**/*.test.{ts,tsx}', 'src/setupTests.ts'],
        languageOptions: { globals: { ...globals.browser, ...globals.node } },
    },
);
