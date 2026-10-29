# AGENTS.md

Guidance for coding agents (and humans skimming for the rules) working in this
repository. This is the single source of truth for every tool. `CLAUDE.md` is a
symlink to this file; edit this one.

Theme QA is the shared quality-check framework for the open-source Ghost themes
made by [Magic Pages](https://www.magicpages.co): Pod, Vienna, Berlin, Kyiv and
Alpine. It is public and MIT-licensed. Theme repos call it from CI; developers
run the same CLI locally. The README is the user-facing description; this file
is how the code is put together.

## Setup & commands

- **Node 22.19+** and **npm**. Docker is required for `up`, `test` and `run`.
- `npm install`
- `npm test`: unit tests (`node --test`).
- `npm run lint`: editorconfig-checker on every tracked file, plus
  `prettier --check`.
- `npm run format`: `prettier --write`.
- Try the CLI against a theme: `node bin/theme-qa.mjs run --dir ../pod`.

## Architecture

```
theme-qa/
├── bin/theme-qa.mjs           # CLI: check | up | test | down | run
├── src/
│   ├── config.mjs             # loadConfig(): the normalised config contract
│   ├── theme.mjs              # buildTheme(), packageTheme()
│   ├── checks/                # static checks (no Ghost needed)
│   ├── ghost/                 # Docker lifecycle, Admin API client, seeding
│   │   └── seed/              # shared base content + seed helpers
│   └── browser/               # runs Playwright, in Docker by default
├── tests/                     # the shared Playwright suite every theme gets
├── fixtures/                  # images/audio the base content uploads
└── .github/workflows/theme.yml  # reusable workflow theme repos call
```

### The flow

1. `check`: build the theme, package the zip, run static checks on source and zip.
2. `up`: start `ghost:<tag>` in Docker, create the owner, upload and activate the
   zip, upload `routes.yaml`, add base content, run the theme's `seed()`, write
   `.theme-qa/manifest.json` in the theme folder.
3. `test`: for each profile, apply its settings through the Admin API, then run
   the Playwright suite (shared `tests/` plus the theme's own `qa/*.spec.mjs`).
4. `down`: remove the container.

`run` does `check`, then `up --empty` + `test` on a fresh site with no posts
(profile name `empty`, reserved: theme defaults, no theme specs), then `up` +
`test` on the seeded site. Empty runs first so `--keep` leaves the seeded site.

### Module contracts

Keep these signatures stable; the CLI and the other modules depend on them.

- `src/config.mjs`: `loadConfig(themeDir)` returns the normalised config. Every
  module reads the normalised shape, never the raw file. New config keys get a
  default in `normalise()`.
- `src/theme.mjs`: `buildTheme(config)` runs `config.build` if set.
  `packageTheme(config)` runs `config.zip.command` and returns the absolute path
  of the zip it produced; a zip older than this run is rejected. Without a zip
  command it zips `git ls-files` (minus dotfiles) into `.theme-qa/<name>.zip`,
  so themes whose built assets are not committed must set `zip.command`.
  `createZip(entries)` is the dependency-free zip writer behind that fallback
  and the unit tests.
- `src/checks/index.mjs`: `runStaticChecks(config, { zipPath })` returns
  `{ ok, dir, results: [{ check, level: 'error' | 'warning' | 'info', message, file? }] }`.
  `printStaticResults(report)` prints it; in GitHub Actions it also emits
  `::error` / `::warning` / `::notice` annotations with paths relative to the
  repository root.
- `src/ghost/index.mjs`:
  - `startGhost(config)` returns `{ url }` once Ghost answers.
  - `provision(config, { url, zipPath })` returns the manifest and writes it to
    `<theme>/.theme-qa/manifest.json`.
  - `applyProfile(config, manifest, profileName)` sets custom theme settings
    and site settings for that profile.
  - `readManifest(config)` reads the manifest back.
  - `stopGhost(config)` removes the container.
- `src/browser/index.mjs`:
  `runBrowserChecks(config, { manifest, profile, updateScreenshots, local, smoke })`
  returns `{ ok }`. `smoke` runs only the status and console/network checks;
  CI uses it on the oldest Ghost version in `engines.ghost`.

### The manifest

`.theme-qa/manifest.json` is how seeding tells the browser checks what exists.

```json
{
  "url": "http://localhost:2399",
  "ghostVersion": "6.x.y",
  "theme": "pod",
  "admin": { "email": "…", "password": "…" },
  "pages": [
    { "id": "home", "path": "/", "status": 200, "screenshot": true, "lighthouse": true },
    { "id": "not-found", "path": "/theme-qa-missing/", "status": 404, "screenshot": true, "lighthouse": false }
  ],
  "baseline": { "custom": { "color_scheme_default": "Light" }, "settings": { "title": "…" } }
}
```

`pages` holds the standard templates (home, kitchen-sink post, plain post,
style-guide page, tag, author, `/page/2/`, members-only post, 404), every URL a
theme's `seed()` registers with `url()`, and `config.urls`. `id` names the
screenshot files, so keep ids stable.

`baseline` holds the values, captured right after seeding, of every custom
theme setting and site setting any profile changes. `applyProfile` restores it
first, so one profile never leaks into the next.

### Test content

- Base content lives in `src/ghost/seed/`, grouped by `BASE_GROUPS` in
  `config.mjs`. Themes exclude groups with `base.exclude`. A theme's `seed()`
  gets the seed context plus `media`, the fixtures already uploaded.
- Content goes in through the Admin API as Lexical, never as an export file.
- Dates, titles and images are fixed so screenshots are stable between runs.
- Fixture images and audio in `fixtures/` are generated by us and MIT-licensed.
  Never add third-party media.

## Rules

- **Ghost owns Portal, search, comments, `{{ghost_head}}` and `{{ghost_foot}}`.**
  Checks must not fail a theme for problems inside Ghost-rendered UI. Filter
  those out by origin and say so in the check's output.
- **A check that can't tell theme bugs from Ghost bugs is worse than no check.**
  Prefer fewer, trustworthy failures over broad, noisy ones.
- **Same result locally and in CI.** Browser checks run in the pinned Playwright
  Docker image (`mcr.microsoft.com/playwright:v<version>-noble`) so screenshots
  match. `@playwright/test` is pinned to that exact version; bump both together.
- **Theme repos only add config.** If a theme needs special handling, add a
  config option, not a theme-name check in this repo.
- **No AI attribution** in commits, pull requests, code comments or docs.
- Lead with the recommendation, then the reasoning. For changes that alter what
  passes or fails for existing themes, stop and discuss first.

## Legal

- MIT. All new code is MIT.
- Ghost® is a registered trademark of the Ghost Foundation. Theme QA is not
  affiliated with or endorsed by the Ghost Foundation. Never name it in a way
  that implies endorsement.

---

License: MIT · Repository: github.com/magicpages/theme-qa ·
Maintainer: Jannis Fedoruk-Betschki <jannis@magicpages.co>
