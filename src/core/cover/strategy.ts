import type { CoverStrategy, CoverGenerateOptions } from '../../types/index.js';

export type { CoverStrategy, CoverGenerateOptions };

export function resolveCoverStrategy(
  strategyName: string | undefined,
  aiAvailable: boolean,
  strategies: { sharp: CoverStrategy; ai?: CoverStrategy }
): CoverStrategy {
  if (strategyName === 'ai' && aiAvailable && strategies.ai) {
    return strategies.ai;
  }
  return strategies.sharp;
}
