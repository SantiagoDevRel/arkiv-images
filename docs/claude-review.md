# Claude review — 2026-09-08

Claude Code reviewed package source, sample, guides, tests and the packed-file allowlist. It ran 13 tests, type checking, the sample build, browser regression, package dry-run, npm registry checks and independent read-only Tiramisu queries. All three recorded images were byte-exact in its independent verification; it also checked transaction receipts.

| Finding | Resolution |
|---|---|
| Blocking: localhost served an old candidate with a 255-byte filename allowance | Release gate: replace the candidate with the registry package, force Vite dependency optimization and rerun browser checks. Current source rejects names above 128 UTF-8 bytes before any write. |
| Blocking: arkiv-images was not published, so clean sample install failed | Release gate: publish the audited archive; install it from npm in the sample and independent consumers; commit the sample lockfile. |
| Error message implied confirmed writes even on a rejected first request | Package and sample now describe available receipts without claiming a write occurred. Ambiguous failures still require inspecting the wallet. |
| File preview does not validate filenames | Preview reports image-byte validation and decode. Filename validation occurs in the package before any transaction. The documented filename limit remains authoritative; no duplicated storage implementation was added. |
| Verification report was stale | Replaced with actual SDK/runtime versions, all 13 tests, browser matrix and real receipt evidence. |
| JPEG trailing bytes are rejected | Documented explicitly as a strict format limitation; no format expansion added. |

The first call timed out after 900 seconds; resuming the same session returned the audit. Claude did not sign, publish or deploy. It disclosed an attempted cleanup of a repository-root tarball without confirming ownership; no loss was established and no tracked source changed. The archive used by this task lives outside the repository. Subsequent review instructions prohibit cleanup or any other mutation.

Final registry/cache verification will be recorded in [verification.md](verification.md). The initial review's STATUS: OK meant the audit completed; it did not override its two blocking release findings.
