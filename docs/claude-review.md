# Claude review — 2026-09-08

Claude Code reviewed package source, sample, guides, tests and the packed-file allowlist. It ran 13 tests, type checking, the sample build, browser regression, package dry-run, npm registry checks and independent read-only Tiramisu queries. All three recorded images were byte-exact in its independent verification; it also checked transaction receipts.

| Finding | Resolution |
|---|---|
| Blocking: localhost served an old candidate with a 255-byte filename allowance | Closed: installed the registry package, forced Vite dependency optimization and reran browser checks. Claude independently verified matching artifact hashes and the served 128-byte filename gate. Current source rejects names above 128 UTF-8 bytes before any write. |
| Blocking: arkiv-images was not published, so clean sample install failed | Closed: published 0.1.0 and the 0.1.1 documentation patch; installed from npm in the sample and independent clean consumers. The release change includes the sample registry lockfile. |
| Error message implied confirmed writes even on a rejected first request | Package and sample now describe available receipts without claiming a write occurred. Ambiguous failures still require inspecting the wallet. |
| File preview does not validate filenames | Preview reports image-byte validation and decode. Filename validation occurs in the package before any transaction. The documented filename limit remains authoritative; no duplicated storage implementation was added. |
| Verification report was stale | Replaced with actual SDK/runtime versions, all 13 tests, browser matrix and real receipt evidence. |
| JPEG trailing bytes are rejected | Documented explicitly as a strict format limitation; no format expansion added. |

The first call timed out after 900 seconds; resuming the same session returned the audit. Claude did not sign, publish or deploy. It disclosed an attempted cleanup of a repository-root tarball without confirming ownership; no loss was established and no tracked source changed. The archive used by this task lives outside the repository. Subsequent review instructions prohibit cleanup or any other mutation.

Final registry/cache verification will be recorded in [verification.md](verification.md). The initial review's STATUS: OK meant the audit completed; it did not override its two blocking release findings.

Final patch review: Claude independently fetched the setup destinations and confirmed staging serves Tiramisu while production still serves Braga and returns 404 for access keys. It verified that the only runtime change for 0.1.1 is VERSION, and reported no code blockers. The stale report heading was corrected in source; the immutable npm snapshot is explicitly identified in verification.md. Publication, sample version and registry integrity were independently corroborated by Claude. Consumer 0.1.1 integration also passed separately. Public demo deployment and Hub stage integration remain intentionally outside this preview release.

## Claude Design and concise English sample

A separate Claude Code session reviewed the actual design integration, English runtime copy and rendered screenshots. Its first pass identified a hidden size limit, inconsistent Store/upload terminology and repeated next-step instructions. Those were corrected. The required literal testnet notice was retained despite a suggested paraphrase, because the delivery requirement takes precedence.

The final pass inspected source and 390/768/1440 real-network screenshots plus the native-zoom artifact. It found no code/UI blocker and confirmed wallet/chain guards, public metadata consent, measured transaction count and failure recovery evidence. The author-identity caveat remains accessible under native **Verification details** as a deliberate concise-copy decision.

Its release finding was that the source links needed the new interface and official SVG on the documented default branch. The initial branch assessment used a stale local ref. After PR #2 merged, Claude verified GitHub's remote default `feat/image-storage` at `0b27dfa`, the English page and consumer guide, and the official SVG's hash. It explicitly closed the finding with no remaining blockers. The final review was read-only; it inspected evidence without rerunning the test suite.

Grok was also invoked for the requested clarity review. Its service returned an out-of-usage error before providing a review. No Grok review is claimed. No sample deployment was performed.
