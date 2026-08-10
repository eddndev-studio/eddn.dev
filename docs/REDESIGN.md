# Redesign decision: Signal Index

## Context

The original portfolio established useful product foundations: bilingual content, a restrained violet identity, real GitHub and LeetCode data, and custom canvas experiments. Later redesigns improved the simulation engine and accessibility, but their visual systems moved toward familiar portfolio patterns.

The card-based iteration used mixed sans and serif headlines, rounded nested enclosures, pill navigation, and isolated metric panels. Those devices competed with the actual work and made the design feel generated instead of authored. The navigation also switched to its full desktop density at 768px, which made tablet layouts feel compressed even when they did not technically overflow.

## Decision

Signal Index replaces container decoration with an open editorial structure:

- Geist is the only display and body family;
- DM Mono is reserved for machine labels and evidence;
- the simulation engine becomes a full-width interactive field;
- recent content becomes a reusable row index with hairlines between entries;
- editorial sections use spacing instead of decorative rules;
- major telemetry modules alone use rules, with shared metric rows where the data benefits from cells;
- violet is limited to active text, data, focus, and canvas output;
- the header remains compact below 1024px;
- the compact header exposes one menu trigger and moves utilities into the overlay;
- the footer closes the page as a hard-edged field instead of a rounded panel.

## Preserved engineering

- Astro static generation and content collections;
- English and Spanish routes;
- the fluid, life, and flow programs;
- visibility and reduced-motion controls for canvas rendering;
- search and native theme view transitions;
- real GitHub and LeetCode telemetry;
- page transition names for content titles and dates;
- existing long-form content structure.

## Verification contract

`tests/portfolio-design.test.mjs` protects the core visual constraints:

- compact navigation through tablet widths;
- one clear compact-menu trigger;
- one sans-serif display voice;
- row-based recent content;
- an unframed generative field;
- a footer without a rounded card edge;
- focused component file sizes.

`DESIGN.md` is the implementation source of truth for future interface work.
