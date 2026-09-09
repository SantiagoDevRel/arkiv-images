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
| Grok | Native Grok Build 4.6 completed the independent audit after the Cursor lane hit quota and web required login. Verified registry tarballs/integrity, installed runtime exports and guides; ran all 13 compiled package tests and malformed-input probes. No runtime blocker demonstrated. It did not inspect the sample UI or send real-network transactions. |

Muse noted the documented container-only validation and strict JPEG ending rule, and that chunked root payload data is ignored by package retrieval. These were not demonstrated integrity bypasses. The browser still decodes supported raster data, and the inspector separately checks the exact entity schema/payloads.

Grok confirmed the documented filename, decoding, mutable-manifest availability and raw-error limitations. The README now explicitly distinguishes `ChunkingError` from `ImageStorageError`. Obsolete production-Hub links in chunking's source guides and sample were corrected in [chunking PR #1](https://github.com/SantiagoDevRel/arkiv-chunking/pull/1), then deployed and verified against Tiramisu staging. The immutable npm 0.1.0 archive retains historical links; use its current source guide. The image README already uses Tiramisu staging links. Neither npm release has Sigstore provenance; exact versions, lockfile integrity and registry tarball hashes were checked. Trusted publishing is a separate follow-up, not configured by this task. The installed image archive's historical verification heading is explained in the release report; current evidence lives in this repository.

## Public deployment

Verified **2026-09-09**: https://arkiv-images-example.vercel.app, deployment `dpl_J6ebWP1BqdZX5SAxU54Ug8qhZqXT`. The sample consumes published `arkiv-images@0.1.1`; no new library release was needed for UI changes.

The first Vercel build exposed missing Linux optional packages in the Windows lockfile. The same `npm ci` failure was reproduced in Linux, then the lockfile was regenerated without changing existing dependency versions. A clean Linux install/build passed with **Node 24.20.0 / npm 11.19.0**, followed by a successful Vercel build. No Vercel resource was deleted.

The public JavaScript, CSS and official SVG match the local build byte for byte. The full controlled browser regression passed against the deployed URL: three roundtrips, nine widths and native 200% zoom. Separately, anonymous real Tiramisu reads downloaded the 120,000-byte inline and 120,001-byte chunked images byte for byte, verified every displayed payload and all entity URLs, and rendered both themes at 390/768/1440. Ten sensitive/source paths returned 404. [Machine-readable evidence](sample-v3-deployment.json) records exact URLs, assets and checks.

These are bounded reviews and reproducible checks, not a guarantee of absolute safety. Live maximum-size uploads, real MetaMask signing, physical mobile wallets and other browser engines remain unverified. The existing Rabby/Tiramisu receipt evidence is linked from [verification](verification.md).

## Hub catalogue

The requested [arkiv-chunking card](https://stage.hub.arkiv.network/tools#tool-arkiv-chunking) is published through [Hub PR #106](https://github.com/Arkiv-Network/arkiv-hub/pull/106). Stage reports commit `5bdaf2e559b9d4a3511d98aa136e9a2c45a72cc9`, matching the successful deployment workflow. The concurrently added graph card and shared compact catalogue were preserved. After integration, lint, typecheck, all 207 tests, build and four existing Tools browser cases passed; both cards were inspected at nine widths in both themes, including the existing breakpoints.

On stage, both themes at 390/768/1440 passed in compact and expanded states without page overflow. The chunking install command copied exactly; all four card destinations matched their verified URLs, and opening the sample from the card displayed version 0.1.0. Its corrected deployment recovered a real 120,001-byte file from two chunks with the expected SHA-256. No new network writes, project setting changes or Vercel deletions were needed. [Stage evidence](sample-v3-hub.json) records the deployed version and checks. This initial catalogue publication listed chunking; the image entry was added separately below.

### Image card: ARKIV-STORE-IMAGES

[Hub PR #113](https://github.com/Arkiv-Network/arkiv-hub/pull/113) adds [ARKIV-STORE-IMAGES](https://stage.hub.arkiv.network/tools#tool-arkiv-store-images), pointing to the existing `arkiv-images@0.1.1` npm package and image sample. It preserves the graph and chunking entries and uses the existing compact presentation and consumer-guide prompt. No library rename, new npm release or sample implementation change was needed.

Lint, typecheck, 207 tests, build, CI and four existing Tools browser cases passed for the card change. Local inspection covered both themes at 390/768/1440 and native 200% zoom. On **2026-09-09**, stage served commit `26edcac4ea18b39551301f1bb87f0a366eed566b`: both themes and compact/expanded states at those three widths passed without overflow; typography matched the existing card role. Install/prompt clipboard contents and all destinations were verified. Opening the image sample directly from this card recovered and downloaded the real 120,001-byte Tiramisu PNG byte for byte, without a wallet. [Image-card evidence](image-card-evidence.json) records the observed deployment and results. Concurrent later Hub deployments can advance its commit while retaining this entry.
