<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Effect

This project uses **Effect v4** (`effect@4.0.0-rc.112`). v4 is an RC with breaking
changes from v3 — most Effect material you have seen (blog posts, StackOverflow,
older training data) describes v3 and will be wrong here. Examples: `Effect.catch`
replaces `Effect.catchAll`, `Schema` is exported from the `effect` root.

## `repos/` is read-only reference material

`repos/effect` is the Effect source, vendored with `git subtree` from the `main`
branch, pinned to the same version as the installed package. It exists so you can
read the real implementation instead of guessing.

- **Never import from `repos/`.** Import from `effect` (or `@effect/*`) only.
- **Never edit anything under `repos/`.** Changes there are meaningless — the
  build does not see them, and the next subtree pull will discard them.
- It is excluded from `tsconfig.json`, `eslint.config.mjs`, and the VSCode file
  watcher. Keep it that way.

## Where to look

- `repos/effect/LLMS.md` — Effect's own guidance for coding agents. **Read this
  before writing Effect code.** Covers `Effect.gen` vs `Effect.fn`, error
  modelling with `Schema.TaggedError`, services, and layers.
- `repos/effect/packages/effect/src/` — core module sources.
- `repos/effect/packages/*/` — `ai`, `platform`, `sql`, `atom`, `opentelemetry`.
- `repos/effect/MIGRATION.md` — v3 → v4 changes. Useful when something you
  remember no longer exists.

## Updating the vendored source

If you bump `effect`, re-sync the subtree to match:

```
git subtree pull --prefix=repos/effect https://github.com/Effect-TS/effect.git main --squash
```

A version skew between `repos/effect` and `node_modules/effect` makes the
reference actively misleading. Keep them in lockstep.
