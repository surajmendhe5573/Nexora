import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierPlugin from 'eslint-plugin-prettier';
import * as importPlugin from 'eslint-plugin-import';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

const isProd = process.env.NODE_ENV === 'production';

export default [
    // Global ignore patterns
    {
        ignores: [
            '**/dist/**',
            '**/build/**',
            '**/node_modules/**',
            '**/src/generated/**',
            '**/*.config.ts',
            '**/*.config.js',
            '**/*.config.cjs',
            '**/prisma/seeds.ts',
            'scripts/**',
            '*.lock',
            '.env',
            '.env.*',
            'jest.config.ts',
            'public/**',
            '.cache/**',
            '*.log',
            '*.tmp',
            '.DS_Store',
            '.husky/**',
            '.github/**',
        ],
    },

    // Base JS rules
    js.configs.recommended,

    // Prettier formatting
    {
        plugins: { prettier: prettierPlugin },
        rules: {
            'prettier/prettier': [
                'error',
                {
                    singleQuote: true,
                    semi: true,
                    tabWidth: 4,
                },
            ],
        },
    },

    // TypeScript rules
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: true,
                sourceType: 'module',
                ecmaVersion: 'latest',
            },
            globals: {
                ...globals.node,
                ...globals.es2021,
            },
        },
        plugins: { '@typescript-eslint': tsPlugin },
        // rules: {
        //     ...tsPlugin.configs.recommended.rules,
        //     ...tsPlugin.configs['recommended-requiring-type-checking'].rules,
                rules: {
            'no-undef': 'off', // TypeScript already reports undefined names; this rule misreads global types
            ...tsPlugin.configs.recommended.rules,
            ...tsPlugin.configs['recommended-type-checked'].rules,

            // ✅ Type safety & naming
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-base-to-string': 'warn',
            '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'variable',
                    format: ['camelCase', 'UPPER_CASE', 'PascalCase', 'snake_case'],
                    leadingUnderscore: 'allow',
                },
                {
                    selector: 'variableLike',
                    format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
                    leadingUnderscore: 'allow',
                },
                {
                    selector: 'memberLike',
                    format: ['camelCase', 'UPPER_CASE', 'snake_case', 'PascalCase'],
                    leadingUnderscore: 'allow',
                },
                {
                    selector: 'property',
                    format: null,
                    modifiers: ['requiresQuotes'],
                },
                {
                    selector: 'typeLike',
                    format: ['PascalCase'],
                },
                {
                    selector: 'enumMember',
                    format: ['UPPER_CASE', 'PascalCase'],
                },
                {
                    selector: 'function',
                    format: ['camelCase', 'PascalCase'],
                },
                {
                    selector: 'parameter',
                    format: ['camelCase', 'PascalCase', 'snake_case'],
                    leadingUnderscore: 'allow',
                },
            ],

            // ✅ Optional stricter typing
            '@typescript-eslint/explicit-function-return-type': 'warn',
            '@typescript-eslint/explicit-module-boundary-types': 'warn',
            '@typescript-eslint/no-floating-promises': [
                'error',
                { ignoreVoid: true, ignoreIIFE: true },
            ],

            // ⚠️ Downgrade noisy rules to warnings for now
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/no-unsafe-member-access': 'warn',
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-return': 'warn',
            '@typescript-eslint/no-unsafe-argument': 'warn',
            '@typescript-eslint/unbound-method': 'off',
        },
    },

    {
        files: ['**/*.{ts,js}'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2021,
            },
        },
        plugins: {
            import: importPlugin,
            'simple-import-sort': simpleImportSort,
            'unused-imports': unusedImports,
        },
        rules: {
            // ✅ Import cleanup & sorting
            'simple-import-sort/imports': [
                'error',
                {
                    groups: [
                        ['^\\u0000'], // Side effect imports (e.g., import './global.css')
                        ['^@?\\w'], // Packages (npm)
                        ['^(@|components)(/.*|$)'], // Custom or monorepo packages
                        ['^\\.\\.(?!/?$)', '^\\.\\./?$'], // Parent imports
                        ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'], // Relative imports
                    ],
                },
            ],
            'simple-import-sort/exports': 'error',
            'unused-imports/no-unused-imports': 'error',
            'unused-imports/no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    varsIgnorePattern: '^_',
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                },
            ],

            // ✅ Code style consistency
            indent: 'off',
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],
            eqeqeq: ['warn', 'always'],
            'max-len': ['warn', { code: 200 }],
            // 'no-console': isProd ? 'error' : 'warn',
        },
    },
];
