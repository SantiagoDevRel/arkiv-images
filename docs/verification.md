# Verification: arkiv-images 0.1.1

Verification date: 2026-09-08. Version 0.1.1 corrects the Tiramisu setup links from the production Hub (still serving retired Braga) to the verified Hub staging pages. The storage implementation is unchanged from 0.1.0; only its exported version changes. Real writes below were made with 0.1.0, and the same entities were read again with 0.1.1. This report distinguishes real Tiramisu transactions, controlled RPC tests and release gates. The npm archive contains the verification snapshot taken before publication; the [source report](https://github.com/SantiagoDevRel/arkiv-images/blob/feat/image-storage/docs/verification.md) records subsequent registry installation evidence.

## Tested combination

| Component | Actually tested |
|---|---|
| Node / npm | 22.22.3 / 10.9.8 |
| TypeScript | 5.9.3; public consumer types compiled with strict NodeNext, without skipLibCheck |
| Arkiv SDK / viem | 0.8.0 / 2.56.3 |
| Chunk dependency | arkiv-chunking 0.1.0 from npm registry |
| Sample tooling | Vite 8.2.2 |
| Network | Tiramisu, RPC-confirmed chain ID 7738577 |
| Live signer | Rabby, explicitly authorized Arkiv Wallet; address in the receipt evidence |
| Browser automation | Playwright 1.62.1, Google Chrome 152.0.7977.77; native pixel decoding |

Other SDK versions, networks, Firefox/Safari, mobile wallet browsers and a real MetaMask extension signing flow are not claimed tested. MetaMask-compatible EIP-1193 requests and EIP-6963 discovery were exercised with an injected test wallet; Rabby performed the real writes.

## Real network, original bytes verified

[Machine-readable receipts and image keys](testnet-evidence.json) include SHA-256, creation blocks, queried expiration, gas, calldata and signed transaction sizes. `node scripts/verify-network.mjs` reads Tiramisu again, compares the recovered bytes with the synthetic source fixtures, and checks all receipts, signer, target, zero native-token value and chain. It performs no writes and will fail when the temporary entities expire.

| Synthetic image | Flow | Confirmed transactions | Largest signed transaction |
|---|---|---|---|
| PNG, 120,000 bytes, 320 × 200 | Inline write → query → render → byte equality | 1 | 122,418 bytes |
| PNG, 120,001 bytes, 320 × 200 | Manifest + 2 chunks + finalize + image entity → reconstruction → render → byte equality | 5 | 101,458 bytes |
| JPEG, 2,977 bytes, 320 × 200 | Inline write → query → render → byte equality | 1 | 5,424 bytes |

An independent Node reader verified the same original bytes, digests and transaction receipts. Real RPC tests also confirmed missing image (`NOT_FOUND`) and configured-network mismatch (`NETWORK_MISMATCH`). Test GLM was spent only on Tiramisu. No personal photo or private credential is part of the fixtures or published files.

## Controlled regression checks

`npm test`: 13 passing tests with the actual SDK encoder/query decoder and a controlled RPC. Coverage includes validation, threshold planning, inline and chunked byte equality, JPEG, a maximum-length 128-byte filename, rejected writes, wrong chain, absent image, corrupted bytes/metadata, missing chunks and preserved manifest/receipts when final image creation fails. The full 25 MiB roundtrip exercises 263 chunks, 266 transactions and pagination beyond 200 entities. **25 MiB is simulated, not a live-network upload claim.**

`npm run typecheck` and the sample's `npm run build` pass. No lint command exists in this repository.

`npm run test:browser`: isolated browser context, injected wallet and controlled RPC, real SDK/package and pixel decoder. PNG inline, JPEG and chunked PNG upload/retrieve/download pass; download bytes match. Reload-and-read works without the original file or connected wallet. Empty, loading, missing-entity, RPC failure, rejected-signature, wrong-chain and invalid-file states were exercised.

Rendered widths: 390, 599, 600, 601, 768 and 1440 CSS pixels. DOM checks found no horizontal page overflow; computed typography and font loading matched the documented contract. Screenshots at 390/768/1440 also show the real-network JPEG result. Reflow passed both CSS zoom and **native Chrome page zoom at 200%**, set through browser settings in an isolated temporary profile. CDP confirmed browser zoom 2, CSS zoom 1, no page overflow and a decoded image; screenshots use device layout coordinates to avoid a Chrome/Playwright clipping mismatch at native zoom. Keyboard navigation reaches wallet controls and opens/closes the settings disclosure with Enter. A physical touch device has not been tested. Screenshots are local artifacts, not a deployed demo.

## Consumer and audit gates

A fresh agent with only the package/sample READMEs, consumer guides and an integration objective installed the packed candidate in a new directory. It ran the exact minimal example, compiled every public type against actual SDK clients, and read the real 120,000-byte image from Tiramisu without a wallet. Invalid format, excessive size, invalid/missing key, unexpected digest and wrong network failed as documented. No blocking documentation gaps were found; its suggestion of a complete anonymous-read example was incorporated.

Version 0.1.0 was published at 2026-09-08T22:09:43Z with SHA-1 78aa4b0593dd4c9a03f0aebe350fb12e37a9b08d. A second clean directory installed it from npm, verified the registry lockfile, compiled every public type with strict TypeScript, executed both documented examples and retrieved both real inline/chunked PNGs without a wallet. The sample also passed npm ci and build from that registry version. All consumer guides were present in the installed package.

Claude completed its source/security/logic/browser review after resuming a timed-out session. It independently retrieved all three live images and confirmed the recorded byte equality. It identified stale sample dependency contents and missing publication as release blockers. Both closed: a follow-up independently hashed the published tarball and served JavaScript, confirmed the 128-byte filename gate, and reported no code blockers. Full resolution table: docs/claude-review.md in the source repository.

The 0.1.1 archive contains this pre-publication snapshot. Its registry install and final checkout evidence will be added to the source report after publication. Setup destinations were inspected as rendered pages: staging /networks shows Tiramisu 7738577 and the correct RPC, /api-keys offers Tiramisu keys, and /faucet requires connecting/signing in with a wallet. No new key or faucet claim was performed. Production /api-keys returned 404 and /networks still showed Braga; this is why 0.1.1 changes those links.

## Final registry checks

Version **0.1.1** is published at 2026-09-08T22:18:33.078Z. The registry tarball SHA-1 is `aa60aab4e5694a30de55e1e01c87415559aae435`; its SHA-512 integrity was independently recalculated and matches the sample lockfile. See [release evidence](release-evidence.json). The npm archive contains the pre-publication snapshot above and retains a 0.1.0 report heading from the baseline; its package manifest and README identify 0.1.1 correctly. This source report corrects that heading and is the final post-publication evidence.

A fresh agent installed **0.1.1 from npm** in another new directory, verified registry URL/integrity and shipped guides, ran the exact README examples, compiled all public types with strict TypeScript (without skipLibCheck), and independently verified SHA-256 for both real inline and chunked PNGs. No documentation blockers, wallet actions or network writes. The sample now pins 0.1.1 with a registry lockfile; its build and all browser regression cases passed again. The browser test explicitly checks the displayed installed version. A fresh real-network JPEG read in the final sample rendered successfully at 390/768/1440, with no page overflow.

Claude independently corroborated the staging links, npm publication and unchanged storage code in 0.1.1. No code blockers remained; the source report heading is corrected here.

## Final English interface

The [Claude Design export](design.md) is integrated with the real sample. All controls, statuses, errors and guides are English. After a separate Claude copy review, the page uses one storage-settings disclosure, keeps SHA-256 under verification details and removes repeated idle/next-step prose. Essential limits, public metadata consent and the measured transaction count remain visible before signing. The empty page contains 106 visible words in the inspected Rabby browser; wording count can vary with wallet discovery/state. No essential instruction depends on a hover-only tooltip.

The final copy passed the sample build, all three controlled browser roundtrips, six widths, keyboard disclosures and native 200% zoom. A fresh real-network JPEG read in this English interface displayed package v0.1.1 and decoded at 390/768/1440 with no page overflow. Grok was also requested for the copy review, but its service returned an out-of-usage error; no Grok review is claimed.

Measured contrast: field border against its background 4.75:1, primary button text 7.01:1, help text 11.17:1. These probes cover those roles, not a blanket accessibility certification.

After [PR #2](https://github.com/SantiagoDevRel/arkiv-images/pull/2) merged, the documented default branch `feat/image-storage` at `0b27dfa` was verified in a separate clean checkout: `npm ci`, `npm run build`, `npm run dev -- --port 3099`, English DOM and official wordmark, then a wallet-free real Tiramisu JPEG retrieval and byte-exact 2,977-byte download. The separate port avoids the running developer preview. The lockfile resolves arkiv-images 0.1.1 from npm, not a local alias. Claude independently checked GitHub's remote default files and closed its source-availability finding; no remaining blockers from its review.

## Preview and scope

The sample is available locally at http://127.0.0.1:3082 for developer review before deployment. No public demo deployment is claimed. The Arkiv Hub catalogue entry remains pending because its live-demo prerequisite cannot be met until that review/deploy step. No encryption, PDFs, new skills, MCP integration, scaffolding or unrelated Hub changes were added.
