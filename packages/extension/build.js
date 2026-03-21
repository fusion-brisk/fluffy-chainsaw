const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

async function build() {
  const ctx = await esbuild.context({
    entryPoints: [
      'src/content.ts',
      'src/background.ts',
      'src/popup.ts',
      'src/options.ts',
    ],
    bundle: true,
    outdir: 'dist',
    format: 'iife',
    target: 'chrome100',
    sourcemap: true,
  });

  if (isWatch) {
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('Build complete.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
