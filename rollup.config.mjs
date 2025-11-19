import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';

const isProduction = process.env.NODE_ENV === 'production';

export default [
  // UI bundle
  {
    input: 'src/ui.tsx',
    output: {
      file: 'dist/ui.js',
      format: 'iife',
      name: 'ContentifyUI',
      sourcemap: !isProduction
    },
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false
      }),
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**',
        presets: [
          ['@babel/preset-env', { targets: { browsers: ['> 1%', 'last 2 versions'] } }],
          '@babel/preset-react',
          '@babel/preset-typescript'
        ],
        extensions: ['.js', '.jsx', '.ts', '.tsx']
      }),
      ...(isProduction ? [terser()] : [])
    ],
    external: []
  },
  // Code bundle (ES5 for Figma plugin)
  {
    input: 'src/code.ts',
    output: {
      file: 'dist/code.js',
      format: 'iife',
      name: 'ContentifyCode',
      sourcemap: !isProduction
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false
      }),
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**',
        presets: [
          ['@babel/preset-env', { targets: { ie: '11' } }],
          '@babel/preset-typescript'
        ],
        extensions: ['.js', '.ts']
      }),
      ...(isProduction ? [terser()] : [])
    ],
    external: []
  }
];
