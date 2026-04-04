import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';

function buildHash() {
  const gitHash = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
  const hash = `${gitHash}-${Date.now()}`;
  // Write sidecar file so relay can read the hash without parsing minified JS
  writeFileSync('dist/build-hash.txt', hash, 'utf8');
  return hash;
}

const isProduction = process.env.NODE_ENV === 'production';

export default [
  // UI bundle
  {
    input: 'src/ui/ui.tsx',
    output: {
      file: 'dist/ui.js',
      format: 'iife',
      name: 'EProductSnippetUI',
      sourcemap: false,
    },
    plugins: [
      replace({ preventAssignment: true, __BUILD_HASH__: JSON.stringify(buildHash()) }),
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
      }),
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**',
        presets: [
          ['@babel/preset-env', { targets: { browsers: ['> 1%', 'last 2 versions'] } }],
          '@babel/preset-react',
          '@babel/preset-typescript',
        ],
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      }),
      ...(isProduction ? [terser()] : []),
    ],
    external: [],
  },
  // Code bundle (ES5 for Figma plugin)
  {
    input: 'src/sandbox/code.ts',
    output: {
      file: 'dist/code.js',
      format: 'iife',
      name: 'EProductSnippetCode',
      sourcemap: false,
    },
    plugins: [
      replace({ preventAssignment: true, __BUILD_HASH__: JSON.stringify(buildHash()) }),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
      }),
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**',
        presets: [['@babel/preset-env', { targets: { ie: '11' } }], '@babel/preset-typescript'],
        extensions: ['.js', '.ts'],
      }),
      ...(isProduction ? [terser()] : []),
    ],
    external: [],
  },
];
