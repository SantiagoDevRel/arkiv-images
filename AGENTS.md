# Integrating arkiv-images

This is the consumer guide; it is included in npm. Read [README.md](README.md) explicitly for the public API, runnable examples, dependency versions, limits, data model and recovery behavior. This guide does not replace it.

## Ask the developer

- Local inspection, existing-image retrieval, or a new public upload? The first needs no network; retrieval needs the image key and explicit testnet; only writes need a signing wallet and test funds.
- Which testnet/RPC and Entity Expiration in blocks? Use the actually tested combination in README. Never infer production or mainnet compatibility.
- Are the **original image bytes, filename and metadata** safe to make public? The tool keeps EXIF/GPS unchanged. If privacy is required, stop: encryption is a different tool, and this one does not solve it.
- For retrieval, ask for an image key and optionally an independently trusted SHA-256. Do not confuse an image entity key with its file-manifest key.
- For browser writes, ask the developer to connect their own MetaMask/Rabby account and confirm transactions. For Node, ask them to configure their key locally as described in README; never request a private key in chat. Provider access keys come from the provider/Hub links there.

Local `inspectImage` and `planImage` can be integrated immediately while legitimate network/product questions remain open.

## Preserve these invariants

- Import only the public package API; do not copy its storage, image validation or chunking implementation into the app. Use the released npm version in consumers.
- Binary image bytes belong in the payload; queryable metadata belongs in typed attributes. The package schema and dependency own these decisions. Do not search inside payloads or substitute SQL for SDK query syntax.
- Keep the testnet checks, size limits and integrity validation. No partial image, no silent lossy conversion, no pretending expiration erases history.
- A browser consumer must fully decode before upload and after retrieval, then render only the allowed raster MIME as an image. Manage/revoke Blob URLs. Filenames are text, not markup.
- Confirm completion only after `storeImage` resolves. Preserve confirmed hashes/manifest keys on failure, serialize writes, and do not automatically retry ambiguous writes. Check wallet account/network before every signature, including the final root write.
- Keep secrets out of source, logs, packages and browser bundles. Do not display raw SDK/provider errors. No server signer for the sample.
- No independent mutation/extension/ownership transfer of the parts. Root existence alone does not prove its referenced chunks are still available.

## Verify the integration

Follow the README in a new consumer. Import the public TypeScript types, run the exact local example, then test the requested network flow. Compare original and retrieved bytes and digest. Test unsupported/oversized files, wrong network, absent key, rejected writes, missing/corrupt chunks and browser decode errors. Distinguish mocked RPC, packed candidate and installed npm release. For UI, render small/medium/large widths and inspect loading, empty and error states. Record versions, network, actual results and unverified items.

Source maintainers: keep this guide, CLAUDE.md and verification in the publication allowlist. Sample instructions and agent guide live in `sample/`, linked from README; explicitly give them to consumer agents. No new skills, MCP, generator, encryption or media-management features belong to this tool.
