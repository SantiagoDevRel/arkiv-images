Edit instructions only in AGENTS.md; CLAUDE.md only imports this file.

# Integrating arkiv-images

Read [README.md](README.md) explicitly for the public API, runnable local example, data model, limits, signing and recovery. Version 1.0.0 is a candidate until verification/publication evidence says otherwise.

- Ask whether the task needs local inspection, retrieval or a new public upload. Inspection requires no network. Retrieval needs an image key, Rabdi and optionally an independently trusted SHA-256. Writes additionally require a locally configured signing wallet and test funds.
- Ask whether original bytes, filename and metadata are safe to publish. EXIF/GPS is preserved. Stop if confidentiality is required; encryption is a different tool.
- Use Rabdi chain 7794095 with SDK 1.0.0. Ask for an explicit Entity Expiration within the admitted block range. Access keys and test funds come from the Hub links in README. Never request a private key in chat.
- Import only public package APIs. Reuse arkiv-chunking's publicly exported write policy; no private dependency imports or copied storage/chunking/gas logic. Bytes use non-indexed bytes columns; query only indexed typed metadata with SDK predicates.
- Preserve MIME/size/network/integrity/decode checks and public TypeScript types. A browser must decode before upload and after retrieval, render only PNG/JPEG, treat filenames as text and revoke Blob URLs.
- Every write uses unsigned latest-state estimation, explicit gas/price/latest nonce and at least twice estimate, below half the head block gas limit. Do not use unlimited lifetime or historical state reads. Never automatically retry successful or uncertain writes.
- Serialize account writes. Recheck browser wallet identity/network before each signature, including the final root. Confirm completion only after storeImage resolves. Preserve error imageKey/manifestKey/transactionHashes, including CONFIRMATION_PENDING. Never display raw provider errors or causes.
- No independent part mutation, transfer or extension. Root existence does not prove chunk availability; expiration does not erase historical copies.
- Sample reads keep the access key server-side in its own endpoint. Browser writes use the visitor's configured wallet RPC; no shared server signer.
- Verify the exact local example, public types, meaningful controlled failure cases, requested live network flow and original/retrieved byte equality. Distinguish controlled RPC, packed candidate and registry release. Inspect sample empty/loading/error/recovered states at narrow/medium/wide widths.
- Keep AGENTS.md, CLAUDE.md and verification in the npm publication allowlist. Explicitly provide consumers the sample guides. No new skill, MCP, generator, encryption or media-management features belong here.
