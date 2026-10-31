# Changelog

## 1.0.0 — candidate

- Breaking: SDK 1.0.0 peer requirement and Rabdi testnet, chain ID 7794095.
- Breaking: named `arkiv-images/v2` schema with non-indexed binary data and typed columns. Older image formats are not read by this release.
- Breaking: arkiv-chunking 1.1.0 with its public write policy and latest-state keyset pagination; no historical snapshot guarantee.
- Breaking: maximum admitted lifetime 7,883,970 blocks with an inclusion margin; no unlimited lifetime.
- Public per-write transaction policy, explicit latest estimates/gas/price/nonce, half-block admission ceiling, and recovery keys/hashes when confirmation is pending.
- Persistent createImageWriteOperation state across UI renders/clicks. Submitted hashes are recorded before receipt rechecks; uncertain, successful and terminal results cannot trigger another send for the same operation.
- Sample read proxy keeps its access key server-side; the visitor signs through their own configured wallet RPC. Idempotent synthetic PNG/JPEG seed with a persistent unresolved-write journal.

This candidate is not published. Validation status is documented in docs/verification.md.
