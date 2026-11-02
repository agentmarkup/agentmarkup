/**
 * Domains that are never an agency's client: social networks and directories,
 * CDNs and asset hosts, and the platforms and vendors agencies link in their
 * footers. A bare name matches the second-level label of a registrable domain
 * (`facebook` -> facebook.com, facebook.net); a dotted entry matches a hostname
 * that equals it, starts with it or ends with it (`play.google`, `wp.com`).
 */
export const SOCIAL_DIRECTORY = [
  'facebook',
  'instagram',
  'x',
  'twitter',
  'linkedin',
  'youtube',
  'tiktok',
  'pinterest',
  'threads',
  'vimeo',
  'yelp',
  'behance',
  'dribbble',
  'clutch',
  'goodfirms',
  'upcity',
  'designrush',
  'g2',
  'trustpilot',
  'bbb',
  'google',
  'g.page',
  'apple',
  'play.google',
  // Added after the first batch smoke (2026-11-02): share targets and
  // directories that ranked as "clients" on an agency's /our-work/ page.
  'reddit',
  'tumblr',
  'medium',
  'alignable',
  'expertise',
] as const;

export const CDN_ASSET = [
  'cloudflare',
  'cloudfront',
  'akamai',
  'fastly',
  'googleapis',
  'gstatic',
  'jsdelivr',
  'unpkg',
  'cdnjs',
  'wp.com',
  'wixstatic',
  'squarespace-cdn',
  'shopifycdn',
  'gravatar',
] as const;

export const PLATFORM_VENDOR = [
  'wordpress',
  'wix',
  'squarespace',
  'shopify',
  'webflow',
  'hubspot',
  'mailchimp',
  'godaddy',
  'elementor',
  'yoast',
  'semrush',
  'ahrefs',
  'moz',
  'calendly',
  'typeform',
  'zapier',
  'stripe',
  'paypal',
  'wpengine',
  'kinsta',
  'flywheel',
  'cloudways',
  'schema.org',
  'w3.org',
  'creativecommons',
  'adobe',
  'canva',
  'figma',
  'themeforest',
  'envato',
  // Added after the first batch smoke (2026-11-02): an accessibility widget
  // vendor linked from every page of an agency site.
  'userway',
] as const;

export type ExclusionReason = 'social-directory' | 'cdn-asset' | 'platform-vendor';

export interface ExclusionLists {
  socialDirectory: ReadonlyArray<string>;
  cdnAsset: ReadonlyArray<string>;
  platformVendor: ReadonlyArray<string>;
}

export const DEFAULT_EXCLUSIONS: ExclusionLists = {
  socialDirectory: SOCIAL_DIRECTORY,
  cdnAsset: CDN_ASSET,
  platformVendor: PLATFORM_VENDOR,
};
