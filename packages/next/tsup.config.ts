import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/adapter.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: false,
});
