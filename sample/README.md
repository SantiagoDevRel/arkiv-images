# Image storage sample

A minimal browser dapp: choose a public PNG/JPEG, connect your wallet on Tiramisu, store its original bytes, retrieve and render the verified image. It imports `arkiv-images@0.1.1` from npm; no local implementation alias or copied image/chunking code.

**These packages are intended for testnet use.**

[Open the live sample](https://arkiv-images-example.vercel.app). The deployed JavaScript and CSS match the verified local build; see [deployment evidence](../docs/sample-review-v3.md).

## Clean checkout

Node **22.12+** and npm; tested Node **22.22.3** on Windows and a clean install/build with Node **24.20.0**, npm **11.19.0** on Linux. Dependencies: `arkiv-images@0.1.1`, SDK `0.8.0`, viem `2.56.3`; build tooling TypeScript `5.9.3`, Vite `8.2.2`. The page displays the version exported by the installed library.

```sh
git clone --branch feat/image-storage https://github.com/SantiagoDevRel/arkiv-images.git
cd arkiv-images/sample
npm ci
npm run build
npm run dev
```

Open **http://127.0.0.1:3082**. No `.env`, private key, server signer or API integration setup is required to start the page. The port is fixed; if occupied, choose another with `npm run dev -- --port 3083` rather than killing an unknown process. HTTPS or localhost is required for Web Crypto and browser decoding.

## Complete flow

1. Click **Connect wallet** in the top bar. If multiple browser wallets are detected, choose MetaMask or Rabby there first. Connection automatically switches/adds Tiramisu and verifies the active account/network. Get test GLM from the linked faucet before storing.
2. In **Store**, choose a non-sensitive public PNG or JPEG. The preview reports exact bytes, dimensions, entity count and wallet confirmations. Unsupported/damaged/oversized images fail before signing. Original metadata, including EXIF/GPS, stays in the public file; there is no stripping or encryption.
3. Choose **Entity Expiration** with the calendar and time input. The browser's timezone is displayed; the initial choice is tomorrow. Fresh network timing converts the date to the package's block budget immediately before storing. The date is approximate: block cadence and time spent approving transactions affect actual expiration. Invalid/past dates, stale network timing and unsupported lifetimes fail before writing.
4. Click **Store & verify** and approve the measured transactions. The sample automatically retrieves and checks the stored bytes. Expected: the recovered image, **Matches your original byte for byte.**, filename/size/dimensions, estimated expiration and **Download original**. Keep the image key and inspect confirmed transaction receipts if needed.
5. **View entity** in Result opens the image entity in the Tiramisu block explorer. For chunked images, expand **All entities** for the image root, manifest and every chunk. Explore **How this image was retrieved** to inspect actual keys, typed attributes and payload sizes; each selected entity also has its own explorer link. The payload box contains **all bytes in hexadecimal**, with keyboard/touch scrolling, not a truncated preview. Select a chunk to see its zero-based byte range. **See the inspection query** shows the read-only SDK query with actual keys and snapshot block. The manifest's JSON metadata and the image's binary payload are explicitly distinguished.
6. Download the original. Reload, choose **Retrieve**, paste the image key and click **Retrieve image**. This requires no wallet or original file. Expected: **Image bytes verified.** and the same recovered image/inspector. **Integrity check** explains that SHA-256 checks bytes, not authorship.

The SDK's default Tiramisu RPC is internal to this sample; there is no RPC input or access-key field. Developers building another consumer can configure clients as described in the package README.

Dark mode is the default. The sun/moon button at the top right switches themes and remembers the choice in this browser. If storage is unavailable, switching still works for the current page. **Store & verify** without a wallet displays **Connect your wallet above to store this image.** and focuses the orange connection button; it sends no transaction.

Images above **120,000 bytes** automatically use the package's chunked path, up to the documented 25 MiB limit. For example, 120,001 bytes become two chunks (100,000 + 20,001 bytes), a file manifest and an image entity: **four entities, five wallet confirmations**, because the manifest is finalized in an additional transaction. Retrieval queries those parts, orders them by `seq`, joins the original bytes and verifies SHA-256 before rendering. Each payload box shows one complete entity's bytes; the image is assembled by the published package.

The [package README](../README.md) is the source of truth for data model, limits, network setup, provider/faucet links, API and error recovery. A chunked read makes multiple RPC queries; the browser assembles the bytes. The inspector performs additional read-only snapshot queries and checks their payloads against the verified result. If inspection fails, the verified image remains downloadable and a separate inspection error is shown. No PDF, gallery, encryption, compression or upload service is included.

Errors stay visible in the affected step. Missing/expired entities, missing/corrupt chunks, provider failures, rejected signatures and changed accounts stop the operation; no partial image is displayed. Inspect confirmed transaction hashes before repeating a failed upload. A file manifest key printed after failure is recovery evidence, not an image key.

On Windows, stop this sample's dev server before running `npm ci` again. Otherwise its native build binding can be locked and npm may report `EPERM`. Do not terminate unrelated processes.

## Agents and verification

To deploy your own copy, run `npx vercel login`, then `npx vercel deploy --prod` from `sample/` and select your own account/project. The included `vercel.json` uses `npm ci`, `npm run build` and `dist`; `.vercelignore` allows only build inputs. No environment variables or wallet credentials are required. Keep the complete lockfile: removing optional platform bindings can make Linux `npm ci` fail even when Windows builds pass.

Give your agent [sample AGENTS.md](AGENTS.md) and the [package AGENTS.md](../AGENTS.md) explicitly, together with the desired integration objective. CLAUDE.md points to the sample guide. Instructions are not automatically discovered from installed dependencies.

See [verification](../docs/verification.md) for published-vs-candidate status, browser matrix, actual network evidence and limitations. Before npm publication, an explicitly installed local `.tgz` can be used to evaluate the candidate; that is not the documented release installation gate.

The interface combines an actual **Claude Design** export using **Arkiv Design System** with the image chooser and entity-selection treatment from **Lovable**, guided by the sibling Arkiv Files sample. See [design provenance](../docs/design.md). All interface copy, states and errors are in English. Running the sample requires neither design-service account.

The wordmark is an unmodified official SVG. Space Grotesk is the approved open fallback for headings; IBM Plex Mono is used for body/controls. The reference's Ink top bar sits above a Sand page and white work panels. Typographic contract: h1 32/500/1.15; h2 24/500/1.2; body 16/400/1.5; controls/field labels 16/500/1.5; help/code 14/400/1.5; eyebrow 14/500/1.5 in the heading family; product label 20/500. At widths above 900 px, controls occupy a 400 px left column and the result fills the right; below that they stack. Entity steps use four columns, or two below 600 px. All keys wrap; long query code scrolls within its own area. Prototype simulations are not part of the sample.
