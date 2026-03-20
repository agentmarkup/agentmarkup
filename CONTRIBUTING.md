# Contributing

Thanks for contributing to `agentmarkup`.

## Development Setup

```bash
pnpm install
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

## Repo Layout

- `packages/vite` contains the publishable `@agentmarkup/vite` package.
- `website` is the dogfooding site and consumes `@agentmarkup/vite` through the workspace package boundary.
- `examples/vite-react` is the minimal consumer example.

## Contribution Expectations

- Keep public docs limited to shipped behavior.
- Add or update tests for behavior changes.
- Prefer build-time, deterministic behavior over runtime heuristics.
- Keep root workspace checks green before opening a commit or PR.

## Public vs Internal Docs

- Public docs live in `README.md` and this file.
- Internal planning and tool-specific workflow notes stay out of git.

## Website Deployment

- The website deploy is manual only.
- Build and publish with `./deploy/website-deploy.sh [cloudflare-project-name]`.
- The deploy script runs `pnpm install --frozen-lockfile`, builds the workspace package plus website, and uploads `website/dist` to Cloudflare Pages with Wrangler.
- `CLOUDFLARE_ACCOUNT_ID` must be set in the shell before running the deploy script.
