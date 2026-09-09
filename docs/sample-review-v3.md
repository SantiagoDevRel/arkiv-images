# Theme, payload and explorer revision

The library remains the published **arkiv-images 0.1.1**, using **arkiv-chunking 0.1.0**, SDK **0.8.0** and viem **2.56.3**. This revision changes the sample, not the npm implementation. Tests ran on Node **22.22.3**, TypeScript **5.9.3**, Vite **8.2.2**, Playwright **1.62.1** and Chrome **152.0.7977.77**.

## Verification

- All **29 tests**, package type checking and the sample build passed.
- Browser regression passed inline PNG at the **120,000-byte boundary**, JPEG and a **120,001-byte chunked PNG**. All downloads match their inputs. Complete hex text is compared byte for byte for the 120,000-byte inline payload and both 100,000/20,001-byte chunks. Scroll is keyboard-accessible and stays inside a 260 px box.
- Dark default, light selection persisted after reload, both themes, orange wallet color, disconnected Store message with **zero writes**, entity link lists, rejected signatures, wrong network, invalid files and read errors passed. Nine widths (390/599/600/601/768/899/900/901/1440) were checked in dark; 390/768/1440 were also checked in light. Native 200% browser zoom passed.
- Computed contrast: wallet text **7.01:1** in both themes; help text **7.28:1 dark / 5.55:1 light**; field border **4.37:1 dark / 3.73:1 light**. Typography matches the sample README. The official SVG SHA-256 remains `ef0040f22c08ea85fc66b065b2f01f36f1572219b63fe0564f0f277130f4cb5c`.
- Real Tiramisu reads recovered the existing 120,001-byte image and compared the complete displayed payloads with its bytes. All four explorer destinations were opened and displayed the matching active entity and creation history: image root, JSON manifest and both binary chunks. An inline JPEG explorer page was also checked. HTTP status alone was not accepted as explorer verification.
- A Chrome read-only measurement of payload rendering plus forced layout took **64.8 ms for 120,000 bytes** and **48.9 ms for 100,000 bytes** on this machine. This is a local observation, not a mobile performance guarantee. The complete payloads were present, with scroll heights 61,495/51,268 px inside the 260 px viewport.

## Independent reviews

| Reviewer | Actual scope and result |
|---|---|
| Muse | Static adversarial review of image source/built output and the complete installed chunking implementation. No evidenced High/Critical finding. It could not run its dynamic probes: its isolated runtime was Node 20 and npm cache access failed. The implementing agent's Node 22 tests are separate evidence. |
| Claude | Reviewed package/dependency and new sample source, ran all 29 tests, inspected four rendered screenshots, and checked explorer routes in the live SPA bundle. No blocking defect. Its two follow-ups were complete-payload coverage at 100,000/120,000 bytes and validation of transaction links; both were implemented and verified. |
| Grok | CLI failed before review with an out-of-usage error. Grok web was also tried, including the available anonymous mode; it required sign-in before returning an answer. No Grok audit is claimed until access is available. |

Muse noted the documented container-only validation and strict JPEG ending rule, and that chunked root payload data is ignored by package retrieval. These were not demonstrated integrity bypasses. The browser still decodes supported raster data, and the inspector separately checks the exact entity schema/payloads.

These are bounded reviews and reproducible checks, not a guarantee of absolute safety. Live maximum-size uploads, real MetaMask signing, physical mobile wallets and other browser engines remain unverified. The existing Rabby/Tiramisu receipt evidence is linked from [verification](verification.md).
