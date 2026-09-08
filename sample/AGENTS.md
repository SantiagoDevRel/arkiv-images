# Integrating the image sample

Read [README.md](README.md) to run the sample and follow its user flow. Read the [package consumer guide](../AGENTS.md) and linked package README for the API and hard invariants. Do not duplicate those instructions here.

- The sample consumes the exact released npm package. No sibling source imports, local dependency aliases, copied chunking or copied image-storage implementation.
- Ask the developer to choose a safe public image, connect a wallet and authorize testnet writes. Never ask for a private key. Ask for an image entity key if the objective is retrieval only; no wallet needed then.
- The sample is explicitly Tiramisu-only. Check wallet identity and chain before every write. Wallet selection uses EIP-6963 with injected EIP-1193 fallback; do not silently select another connected account.
- Keep the preview, measured upload plan, public-metadata acknowledgement and visible recovery errors. Success requires package completion, successful browser decode and verified retrieval. Clear old results before a new operation.
- Keep RPC URLs in this tab and out of logs/storage; never expose raw provider errors. Render filenames as text, recovered data only as PNG/JPEG. Revoke object URLs when replaced.
- Preserve the Claude Design layout and Arkiv token/type contract documented in README. Keep all interface copy, statuses and errors in English. Verify 390/768/1440 widths, both sides of 600 px, keyboard and 200% zoom, with empty/loading/error and restored-image states. Design provenance is linked from README; no design-service account is required to consume the sample.
- Run the documented build and browser checks, and state whether the wallet/RPC were mocked or real. A local tarball is not an npm release. Do not deploy this preview without the developer's review.
