# Sample design provenance

The sample interface was produced in [Claude Design: Arkiv Images dApp](https://claude.ai/design/p/803e8fb8-05be-472f-9948-c10ac7a41c5a), with the account's existing **Arkiv Design System** selected. The exported HTML and CSS were integrated into `sample/index.html` and `sample/src/style.css`. The design project may require the owner's account; the complete runnable interface is in this repository and requires no design-service access.

The brief supplied the existing form IDs, real storage flow and supported formats. It requested a minimal English interface using the Arkiv system, with technical detail disclosed on demand. The corrected final export archive has SHA-256 `f17c56fedafa06f6b815b1c445b334e31eddc94f756838743084e974996d65ef`.

Integration retained the existing npm package, wallet handlers, validation, recovery evidence and byte verification. Prototype simulations were not included. The prototype's illustrative chunk counts were corrected to the real 120,001-byte case: two chunks, four entities and five transactions. The runnable sample always calculates its plan with the published package.

Integration adjustments:

- Replace the prototype's text wordmark with the unmodified official white SVG, sourced from the canonical Arkiv logo pack. Asset SHA-256: `ef0040f22c08ea85fc66b065b2f01f36f1572219b63fe0564f0f277130f4cb5c`. [Official brand source](https://arkiv.network/brand).
- Preserve native form semantics, accessible status regions, keyboard focus, wrapping keys and `[hidden]` visibility.
- Keep the established heading size on mobile and increase control-border contrast. No licensed font binaries are redistributed; the open fallback and exact typography contract are documented once in the [sample README](../sample/README.md).
- Keep all visible copy and runtime errors in English. Shorten the main journey while retaining public-file consent, transaction counts and actionable errors.

The canonical component/token reference is [Arkiv UI](https://github.com/Arkiv-Network/arkiv-ui). The sample keeps the design's single-column composition and Ink/Sand/Orange palette. Browser evidence, including native 200% zoom and responsive states, is recorded in [verification](verification.md). Public deployment is pending the developer's localhost review.


## Reference-based revision

The developer requested a new design based on the running sibling Arkiv Files sample at `http://127.0.0.1:3077/` (the reference URL was supplied twice). That screen was actually opened and captured, then attached to both design-service briefs. Both services produced working visual prototypes and source exports:

- [Claude Design project](https://claude.ai/design/p/803e8fb8-05be-472f-9948-c10ac7a41c5a): revised Ink top bar, Sand workspace, tabbed input panel, result panel and entity-flow composition. Export ZIP SHA-256: `ec4d7eac5404e097205ceaac5e264f75753f64acbfff6559e7e6049663035435`.
- [Lovable: Arkiv Image Explorer](https://lovable.dev/projects/daf72d1b-24b8-4d1a-b8cb-5b36d9486344): image chooser/thumbnail treatment, 400 px input column, compact controls and selected-entity treatment. Retrieved its actual vanilla HTML/CSS exports from the project preview. HTML SHA-256: `f52a06a9c9d97d1adfcc01bb7d8acc51ab4286e565d5f6591669c846b7bf1d94`; CSS SHA-256: `456c83a465e278520ae480507ba03a0270bba974c01a159e698275b6fa731d89`.

The integration uses Claude Design's exported markup/token layer and the identified Lovable treatments, adapted to the existing vanilla TypeScript application. It corrects prototype-only placeholder IDs, tight form spacing, control contrast, keyboard navigation and responsive wrapping. The official SVG is unchanged. No prototype wallet state, fake entity key or simulated network-success handler ships in the sample.

The top-bar connection automatically configures Tiramisu. The RPC editor, separate network-switch button and public-data acknowledgement were removed as requested. Calendar/time uses the existing sibling sample's network-timing adapter, adjusted to the image package's limits. Store & verify runs the published API's write and read, then displays a separate read-only inspection of actual entities. The [sample README](../sample/README.md) now owns the revised layout and typography contract; earlier design notes describe the previous iteration.

These project links are design workspaces/previews, not deployments of the real sample. The integrated application remains local for developer review.
