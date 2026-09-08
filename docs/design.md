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
