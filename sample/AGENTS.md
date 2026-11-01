Edit instructions only in AGENTS.md; CLAUDE.md only imports this file.

# Integrating the image sample

Read README.md here and the package README/AGENTS.md before changing the sample. Preserve its existing visual design and English Arkiv copy.

- Run `npm ci` in sample; it pins the registry release arkiv-images 1.0.3, SDK 1.0.0 and chunking 1.1.2. Never import sibling source or duplicate package storage, chunking or transaction policy.
- Retrieval is read-only through /api/rpc. Set ARKIV_ACCESS_KEY server-side only; no browser access key, arbitrary RPC destination, signing method, batch request, historical-state query or raw provider error may pass the proxy.
- Browser writes use MetaMask/Rabby and the visitor's account/Rabdi RPC. Ask the visitor to configure their own key in their wallet if Rabdi is missing. Never request a private key or add a server signer. Guard account/network before each signature; never switch halfway through a write.
- Keep the selected file's createImageWriteOperation across clicks/re-renders, including failed or uncertain results. Setup runs after its sending guard is stored. Only an explicit new file choice creates another upload operation. Preserve submitted hashes before receipt rechecks; only an authoritative gas-exhausted revert permits the shared policy's one bounded retry.
- Preserve the safe public-image picker, full browser decode on both sides, measured transaction count, local-date expiration adapter, checks against the package lifetime limits, visible recovery keys/hashes and object URL cleanup.
- Inspection reads actual latest-state entities after verified package retrieval. Display stored bytes as text, expose typed metadata accurately, and keep inspection errors separate from verified image status. Do not claim a pinned snapshot or mark all attributes indexed.
- Fixed explorer origin, validated 32-byte keys, safe link rel values; no filename HTML or uploaded SVG/HTML rendering.
- Run the documented checks, then inspect 390/768/1440 widths, dark/light, keyboard and 200% zoom, loading/empty/error/recovered states. State what was controlled RPC and what was live. Preserve real failures.
- scripts/seed-rabdi.mjs at package root is idempotent through on-chain discovery and a private persistent unresolved-write journal. Never erase the journal to repeat a write.
