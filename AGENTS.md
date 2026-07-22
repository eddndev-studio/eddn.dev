# AGENTS.md

## General principles

Follow the existing architecture, conventions, and style of the repository.

Prefer simple, readable, reusable, and maintainable solutions. Avoid unnecessary abstractions and disruptive changes unless the task explicitly requires them.

## Workflow

Before writing code:

1. Investigate the relevant code paths.
2. Search for existing helpers, functions, types, services, hooks, components, and patterns.
3. Reproduce and confirm bugs or regressions.
4. Identify the root cause before implementing a fix.
5. Implement the smallest complete solution.
6. Run the relevant tests and checks.

Do not solve problems based only on symptoms or assumptions when the codebase can provide evidence.

## Test-driven development

Use TDD for new behavior, bug fixes, and regressions:

1. Write or update a test.
2. Confirm that it fails for the expected reason.
3. Implement the minimum required solution.
4. Refactor while keeping tests passing.

Bug fixes should include a regression test whenever practical.

Do not weaken, remove, or skip tests only to make a change pass.

## Reuse before creation

Research the codebase before adding new code.

Prefer, in order:

1. Reuse an existing implementation.
2. Extend an existing implementation.
3. Extract shared behavior.
4. Create a new abstraction only when necessary.

Avoid duplicating business rules, validations, formatting, error handling, styles, test setup, and integration logic.

New abstractions must have a clear responsibility and improve readability, testability, or reuse.

## File organization

Keep files below 400 lines of code whenever practical.

Files above 400 lines require a clear technical justification. Otherwise, split them into cohesive modules, helpers, components, services, types, or fixtures.

Do not reduce line count through compressed formatting or complex expressions.

A file should also be split when it has multiple unrelated responsibilities, even if it is below 400 lines.

## User interfaces

Before creating a component or hardcoding an interface:

- Search for existing components with the same or a similar purpose.
- Review the design system and shared style primitives.
- Reuse existing spacing, typography, colors, states, and interaction patterns.
- Prefer composition over duplication.

Keep interfaces and programming patterns consistent with the existing application.

Only introduce disruptive visual or architectural changes when explicitly requested.

## Code style

Use plain ASCII characters in code, comments, filenames, documentation, branch names, and commit messages.

Do not use:

- ANSI escape sequences.
- Emoji or decorative symbols.
- Smart quotes.
- Unicode dashes or arrows.
- Invisible or confusable Unicode characters.

Use simple expressions and regular keyboard characters.

Non-ASCII text is allowed only when required as product or domain data.

## Documentation

Documentation and comments must be understandable by anyone with repository access.

Only reference versioned repository artifacts, such as source files, tests, configuration, schemas, migrations, and architecture documents.

Do not reference conversations, harness messages, temporary plans, private reasoning, local notes, logs, or unversioned files.

Comments should explain non-obvious reasons, constraints, tradeoffs, or compatibility requirements. Do not comment code that is already self-explanatory.

## Scope and consistency

Keep changes focused on the requested outcome.

Do not introduce unrelated refactors, dependency upgrades, renames, formatting changes, or architectural replacements.

Follow existing conventions for naming, directory structure, testing, error handling, state management, data access, styling, and component composition.

When multiple patterns exist, investigate which one is current and canonical before adding another.

## Branch workflow

Never work directly on `main`.

Create a focused semantic branch for each change. Use lowercase names with hyphens:

```text
<type>/<short-description>
```

Recommended branch types:

- `feat`
- `fix`
- `refactor`
- `test`
- `docs`
- `build`
- `ci`
- `chore`
- `perf`

Examples:

- `feat/customer-reminders`
- `fix/inventory-negative-stock`
- `refactor/shared-form-fields`
- `test/session-expiration`

Keep each branch focused on one feature, fix, or cohesive change.

Integrate branches into `main` using squash and merge. Do not use regular merge commits unless explicitly required.

The final squash commit must follow Conventional Commits and clearly describe the complete change.

For this repository, `master` is the primary branch and must be treated as `main` under this rule.

