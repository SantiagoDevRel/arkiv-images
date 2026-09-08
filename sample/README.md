# Image storage sample

A minimal browser dapp: choose a public PNG/JPEG, connect your wallet on Tiramisu, store its original bytes, retrieve and render the verified image. It imports `arkiv-images@0.1.1` from npm; no local implementation alias or copied image/chunking code.

**These packages are intended for testnet use.**

## Clean checkout

Node **22.12+** and npm; tested Node **22.22.3**. Dependencies: `arkiv-images@0.1.1`, SDK `0.8.0`, viem `2.56.3`; build tooling TypeScript `5.9.3`, Vite `8.2.2`. The page displays the version exported by the installed library.

```sh
git clone --branch feat/image-storage https://github.com/SantiagoDevRel/arkiv-images.git
cd arkiv-images/sample
npm ci
npm run build
npm run dev
```

Open **http://127.0.0.1:3082**. No `.env`, private key, server signer or API integration setup is required to start the page. The port is fixed; if occupied, choose another with `npm run dev -- --port 3083` rather than killing an unknown process. HTTPS or localhost is required for Web Crypto and browser decoding.

## Complete flow

1. Choose a small, non-sensitive PNG or JPEG. The preview reports exact bytes, dimensions, storage mode and number of transaction confirmations. Unsupported formats, damaged images and limits fail before requesting a signature.
2. Choose MetaMask or Rabby in **Wallet**, click **Connect wallet**, then **Use Tiramisu** if necessary. The latter requests adding/switching the network through your wallet. Each visitor signs from their own account. Fund that account with test GLM using the faucet linked on the page.
3. Under **Storage settings & details**, keep the default Tiramisu RPC or provide a browser-appropriate authorized URL if your provider requires an access key. It stays only in this tab, not localStorage or analytics. The default expiration is 43,200 blocks, not a fixed hour/day promise.
4. Read and accept the public-image acknowledgement. It includes **original EXIF/GPS metadata**; no stripping or encryption happens. Click **Store image**, and approve each transaction in your wallet. Start small: larger images require multiple confirmations, shown before upload.
5. Keep the **image entity key** shown after all transactions finish. Click **Retrieve image**. Expected: the image renders with the caption **Recovered from Arkiv**, `Verified: matches your original byte for byte.`, dimensions, byte count and **Download original**. SHA-256 is under **Verification details**.
6. Download the verified original. Reload and paste the image key to demonstrate retrieval without in-memory original bytes or a connected wallet. The message now says `Retrieved and verified.`; the disclosure explains that digest verification does not establish the author's identity.

The [package README](../README.md) is the source of truth for data model, limits, network setup, provider/faucet links, API and error recovery. A chunked read makes multiple RPC queries; the browser assembles the bytes. No PDF, gallery, encryption, compression or upload service is included.

Errors stay visible in the affected step. Missing/expired entities, missing/corrupt chunks, provider failures, rejected signatures and changed accounts stop the operation; no partial image is displayed. Inspect confirmed transaction hashes before repeating a failed upload. A file manifest key printed after failure is recovery evidence, not an image key.

On Windows, stop this sample's dev server before running `npm ci` again. Otherwise its native build binding can be locked and npm may report `EPERM`. Do not terminate unrelated processes.

## Agents and verification

Give your agent [sample AGENTS.md](AGENTS.md) and the [package AGENTS.md](../AGENTS.md) explicitly, together with the desired integration objective. CLAUDE.md points to the sample guide. Instructions are not automatically discovered from installed dependencies.

See [verification](../docs/verification.md) for published-vs-candidate status, browser matrix, actual network evidence and limitations. Before npm publication, an explicitly installed local `.tgz` can be used to evaluate the candidate; that is not the documented release installation gate.

The interface was designed in **Claude Design**, using the account's **Arkiv Design System**, then integrated with the existing real npm/wallet flow. See [design provenance](../docs/design.md). All interface copy, states and errors are in English. Running the sample does not require a Claude Design account.

The canonical Arkiv wordmark is an unmodified SVG. Headings use the approved open fallback Space Grotesk; body/controls use IBM Plex Mono, with the dark Ink/Sand/Orange palette. Typographic contract: h1 32/500/1.1 at every width; h2 24/500/1.1; body/controls 16/400/1.5, field labels and primary controls 500; help/code 14/400/1.5; eyebrow 14/500/1.5 in the heading family. There is one column at every width and a spacing/control breakpoint at 600 px. Long keys wrap and can be selected as a whole. Prototype-only state simulations are not part of the sample.
