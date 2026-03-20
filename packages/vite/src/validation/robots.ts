import type { AiCrawlersConfig, ValidationResult } from '../types.js';
import { findBlockedCrawlers } from '../generators/robots-txt.js';

/**
 * Validate that existing robots.txt doesn't conflict with AI crawler config.
 */
export function validateRobotsTxt(
  robotsTxt: string | null,
  crawlers: AiCrawlersConfig
): ValidationResult[] {
  if (!robotsTxt) return [];

  const blocked = findBlockedCrawlers(robotsTxt, crawlers);

  return blocked.map((bot) => ({
    severity: 'warning' as const,
    message: `Existing robots.txt may block ${bot} (configured as 'allow')`,
  }));
}
