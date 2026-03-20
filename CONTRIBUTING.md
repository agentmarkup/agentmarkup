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
- `website` is the dogfooding site.
- `examples/vite-react` is the minimal consumer example.

## Contribution Expectations

- Keep public docs limited to shipped behavior.
- Add or update tests for behavior changes.
- Prefer build-time, deterministic behavior over runtime heuristics.
- Keep root workspace checks green before opening a commit or PR.

## Public vs Internal Docs

- Public docs live in `README.md` and this file.
- Internal planning and tool-specific workflow notes stay out of git.
