# Signal Index

Signal Index is the design system for `eddn.dev`. It treats the site as an open technical index: direct typography, visible structure, real data, and one interactive field that belongs to the work instead of sitting inside decorative chrome.

## Principles

1. **Content before containers.** Space establishes editorial groups. Hairlines are reserved for indexed list rows, functional controls, tabular data, and major telemetry boundaries. A surface is introduced only when interaction or contrast requires it.
2. **One display voice.** Geist carries every headline, navigation label, paragraph, and control. DM Mono is limited to indices, dates, code, and live readouts.
3. **Show the mechanism.** The canvas programs and contribution data provide the visual identity. Static decoration stays quiet.
4. **Violet means signal.** Violet identifies active text, machine output, focus, and data intensity. It is not used for glows or decorative panels.
5. **Hard edges, clear rhythm.** Full-width fields, column shifts, and deliberate spacing replace cards, shadows, nested shells, and decorative section rules.

## Color

| Role | Color |
| --- | --- |
| Canvas | `#111015` |
| Soft canvas | `#1c1a21` |
| Ink | `#f5f1fa` |
| Body | `#c4bccd` |
| Muted | `#9b92a5` |
| Hairline | `#35313c` |
| Violet | `#8c72e6` |

The site is dark-only. The violet ramp lives in `src/styles/global.css`, and the fixed dark field uses `#15111e` so the simulations retain consistent contrast.

## Type

- **Geist Variable:** all display text, body text, navigation, and controls.
- **DM Mono:** indices, timestamps, telemetry labels, code, and canvas status.
- Headlines may change color or weight, but not font family or style mid-phrase.
- Display tracking runs from `-0.04em` to `-0.078em`.
- Body copy stays between 14px and 18px with a practical maximum near 65 characters.

## Composition

- The main grid has 12 columns and a maximum width of 1400px.
- The hero pairs a large typographic block with a smaller editorial note, then breaks the container with a full-width interactive field.
- Recent work is a three-row open index. Each row has an index, type, title, description, metadata, and destination; hairlines separate peer entries without enclosing them as cards.
- Major telemetry modules are separated by a single rule. Metrics may use cells in one shared row, never independent cards.
- The footer is a flat, full-width closing field with no rounded top edge.

## Navigation

- Desktop navigation appears at 1024px and above.
- Viewports below 1024px use one `Menu` trigger. Search and locale controls live inside the overlay.
- The compact overlay uses the same row language as the content index.
- Current-page state uses text color and a thin underline, not a filled pill.

## Motion

- Standard curve: `cubic-bezier(0.32, 0.72, 0, 1)`.
- Continuous animation is limited to the canvas engines and small status signals.
- Entrance motion changes only opacity, transform, or clip path.
- Automatic motion resolves to a useful still under `prefers-reduced-motion`.
- Canvas loops pause outside the viewport and when the document is hidden.
- Scrolling remains native.

## Accessibility and data integrity

- Compact navigation exposes `aria-expanded`, `aria-controls`, and `aria-hidden` state.
- Escape closes the menu and restores focus to its trigger.
- Reveal effects are gated behind the root `js` class, so content remains visible without client JavaScript.
- Focus styles use the violet signal color with a visible offset.
- GitHub and LeetCode visualizations render fetched data or an explicit loading fallback.
- The canvas has an accessible label and a visible keyboard control for program changes.
