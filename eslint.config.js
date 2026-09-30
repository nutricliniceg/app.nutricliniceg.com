import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**', 'build/**'],
  },
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "TemplateLiteral[expressions.length>0]:matches([quasis.0.value.raw=/(^|[\\s(;])(SELECT|INSERT|UPDATE|DELETE)/])",
          message: "SQL string interpolation is strictly forbidden. Use prepared statements with '?' placeholders instead. (D-01, §6.2)",
        },
      ],
    },
  },
];