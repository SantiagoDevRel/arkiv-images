# Verification — arkiv-images 0.1.0

Verification date: 2026-09-08. This report distinguishes real Tiramisu transactions, controlled RPC tests and release gates. The npm archive contains the verification snapshot taken before publication; the [source report](https://github.com/SantiagoDevRel/arkiv-images/blob/feat/image-storage/docs/verification.md) records subsequent registry installation evidence.

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
| Browser automation | Playwright 1.62.1, installed Google Chrome; native pixel decoding |

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

Rendered widths: 390, 599, 600, 601, 768 and 1440 CSS pixels. DOM checks found no horizontal page overflow; computed typography and font loading matched the documented contract. Screenshots at 390/768/1440 also show the real-network JPEG result. Reflow was inspected at 200% CSS zoom; native browser-menu zoom and a physical touch device have not been separately verified. Screenshots are local test artifacts, not a deployed demo.

## Consumer and audit gates

A fresh agent with only the package/sample READMEs, consumer guides and an integration objective installed the packed candidate in a new directory. It ran the exact minimal example, compiled every public type against actual SDK clients, and read the real 120,000-byte image from Tiramisu without a wallet. Invalid format, excessive size, invalid/missing key, unexpected digest and wrong network failed as documented. No blocking documentation gaps were found; its suggestion of a complete anonymous-read example was incorporated.

Claude completed its source/security/logic/browser review after resuming a timed-out session. It independently retrieved all three live images and confirmed the recorded byte equality. It identified stale sample dependency contents and missing npm publication as blocking release gates. Those gates, clean registry consumption and source checkout verification are pending in this pre-publication snapshot; see the source report for their final status. Other observations were addressed through accurate error wording and documented JPEG limitations. The source repository includes the review resolution table in docs/claude-review.md.

## Preview and scope

The sample is available locally at http://127.0.0.1:3082 for developer review before deployment. No public demo deployment is claimed. The Arkiv Hub catalogue entry remains pending because its live-demo prerequisite cannot be met until that review/deploy step. No encryption, PDFs, new skills, MCP integration, scaffolding or unrelated Hub changes were added.
