# Rabdi candidate verification

Candidate: **arkiv-images 1.0.0**, SDK **1.0.0**, viem **2.56.3**, exact registry **arkiv-chunking 1.1.0**. This source candidate is not an npm publication or production deployment. Review approval is required before either.

## Library and operation tests

Linux ARM64, Node 24.22.1: typecheck, build, syntax/current-guidance lint and **45 tests passed**. Tests exercise actual SDK encoding against a controlled in-memory RPC. They cover PNG/JPEG validation, size/MIME/dimension limits, inline/chunked exact-byte reconstruction, the 25 MiB ceiling, keyset pagination, wrong network, malformed chain IDs, missing/corrupt chunks, root/manifest changes, safe errors and browser-wallet guards.

The persistent operation is the same public API used by the sample. Binding send-count tests passed:

| Outcome | Sends for the same operation |
|---|---|
| Authoritative non-gas revert | 1 |
| Authoritative gas-exhausted revert | 2, with doubled/re-estimated gas inside the half-block ceiling |
| SDK success then disagreeing receipt | 1; submitted hash preserved before lookup |
| SDK success then null receipt, followed by another click | 1; the same rejected promise and recovery keys remain |
| Uncertain transport outcome | 1; another click cannot resend |

An additional test proves asynchronous wallet/date setup starts only after the persistent sending guard is stored. Full decoding and rendered behavior require the separate browser gate; container/unit tests do not certify a browser decoder.

## Actual Rabdi evidence

[rabdi-evidence.json](rabdi-evidence.json) contains four live cases and authoritative successful receipts:

| Format | Storage | Original bytes | Expiration used |
|---|---|---:|---|
| PNG | Inline | 120,000 | 3,600 blocks |
| PNG | Chunked | 120,001 | 3,600 blocks |
| JPEG | Inline | 2,977 | Maximum admitted 7,883,970 blocks, less inclusion delay |
| JPEG | Chunked | 130,001 | 3,600 blocks |

Each original/retrieved byte array was compared exactly and its digest verified. Every receipt status was successful; every transaction had gas at least twice measured usage and no more than half the 30,000,000 head gas limit. Across 12 confirmed writes, maximum gasUsed was **4,851,921** and maximum submitted gas was **9,783,200**. A second complete seed run returned the same image keys and transaction hashes without another write. Both runs used the dedicated image test wallet; no funder signing.

The largest image tested live is 130,001 bytes. The 25 MiB maximum was tested against controlled RPC, not submitted to Rabdi. The large synthetic samples expire soon; rerun the idempotent seed after expiration or a network reset. A root key alone is not a promise of availability.

Long expiration materially affects estimates: unsigned 120,000/100,000/70,000-byte maximum-lifetime probes estimated 18,539,745 / 15,508,335 / 10,961,427 gas. Their doubled budgets exceeded the admission ceiling and were rejected before signing. The gate was preserved; large live cases used a shorter lifetime, while the small JPEG verified a maximum-lifetime create.

## Artifacts and sample gate

`node scripts/verify-candidate.mjs` requires live evidence, runs the library gates, packs the publication allowlist, installs that exact tarball in a clean consumer, runs the exact README inspection example and public TypeScript imports, refreshes the sample lock from the registry and builds the sample. Its artifact report records SHA-256/SHA-512 and distinguishes a packed candidate from a registry release. The sample pins chunking 1.1.0 directly and consumes the packed image candidate.

The preview uses the existing arkiv-images-example project. Read access is through its bounded server-side endpoint with a server-only access key; browser writes use the visitor's configured Rabdi wallet. Hydrated preview validation and its deployment ID are recorded in the PR's validation report. Live browser retrieval, local input/decode failures and controlled wallet/operation tests are different checks; neither replaces the other. No npm publish, production deploy, tag, merge or release belongs to this candidate review.

Historical dated evidence remains under docs and is not validation of this release. The previous chunking 1.0.0 public-export failure was resolved by the separately published 1.1.0; no private dependency import, copied gas policy or relaxed acceptance rule was used.
