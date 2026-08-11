export interface PageFaqItem {
  question: string;
  answer: string;
}

export const homeFaqs: PageFaqItem[] = [
  {
    question: 'What does agentmarkup actually do?',
    answer: 'It checks whether AI systems can find, understand, and access your website, then gives you clear next steps. Developers can also use AgentMarkup packages to improve machine-readable website output.',
  },
  {
    question: 'Does this improve my search rankings?',
    answer: 'Structured data can support richer search results, but AgentMarkup does not promise rankings or traffic. It helps make your website easier for people, search engines, and AI systems to read.',
  },
  {
    question: 'Is llms.txt a standard?',
    answer: 'It is a proposal from llmstxt.org, not an official standard. The website checks and structured-data features remain useful without it.',
  },
  {
    question: 'Is the config the same for Next.js, Vite, Astro, and Nuxt?',
    answer: 'The shared AgentMarkupConfig object is the same across all adapters. The integration point changes: Next.js uses withAgentmarkup, Vite uses plugins, Astro uses integrations, and Nuxt uses the agentmarkup key. The same config also drives the CLI.',
  },
  {
    question: 'What is @agentmarkup/core for?',
    answer: 'The core package contains the generators and validators without any framework binding. Use it for a custom build script, prerender pipeline, or a route that needs direct integration instead of an adapter-owned build step.',
  },
  {
    question: 'Does @agentmarkup/next handle fully dynamic SSR routes automatically?',
    answer: 'No. The Next adapter is strongest where Next emits build-time HTML. For fully dynamic SSR routes with no build-time HTML file, use the re-exported @agentmarkup/core helpers directly in the route.',
  },
  {
    question: 'Does it add any runtime JavaScript?',
    answer: 'No browser runtime is added by AgentMarkup. The adapters run during build or post-build processing and output static files or server header rules.',
  },
  {
    question: 'Do I need markdown mirrors on every page?',
    answer: 'No. They are most useful when raw HTML is thin, noisy, or heavily client-rendered. If pages already serve substantial HTML, keep HTML as the primary fetch target.',
  },
  {
    question: 'Can I use my own JSON-LD schemas instead of presets?',
    answer: 'Yes. Pass any object with an @type field. AgentMarkup adds the @context, escapes the output for XSS safety, and validates that the @type is present.',
  },
  {
    question: 'Will this break my existing robots.txt?',
    answer: 'No. The plugin updates only its marked section and leaves your existing rules intact.',
  },
];

export const checkerFaqs: PageFaqItem[] = [
  {
    question: 'What does the website checker inspect?',
    answer: 'It reads your public homepage and one internal page, then checks discovery links, sitemap and canonical signals, readable HTML, JSON-LD, llms.txt and markdown alternatives, robots.txt rules, and live responses for common AI crawlers.',
  },
  {
    question: 'Does the checker change or install anything on my website?',
    answer: 'No. It only makes read-only requests to public URLs. It does not log in, edit a page, install a package, or crawl your entire website.',
  },
  {
    question: 'Is this the same as the security scan?',
    answer: 'No. The website checker focuses on whether machines can find, understand, and access your content. The security scan focuses on public safety signals such as HTTPS, response headers, cookie flags, mixed content, security.txt, and public DNS records.',
  },
  {
    question: 'Why does the checker not give a score?',
    answer: 'A single score can hide the issue that matters. The checker reports evidence-based findings as looks good, needs attention, or action required, and gives a practical next step for each result.',
  },
];

export const securityScanFaqs: PageFaqItem[] = [
  {
    question: 'What does the passive security scan check?',
    answer: 'It checks public HTTPS and HSTS behavior, security response headers, cookie flags, mixed content, Subresource Integrity, security.txt, and public SPF, DMARC, and DNSSEC records.',
  },
  {
    question: 'Is this a penetration test or vulnerability scan?',
    answer: 'No. It uses ordinary read-only web and DNS requests. It does not scan ports, enumerate private paths, send attack payloads, authenticate, fuzz inputs, or certify that a website is secure or insecure.',
  },
  {
    question: 'Can I scan any website?',
    answer: 'Only scan a website you own or are authorized to assess. The authorization checkbox is required before the scan runs.',
  },
  {
    question: 'How is this different from the website checker?',
    answer: 'The security scan reviews public safety signals. The website checker reviews machine readability, structured information, discovery files, and AI crawler access. They answer different questions and do not share findings.',
  },
];

export const llmsTxtFaqs: PageFaqItem[] = [
  { question: 'Do AI models actually read llms.txt?', answer: 'Some AI systems like Perplexity have started checking for llms.txt. The format is still early, but the cost of generating it is near zero and it provides a clean machine-readable overview of your site.' },
  { question: 'Can I have both llms.txt and llms-full.txt?', answer: 'Yes. llms.txt is the summary. llms-full.txt is optional expanded context. agentmarkup can generate both, and when markdown mirrors are enabled it inlines the same-site mirror content into llms-full.txt automatically.' },
  { question: 'What happens if I do not configure llmsTxt?', answer: 'No llms.txt file is generated. The other features (JSON-LD, markdown mirrors, robots.txt, optional headers, and validation) still work independently. You can enable features selectively.' },
];

export const jsonLdFaqs: PageFaqItem[] = [
  { question: 'Do I need JSON-LD if I already have meta tags?', answer: 'Yes. Meta tags (title, description) help search engines understand a single page. JSON-LD tells them what kind of thing the page represents (a product, an article, an FAQ) with structured fields they can use for rich results.' },
  { question: 'Can I add multiple schemas to one page?', answer: 'Yes. Use the pages config to add multiple schemas per path. Each schema generates its own <script type="application/ld+json"> tag. Global schemas are also added to every page.' },
  { question: 'What if I need a schema type that is not a preset?', answer: 'Pass any object with an @type field. agentmarkup will add @context automatically and serialize it safely. Presets just save you from remembering required fields.' },
];

export const aiCrawlersFaqs: PageFaqItem[] = [
  { question: 'Does blocking an AI crawler actually work?', answer: 'Most major AI companies (OpenAI, Anthropic, Google) have committed to respecting robots.txt directives for their crawlers. Compliance is voluntary but widely honored. Smaller or unknown crawlers may not comply.' },
  { question: 'What is the difference between GPTBot and ChatGPT-User?', answer: 'GPTBot crawls pages for training data. ChatGPT-User is used when a ChatGPT user asks the model to browse a specific URL. They are separate user agents with separate purposes. agentmarkup supports both.' },
  { question: 'Can I add custom crawler names?', answer: 'Yes. The aiCrawlers config accepts any string as a key, not just the built-in names. This lets you add rules for new or niche crawlers as they appear.' },
];

export const auditFaqs: PageFaqItem[] = [
  { question: 'Does a 403 for GPTBot mean my site blocks AI?', answer: "Not necessarily. The audit spoofs the user-agent from a generic IP, so a 403 can be a user-agent WAF rule (which does block the real bot) or IP allowlisting (where the verified bot, from the vendor's published IP ranges, is fine). The audit reports this as a warning with both explanations, not as a definitive block." },
  { question: 'Is it safe to point at any URL?', answer: 'Requests use an SSRF-safe fetch: localhost, private, loopback, link-local, CGNAT, and IPv6-bypass address forms are refused, redirects are followed manually and re-validated per hop, and responses are size- and time-bounded. The blocklist mirrors the hosted checker.' },
  { question: 'How is this different from the website checker?', answer: 'They run the same idea. The checker is the hosted, browser-based version for a quick lookup; @agentmarkup/audit is the command-line version for local runs, scripting, and CI, with a non-zero exit code on provable errors.' },
];
