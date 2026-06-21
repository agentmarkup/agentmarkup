import { defineNuxtModule } from '@nuxt/kit';
import type { NuxtModule } from '@nuxt/schema';
import { printReport } from '@agentmarkup/core';
import type { AgentMarkupConfig } from '@agentmarkup/core';
import { processStaticOutput } from './process.js';

export * from '@agentmarkup/core';
export {
  processStaticOutput,
  type ProcessMode,
  type ProcessStaticOutputOptions,
  type ProcessStaticOutputResult,
} from './process.js';

/** Module options are the standard agentmarkup config under the `agentmarkup` key. */
export type ModuleOptions = AgentMarkupConfig;

/**
 * Minimal structural shapes for the Nuxt/Nitro objects this module touches. We
 * avoid a hard dependency on `nuxt` types so the package builds against `@nuxt/kit`
 * alone; the real Nuxt/Nitro instances satisfy these at runtime.
 */
interface NitroLike {
  options: { output?: { publicDir?: string } };
  hooks: { hook(name: 'prerender:done', fn: () => void | Promise<void>): void };
}

interface NuxtLike {
  hook(name: 'nitro:init', fn: (nitro: NitroLike) => void | Promise<void>): void;
}

/**
 * Wire agentmarkup into a Nuxt build. Exported separately from the module default
 * export so the hook plumbing is unit-testable without a full Nuxt runtime.
 *
 * Registers on Nitro's `prerender:done`, which fires after every prerendered route's
 * HTML has been written to `nitro.options.output.publicDir` (the `nuxt generate` /
 * `build --prerender` path). Fully dynamic SSR routes that never emit build-time HTML
 * are out of scope — use `@agentmarkup/core` helpers in app code for those.
 */
export function registerAgentmarkup(nuxt: NuxtLike, config: AgentMarkupConfig): void {
  // The Nitro instance does not exist during module setup(); grab it via nitro:init.
  nuxt.hook('nitro:init', (nitro) => {
    nitro.hooks.hook('prerender:done', async () => {
      const publicDir = nitro.options.output?.publicDir;
      if (!publicDir) {
        return;
      }

      const result = await processStaticOutput(config, {
        outDir: publicDir,
        mode: 'generate',
      });

      printReport({
        label: '@agentmarkup/nuxt',
        agentCardStatus: result.agentCardStatus,
        llmsTxtEntries: result.llmsTxtEntries,
        llmsTxtSections: result.llmsTxtSections,
        llmsTxtStatus: result.llmsTxtStatus,
        llmsFullTxtEntries: result.llmsFullTxtEntries,
        llmsFullTxtStatus: result.llmsFullTxtStatus,
        jsonLdPages: result.jsonLdPages,
        markdownPages: result.markdownPages,
        markdownPagesStatus: result.markdownPagesStatus,
        markdownCanonicalHeadersCount: result.markdownCanonicalHeadersCount,
        markdownCanonicalHeadersStatus: result.markdownCanonicalHeadersStatus,
        crawlersConfigured: result.crawlersConfigured,
        robotsTxtStatus: result.robotsTxtStatus,
        contentSignalHeadersStatus: result.contentSignalHeadersStatus,
        validationResults: result.validationResults,
      });
    });
  });
}

// Explicit annotation (not just the inferred return) so the emitted .d.ts does not
// reference @nuxt/schema by a non-portable .pnpm path (TS2742).
const agentmarkupModule: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@agentmarkup/nuxt',
    configKey: 'agentmarkup',
    compatibility: { nuxt: '>=4.0.0' },
  },
  setup(options, nuxt) {
    registerAgentmarkup(nuxt as unknown as NuxtLike, options as AgentMarkupConfig);
  },
});

export default agentmarkupModule;
