# Hub integration handoff — issue #98

Package and sample source: https://github.com/SantiagoDevRel/arkiv-images
Canonical npm: https://www.npmjs.com/package/arkiv-images/v/0.1.1
Sample setup: https://github.com/SantiagoDevRel/arkiv-images/blob/feat/image-storage/sample/README.md
Consumer documentation: https://github.com/SantiagoDevRel/arkiv-images/blob/feat/image-storage/README.md
Verification: https://github.com/SantiagoDevRel/arkiv-images/blob/feat/image-storage/docs/verification.md

The requested review order is localhost first, then sample deployment. The `/tools` catalogue requires a verified public demo. Consequently no public demo URL, Hub entry, Hub PR or stage verification is claimed yet. Issue #98 remains open.

After the developer reviews http://127.0.0.1:3082:

1. Confirm the deployment target and complete the existing Arkiv brand review with the brand owner. Deploy only the sample; it consumes arkiv-images@0.1.1 from npm and needs no server credentials. Use a deployment file allowlist and check sensitive paths as required by repository policy.
2. Verify the public app's displayed package version, visitor-wallet flow, original-byte retrieval and rendered image. Use only a wallet/network explicitly authorized for that run.
3. Add the image-storage entry to the existing Arkiv Hub typed catalogue, using its current presentation and schema. Do not redesign `/tools`. Purpose: store public PNG/JPEG bytes, query indexed image metadata and reconstruct the original image. Prerequisites: Tiramisu, visitor wallet plus test GLM for writes; reads need no wallet; access key only if the selected provider requires it. Limits and chunk dependency must match the package README. Use the actually verified demo URL, never a guessed deployment URL.
4. Run the Hub's applicable checks and frontend/UX, logic/security and vocabulary review. Open one focused PR to `develop` linked to [issue #98](https://github.com/Arkiv-Network/arkiv-hub/issues/98). Verify the canonical links and entry on stage after integration. Production promotion is separate.

The package/sample are independent deliverables. No encryption (#97), generic chunking changes (#96), unrelated Hub UX (#91), skills, MCP integration or scaffolding belong in that PR.
