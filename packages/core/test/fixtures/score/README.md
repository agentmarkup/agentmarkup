# Score engine fixtures

Recorded `SiteEvidence` for the seven-site panel plus the Ora calibration point. Each
`<host>.json` is the input the engine reads; each `<host>.expected.json` is the executable
contract enforced by `test/score/sites.test.ts`: exact score, grade, status, range and the
first three top fixes, and one `verified` note per `fail` or `partial` check naming what was
seen in the captured body. A new non-pass fails the suite until someone confirms it against
the body or fixes the rule; the fixture is never edited to make a finding disappear.

## Provenance

All captures were made on 2026-11-02. The `verified` notes were written by the chunk A
implementer after reading the captured bodies (they say "captured body read 2026-11-02
(chunk A)"); the human sign-off that the spec's D2 number requires is still pending and
should replace that attribution when it happens.

| Fixture | Source | Shape |
|---|---|---|
| `agentmarkup.dev.json` | curl capture via `probe.sh` (checker UA `agentmarkup-checker/0.3.2`, `--range 0-400000`; a 206 status is normalised to 200), converted by `convert-fixtures.mjs`; sample page `/checker/` from `samples.txt` | dogfood site, every feature on, Ora audit available |
| `animafelix.com.json` | same capture set; sample page `/exercises/` | content site, 37 KB llms.txt, 366-URL sitemap with lastmod |
| `cochinescu.com.json` | same capture set; sample page `/professional/` | personal site, sitemap index, no markdown mirrors, 178 KB llms.txt |
| `sandiegowebstudios.com.json` | same capture set; sample page `/portfolio/` | WordPress + Yoast, no llms.txt (lead row 5) |
| `seodesignchicago.com.json` | same capture set; sample page `/services/search-engine-optimization-seo/` | WordPress without og:image, ProfessionalService JSON-LD, Content-Signal in robots.txt |
| `visualwebz.com.json` | same capture set; sample page `/website-deposit/` | 411 KB homepage, three h1, missing paths 301 to the homepage, `/index.md` redirects to the homepage |
| `tagteamdesign.com.json` | the live Pages worker payload of 2026-11-02T11:18:09Z (`our-check.json` with `cache`, `protection` and `storage` removed); the curl probe of this host hit the apex and is not used | WordPress + Yoast, llms.txt without discovery link, `sitemap_index.xml` timed out (status 0, so the run is `partial`), no response headers captured by that worker build |
| `ora-agentmarkup.dev.json` | the `essentials` object of Ora's audit of agentmarkup.dev (contractVersion 1.38.0, scanned 2026-10-10), trimmed from `ora-am.json`; used by `formula.test.ts` (reproduction of 80 / 18.4 / 3.8 / 100 and the 38 gains) and `ora-comparison.test.ts` | the only calibration point; the other six sites have no Ora audit |

Conversion details for the curl captures: the resources are `/`, `/llms.txt`,
`/robots.txt`, `/sitemap.xml` (followed through redirects, so `finalUrl` can be
`sitemap_index.xml` with `hops: 1`), `/index.md`, the sample page, the sample page `.md`,
and the probe `/agentmarkup-probe-404-does-not-exist-9f3a2c` (no redirects, `Location`
kept). `sitemapSource` is `default` for every curl fixture. Headers are the worker's
allowlist (`link`, `vary`, `cf-mitigated`, `content-signal`, `x-robots-tag`,
`last-modified`, `content-length`, `www-authenticate`). 404 and 410 bodies are dropped
(`body: null`, `bodyBytes`, `bodyDropped: true`) as the worker does since chunk B; the
tagteamdesign payload predates that and keeps its 404 bodies, which exercises the other
path. `fetchedAt` is the `Date` header of the homepage response.

Re-recording: `scripts/capture-check-fixture.mjs <url> --out <fixture> --rerecord` (chunk D)
records through the audit collector; after a re-record every `verified` note must be
re-read against the new body before the expected table is frozen again.
