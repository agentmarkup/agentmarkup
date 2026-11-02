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
  // Added after the second batch pilot (2026-11-02): a chamber-of-commerce
  // directory badge, Google share and short links ranked as "clients".
  'chamberofcommerce',
  'share.google',
  'goo.gl',
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
  // Added after the second batch pilot (2026-11-02): Google-hosted images.
  'googleusercontent',
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
  // Added after the second batch pilot (2026-11-02): a footer counter, help-desk
  // tenants, review and booking widgets, hosting, theme and plugin vendors, and
  // cookie-consent tooling that ranked as "clients" (hubspot and calendly above).
  'statcounter',
  'freshworks',
  'freshdesk',
  'trustindex',
  'siteground',
  'elegantthemes',
  'leadconnectorhq',
  'gohighlevel',
  'incsub',
  'wpmudev',
  'complianz',
  'cookiedatabase',
  'hsforms',
] as const;

/**
 * Generic business words for the sibling-brand rules. A shared run of letters
 * covered by these, one word or several back to back (`studio` in
 * dentonwebstudios and singletwiststudio, `webstu` in web+studio), is a common
 * trade name, not a shared brand. A name made of these words alone
 * (thewebstudios) is a sibling when it shares one with the agency. Added after
 * the second batch pilot (2026-11-02); `web` after the fourth review.
 */
export const GENERIC_BRAND_WORDS = [
  'web',
  'studio',
  'studios',
  'design',
  'designs',
  'designer',
  'designers',
  'designing',
  'marketing',
  'digital',
  'consulting',
  'consultants',
  'creative',
  'creatives',
  'agency',
  'solutions',
  'services',
  'website',
  'websites',
  'online',
  'interactive',
  'technology',
  'technologies',
  'graphics',
  'branding',
  'advertising',
  'development',
  'developer',
  'developers',
  'systems',
  'partners',
  'productions',
  'strategies',
  'strategy',
  'network',
  'networks',
  'affordable',
  'professional',
  'professionals',
  'premier',
  'custom',
  'modern',
  'global',
  'national',
  'american',
  'company',
  'companies',
  'enterprises',
  'industries',
  'international',
  'management',
  'business',
  'photography',
  'internet',
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