## Conventional Commits

All commits must follow Conventional Commits:

```text
<type>(optional-scope): <description>
```

Common types:

- `feat`
- `fix`
- `refactor`
- `test`
- `docs`
- `build`
- `ci`
- `chore`
- `perf`
- `revert`

Examples:

- `feat(auth): add session expiration handling`
- `fix(api): preserve validation error details`
- `refactor(ui): reuse shared form component`
- `test(inventory): cover negative stock regression`

Descriptions must be concise, imperative, written in ASCII, and without a trailing period.

Keep commits focused and understandable. Before squash and merge, ensure the pull request title can be used as a valid Conventional Commit message.

## Verification

Before completing a task:

- Run relevant tests.
- Run linting, formatting, type checking, and builds when available.
- Review the diff for duplicated code and unrelated changes.
- Confirm that new code follows existing patterns.
- Review file size and responsibilities.
- Confirm that documentation references only versioned artifacts.
- Confirm that the branch and final squash commit follow repository conventions.

Do not claim that a command passed unless it was actually executed. Clearly report any verification that could not be performed.

## Project-specific guidance

### Project identity

- This is an Astro 5 static, bilingual technical journal. Keep pages static-first and add client JavaScript only for genuine interaction.
- Preserve the purple-first identity through the existing `brand-*` palette, ambient color, raw Canvas visuals, and purposeful motion.
- Do not reintroduce the warm neutral Warp redesign unless the user explicitly requests it.
- Support light and dark themes. Motion must respect `prefers-reduced-motion`, and continuous Canvas work should stop when hidden or off-screen.

### Repository map

- `src/pages/`: English routes at the root and mirrored Spanish routes under `es/`.
- `src/components/pages/`: shared bilingual page compositions.
- `src/content/{blog,articles,leetcode}/{en,es}/`: typed Markdown content collections.
- `src/i18n/`: shared UI and trajectory translations.
- `src/lib/` and `src/utils/visuals.ts`: dependency-free Canvas simulations used by the hero and footer.
- `services/`: independent Rust services for OG images and view counts.
- `public/`: static assets copied into the generated site.

Do not edit generated output in `dist/`, `.astro/`, `node_modules/`, or any Rust `target/` directory.

### Commands

```bash
npm ci
npm run dev
npm test
npm exec astro check
npm run build
```

- `npm run build` is the release-equivalent check: it builds Astro and indexes `dist/` with Pagefind.
- Pagefind has no `android-arm64` binary. In Termux, use `npm exec astro build` as the local build check and report that Pagefind was skipped for platform reasons; CI on Node 22 remains authoritative for the full command.
- When changing a Rust service, run `cargo check --manifest-path services/<service>/Cargo.toml` and its relevant tests.

### Project conventions

- Keep English and Spanish routes structurally equivalent. Add shared UI strings to both locales in `src/i18n/ui.ts`; update both content variants when a translation pair exists.
- Follow the schemas in `src/content.config.ts`. Preserve stable slugs and `translationKey` relationships.
- Reuse shared layouts and components instead of duplicating locale-specific markup.
- Scripts that survive Astro client-side navigation must initialize on `astro:page-load` and clean up listeners, timers, observers, and animation frames before a swap.
- Prefer semantic HTML, visible `focus-visible` states, keyboard-operable controls, sufficient contrast, and decorative canvases hidden from assistive technology.
- Avoid adding production dependencies unless the existing Astro, Tailwind, CSS, or browser APIs cannot reasonably solve the task.

### Project verification

- For normal source changes, run `npm test`, `npm exec astro check`, and the strongest build command supported by the environment.
- For visual changes, inspect English and Spanish at mobile and desktop widths, in light and dark themes, with reduced motion enabled.
- For content changes, confirm collection validation, internal links, canonical URLs, hreflang output, RSS generation, and Pagefind indexing where available.
- Do not commit, push, deploy, or change CI secrets unless the user explicitly requests it. Pushing to `master` triggers the production deployment workflow.
