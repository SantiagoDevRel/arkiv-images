# Integrating the image sample

Read [README.md](README.md) to run the sample and follow its user flow. Read the [package consumer guide](../AGENTS.md) and linked package README for the API and hard invariants. Do not duplicate those instructions here.

- The sample consumes the exact released npm package. No sibling source imports, local dependency aliases, copied chunking or copied image-storage implementation.
- Ask the developer to choose a safe public image, connect a wallet and authorize testnet writes. Never ask for a private key. Ask for an image entity key if the objective is retrieval only; no wallet needed then.
- The sample is explicitly Tiramisu-only. Check wallet identity and chain before every write. Wallet selection uses EIP-6963 with injected EIP-1193 fallback; do not silently select another connected account.
- Connect in the top bar; connection switches/adds Tiramisu automatically. Never switch or retry a signature halfway through a write. Preserve account/network guards before every signature.
- Keep the public-image chooser, preview, measured transaction count and visible recovery errors. There is no consent checkbox. Store & verify performs retrieval automatically; success requires package completion, browser decode and byte verification. Clear old results before a new operation.
- The sample uses the SDK's Tiramisu RPC internally; no RPC editor or browser credentials. Never expose raw provider errors. Render filenames as text, recovered data only as PNG/JPEG. Revoke object URLs when replaced.
- Date/time is local to the browser and converted using fresh getBlockTiming data. Preserve the date adapter's clock, range and package admission checks; never assume a fixed block duration or promise exact clock-time expiration.
- The entity inspector makes separate read-only snapshot queries after package retrieval and checks them against the recovered bytes. Display actual keys, typed attributes and payloads. An inspection failure has its own error and must not invalidate an already verified image or present guessed entities.
- Preserve the Claude Design/Lovable layout and Arkiv token/type contract documented in README. Keep all interface copy, statuses and errors in English. Verify 390/768/1440 widths, both sides of 600 and 900 px, keyboard and 200% zoom, with empty/loading/error and restored-image states. Design provenance is linked from README; no design-service account is required to consume the sample.
- Run the documented build and browser checks, and state whether the wallet/RPC were mocked or real. A local tarball is not an npm release. Do not deploy this preview without the developer's review.
