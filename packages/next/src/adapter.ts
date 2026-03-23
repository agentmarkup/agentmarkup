import type { AgentMarkupConfig } from '@agentmarkup/core';
import { processNextBuildOutput } from './build.js';
import {
  AGENTMARKUP_NEXT_CONFIG_ENV,
  AGENTMARKUP_NEXT_PREVIOUS_ADAPTER_ENV,
  decodeAgentmarkupConfig,
} from './index.js';
import type {
  NextAdapterContextLike,
  NextAdapterLike,
  NextConfigLike,
} from './types.js';

const previousAdapterPath = process.env[AGENTMARKUP_NEXT_PREVIOUS_ADAPTER_ENV] ?? '';
let previousAdapterPromise: Promise<NextAdapterLike | null> | null = null;

const agentmarkupAdapter: NextAdapterLike = {
  name: '@agentmarkup/next',

  async modifyConfig(
    nextConfig: NextConfigLike,
    context: Record<string, unknown>
  ): Promise<NextConfigLike> {
    const previous = await getPreviousAdapter();
    if (!previous?.modifyConfig) {
      return nextConfig;
    }

    return previous.modifyConfig(nextConfig, context);
  },

  async onBuildComplete(context: NextAdapterContextLike): Promise<void> {
    const previous = await getPreviousAdapter();
    if (previous?.onBuildComplete) {
      await previous.onBuildComplete(context);
    }

    const config = readAgentmarkupConfig();
    if (!config) {
      return;
    }

    await processNextBuildOutput(config, {
      projectDir: context.projectDir,
      distDir: context.distDir,
      nextConfig: context.config ?? context.nextConfig,
      outputs: context.outputs,
    });
  },
};

export default agentmarkupAdapter;

async function getPreviousAdapter(): Promise<NextAdapterLike | null> {
  if (!previousAdapterPath) {
    return null;
  }

  if (!previousAdapterPromise) {
    previousAdapterPromise = import(previousAdapterPath)
      .then((module) => {
        const candidate = (module.default ?? module) as NextAdapterLike;
        return typeof candidate === 'object' && candidate ? candidate : null;
      })
      .catch((error: unknown) => {
        console.warn(
          `[agentmarkup/next] Failed to load previous adapter from "${previousAdapterPath}". ${formatErrorMessage(
            error
          )}`
        );
        return null;
      });
  }

  return previousAdapterPromise;
}

function readAgentmarkupConfig(): AgentMarkupConfig | null {
  const encoded = process.env[AGENTMARKUP_NEXT_CONFIG_ENV];
  if (!encoded) {
    return null;
  }

  try {
    return decodeAgentmarkupConfig(encoded);
  } catch (error: unknown) {
    console.warn(
      `[agentmarkup/next] Failed to decode agentmarkup config from ${AGENTMARKUP_NEXT_CONFIG_ENV}. The Next adapter hook will be skipped. ${formatErrorMessage(
        error
      )}`
    );
    return null;
  }
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}
