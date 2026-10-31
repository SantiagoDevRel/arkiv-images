# Verify arkiv-images 1.0.3

Use Node 22.10+ on the DGX. From this checkout run `npm ci --no-audit --no-fund`, then `node scripts/verify-candidate.mjs`. The script reads package.json, runs library gates, packs that exact version, installs it in a private clean consumer, checks runtime VERSION and public TypeScript imports, and builds an isolated copy of the sample using the same archive. It preserves the sample registry pin and lockfile.

To check a registry installation of the same version, run `node scripts/verify-candidate.mjs --registry`. It verifies registry shasum/integrity and byte equality with this source build. Both modes require the registered DGX job private TMPDIR and perform no chain writes. Run `node scripts/vocabulary-guard.mjs` and `node scripts/vocabulary-build-mutation.mjs` for complete-tree and source-to-bundle checks.

The public example selects the longer-lived inline JPEG `0x2989bda8bbadfe7e22a0b1e3a435aa3b266106adbbca3f97c162ee4eccca8488` and filters entries using the current block. The short-lived PNG and chunked examples in the old measurements have expired; those measurements are not an availability promise.

> Historical 1.0.0 measurements and procedure below are preserved from 51f4905; use the current procedure above for 1.0.3.

# Rabdi release verification

Release: **arkiv-images 1.0.0**, SDK **1.0.0**, viem **2.56.3**, exact registry **arkiv-chunking 1.1.0**. The separately approved tarball was published without rebuilding: SHA-256 `c4c5417edb32179f7cc2f39b2e959711103925f019a0bd0ba62e84593826c110`, npm shasum `ff85d022ad0d3e074f002fec06a52cb2914b1d34`. Registry installation is checked independently from the earlier candidate installation.

## Library and operation tests

Linux ARM64, Node 24.22.1: typecheck, build, syntax/current-guidance lint and **51 tests passed**. Tests exercise actual SDK encoding against a controlled in-memory RPC. They cover PNG/JPEG validation, size/MIME/dimension limits, inline/chunked exact-byte reconstruction, the 25 MiB ceiling, keyset pagination, wrong network, malformed chain IDs, missing/corrupt chunks, root/manifest changes, safe errors and browser-wallet guards.

The persistent operation is the same public API used by the sample. Binding send-count tests passed:

| Outcome | Sends for the same operation |
|---|---|
| Authoritative non-gas revert | 1 |
| Authoritative gas-exhausted revert | 2, with doubled/re-estimated gas inside the half-block ceiling |
| SDK success then disagreeing receipt | 1; submitted hash preserved before lookup |
| SDK success then null receipt, followed by another click | 1; the same rejected promise and recovery keys remain |
| Uncertain transport outcome | 1; another click cannot resend |

An additional test proves asynchronous wallet/date setup starts only after the persistent sending guard is stored. Full decoding and rendered behavior require the separate browser gate; container/unit tests do not certify a browser decoder.

Six regression cases cover SDK errors carrying an uncertain transaction hash at the inline root, second chunk and manifest finalization, with receipt lookups returning null or throwing. The operation retains every observed hash before the lookup, the final error exposes it exactly once, prior manifest recovery remains available, and later clicks reuse the same promise without resending. Images observes only the public wallet `createEntity`/`patchEntity` boundary; chunking 1.1.0 still owns estimates, gas, receipts and retries. The new regressions failed before this correction.

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

`node scripts/verify-candidate.mjs --registry` requires the existing live evidence, runs library gates, verifies the registry archive against the approved SHA-256/SHA-512/shasum, installs exact registry 1.0.0 in a clean consumer and runs the exact README inspection example, public TypeScript imports and linked-guide presence checks. It compares installed JavaScript with the built source, performs a clean sample install and builds it. Its registry artifact report distinguishes these checks from the earlier packed-candidate tests. The sample pins registry images 1.0.0 and chunking 1.1.0 directly; no local tarball is used.

The sample uses the existing arkiv-images-example project. Read access is through its bounded server-side endpoint with a server-only access key; browser writes use the visitor's configured Rabdi wallet. Hydrated deployment validation, production and rollback IDs are recorded separately in the release handoff. Live browser retrieval, local input/decode failures and controlled wallet/operation tests are different checks; neither replaces the other. Browser-wallet signing was not exercised in the migration checks.

Historical dated evidence remains under docs and is not validation of this release. The previous chunking 1.0.0 public-export failure was resolved by the separately published 1.1.0; no private dependency import, copied gas policy or relaxed acceptance rule was used.
