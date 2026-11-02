import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/node.ts', 'src/score/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: false,
});
