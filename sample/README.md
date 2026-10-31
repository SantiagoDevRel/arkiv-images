# Image sample — Rabdi candidate

This source candidate keeps the existing image picker, local-date Entity Expiration, byte verification, download, entity inspector, dark/light themes and wallet selection. All copy is English. It targets the existing **arkiv-images-example** Vercel project; production publication is deferred.

The UI uses the package public API. Reads go through its own bounded `/api/rpc` function with server-only `ARKIV_ACCESS_KEY`. Only chain ID, block timing and bounded image/chunk queries are accepted; no signer, access key, upstream URL or raw provider error is sent to the browser. Root and manifest reads are latest state; chunks use keyset pages. Set a free [Hub access key](https://hub.arkiv.network/access-keys) in the Vercel preview environment.

Writes use the visitor's MetaMask/Rabby account and configured Rabdi RPC, chain 7794095. If Rabdi is missing, configure it in the wallet using your own access key, then connect again. The app switches to an already configured Rabdi network; it never installs a server key in a wallet. Obtain [test funds](https://hub.arkiv.network/faucet). Every actual signature is guarded for account/network changes and uses the package's explicit gas policy.

## Build this candidate

From the package root, after dependencies are available:

```sh
npm run build
npm pack --pack-destination sample
cd sample
npm install --no-audit --no-fund
npm run build
```

The candidate sample dependency is `file:./arkiv-images-1.0.0.tgz`, produced by the root pack in the sample folder, rather than the older registry release. This is an artifact integration test, not registry verification. Deploy the sample folder, including this tarball, to the existing linked project; its publication allowlist includes the candidate and API function.

The Vite development server alone does not serve Vercel functions. Use a Vercel preview for the complete real-network read flow; controlled browser tests route `/api/rpc` to the in-memory harness. Never put an access key in Vite environment variables.

Seed non-sensitive PNG/JPEG examples with `node scripts/seed-rabdi.mjs` from the package root after configuring local test credentials. Keep `.seed-rabdi-state.json` between runs; unresolved writes block further seed writes. Successful seeding writes `sample/public/samples.json` and `docs/rabdi-evidence.json`; the Retrieve tab offers a public sample only when that manifest exists. A Rabdi reset requires rerunning the command, not hardcoded assumptions that old entity keys still exist.

The sample fully decodes images before writes and after retrieval, displays only allowed raster MIME, treats filenames as text and revokes Blob URLs. All original image bytes and metadata, including EXIF/GPS, remain public. Use synthetic images. The entity inspector performs separate latest-state read checks and can fail without hiding an already verified image.

For controlled browser checks, run the project browser script against an isolated app context and save evidence separately. Verify 390/768/1440 widths, both themes, keyboard and 200% zoom plus empty/loading/error/recovered states. Actual candidate results are in [verification](../docs/verification.md); the PR records the hydrated preview and deployment ID. Browser-wallet signing remains a separate check from controlled wallet tests and live Node signatures.

The existing layout mirrors the project's Arkiv token/type contract. This migration changes network/data behavior and preserves the design; historical design evidence remains dated under docs.

The locked build tools have two high-severity npm audit findings: `vite` and `source-map-js`, both development dependencies. See the [Windows editor middleware advisory](https://github.com/advisories/GHSA-587h-7wmj-h5pm) and [source-map offset advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). This preview serves built assets and a Node read function, not a Vite development server. These existing tool versions were not upgraded in the migration; the full dependency audit is not clean. Update the affected build tools before exposing a development server or accepting untrusted source maps.
