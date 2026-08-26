# Aura product discovery

Status: proposed direction, awaiting approval
Research snapshot: 2026-08-26

## Decision

Build a local, cross-platform **pre-share privacy verifier**.

> Drop or paste something. Review what it leaks. Export a cleaned copy and verify what was removed.

This is not a generic screenshot editor, PDF toolbox, metadata remover, or AI wrapper. It owns one complete workflow:

1. Inspect visible and hidden data.
2. Explain each finding without exposing it again.
3. Let the user approve every removal.
4. Sanitize into a new, flattened artifact.
5. Decode and scan the exported bytes again.
6. Report what was verified and what cannot be verified.

The working name is **Aura Preflight**, but the public product must be renamed. “Aura” is already heavily used by a large digital-security company, an Arch Linux package manager, and multiple active developer products.

## Why this direction

- The problem and before/after result fit a ten-second demo.
- First value needs no account, server, API key, or setup wizard.
- Local processing is a structural open-source advantage.
- One engine can power a desktop app, CLI, library, share-sheet integration, and CI.
- Detector rules, adapters, translations, and adversarial fixtures create real contribution and fork surfaces.
- A narrow image-first release is useful while leaving a path to documents, logs, URLs, archives, and recordings.

The novelty is not OCR or redaction. The opening is a polished, trustworthy **inspect -> review -> sanitize -> verify** contract across visible and invisible leakage.

## Competitive reality

“Private screenshot redaction” by itself is already occupied.

| Product/project | Existing strength | Opening |
| --- | --- | --- |
| [privacy-mask](https://github.com/fullstackcrew-alpha/privacy-mask) | Local OCR and screenshot masking | Primarily a CLI, not a broad reviewed outbound flow |
| [MetaScrub](https://github.com/Skytuhua/metascrub) | Local image metadata inspection/removal | No visible-content redaction |
| [mat2](https://github.com/jvoisin/mat2) | Many metadata formats | CLI-oriented; cannot prove complex files contain no other metadata |
| [Scrub](https://scrub.software/) | On-device image/PDF redaction on iPhone | Apple-focused and not an open cross-platform engine |
| [Before You Share](https://beforeyoushare.net/) | Image privacy checks in Apple share flows | Images/Apple only; no reusable CLI/library |
| [FileSentinel](https://vandien.io/filesentinel.html) | Local scanning on Windows/macOS | Closed surface, not an open contributor ecosystem |
| [Dangerzone](https://dangerzone.rocks/) | Malicious-document flattening | Malware isolation, not PII/secret review |
| [Gitleaks](https://github.com/gitleaks/gitleaks) | Mature secret detection | No end-user visual sharing flow |
| [Presidio](https://github.com/microsoft/presidio) | Mature PII SDKs | Detection primitives rather than the consumer workflow |

Conclusion: auto-redaction alone is not defensible. Post-sanitization verification, honest guarantees, cross-format architecture, and a very fast share workflow can be.

## Ranked alternatives

The 100-point gate weights repeated pain, demo clarity, open-source advantage, whitespace, first-value speed, MVP feasibility, contribution surface, and reachable communities.

| Direction | Score | Decision |
| --- | ---: | --- |
| Verified pre-share privacy workflow | 88 | Validate and build first |
| Semantic cross-device context capsule | 82 | Keep as a future candidate; permissions/onboarding make the MVP risky |
| Privacy-safe reproducible bug bundle | 79 | Useful, but Browser Recorder and OpenJam now cover much of the browser flow |
| Personal-data export repair/migration | 78 | Strong ecosystem, but use is episodic and vendor schemas churn |
| Action-first life-admin inbox | 76 | High value, but difficult extraction accuracy and weaker GitHub distribution |
| Forgotten-account/subscription sweep | Rejected | Paperweight and Aura Digital Security offer similar discovery flows |
| Generic agent recorder, notes, PDF, transfer, or local chat app | Rejected | Mature or rapidly crowding categories |

## Version 0.1 contract

### Target user

A developer, support worker, founder, teacher, recruiter, journalist, or privacy-conscious user who shares screenshots or copied text in chats, issues, documents, or AI tools.

### Golden flow

1. Paste a screenshot/text or drop PNG, JPEG, or WebP.
2. See local findings grouped as visible text, secret, barcode/QR, and hidden metadata.
3. Include/exclude findings and add manual solid-redaction boxes.
4. Select **Create verified copy**.
5. Copy/save the new artifact and review a concise verification receipt.

Target: median under 45 seconds, excluding the user's review time.

### Included

- Image and plain-text clipboard input.
- OCR bounding boxes for languages proven by the fixture corpus.
- Deterministic email, phone, common credential/token, sensitive URL parameter, and user-supplied-term detectors.
- QR/common barcode detection.
- EXIF, GPS, IPTC, and XMP inspection.
- Manual solid redaction.
- Newly encoded, flattened image output with metadata removed.
- Fresh output scan for OCR, configured patterns, barcodes, and supported metadata.
- Privacy-safe JSON receipt with hashes, detector versions, categories, counts, and checks—never raw sensitive values.
- No network requests in the core flow.

Face detection is a measured spike, not a launch promise.

### Deferred

- PDF/Office redaction until destructive, format-specific tests exist.
- Video/audio, background clipboard surveillance, automatic sending/uploading, cloud AI, and required local LLMs.
- Compliance certification or a universal “safe” claim.
- Blur/pixelation as security controls; version 0.1 uses destructive solid replacement.

## Trust rules

The interface must say what was checked, not “nothing sensitive remains.”

- Originals are immutable.
- Output images are decoded, redacted at pixel level, and newly encoded; original compressed chunks are not copied.
- Selected values never appear raw in logs, diagnostics, filenames, or receipts.
- Verification runs on exported bytes, not the pre-export canvas.
- A verification error never produces a green state.
- Findings show category, location, masked preview, confidence, and detector source.
- Unsupported formats fail closed with a useful explanation.

## Proposed architecture

```text
apps/desktop          Tauri 2 + TypeScript/React review UI
crates/preflight-core ingest, detect, sanitize, verify
crates/preflight-cli  scan, clean, verify
packages/rules        versioned data-only detector packs
fixtures/public       synthetic/licensed adversarial samples
```

- Rust core, reusable from desktop and CLI.
- Apache-2.0 for broad reuse and an explicit patent grant.
- Strict pipeline: ingest -> detect -> review -> sanitize -> decode output -> verify.
- No backend in the first release.

OCR/barcode dependencies require a benchmark covering recall, bounding-box quality, binary/model size, cold start, language coverage, license, and packaging.

## Validation gate

Build only a thin golden-flow prototype first. Continue when:

- 20 target users discuss their most recent incident/workaround, not whether they like the pitch.
- At least 8 had the problem in the prior 90 days and 5 will test their own non-critical artifact.
- Current builds of at least five direct competitors are tested hands-on.
- At least 60% complete the flow unaided; median time is below 45 seconds.
- At least 30% of relevant testers repeat within seven days.
- Supported metadata removal passes 100% of the public fixtures.
- Every selected deterministic token is absent from output bytes, decoded metadata, OCR, and barcode results in supported fixtures.
- OCR recall/false-positive results are published per fixture class.

Kill or re-scope if fewer than five users trust it with their own artifact, review is slower than manual redaction, or the verification boundary cannot be explained in one sentence.

## Delivery sequence

1. **Phase 0:** synthetic leak fixtures, disposable golden-flow prototype, OCR/barcode benchmark, competitor testing, and interviews.
2. **Private alpha:** Rust pipeline, desktop review surface, threat model, fixture corpus, 30–50 testers.
3. **Public beta:** reproducible cross-platform builds, CLI/library docs, sample mode, README demo, contribution schema, translations, and real starter issues.
4. **Launch:** seed real users, then stagger Hacker News, relevant communities, Product Hunt, newsletters, and creator outreach; ship weekly visual releases for the first month.

## Success measures

Track completed verified copies, first-value time, seven-day repeat use, release downloads, active installs, external contributors, accepted rules/fixtures/translations, and issue response time. Stars and forks are secondary distribution signals.

A literal 1,000-fork target normally implies far more than 1,000 stars. The reusable core, CLI, rule packs, and fixtures are necessary if forks are a real objective.

## Approval needed

Approve or reject this product direction before production scaffolding. On approval, the next deliverable is the Phase 0 prototype and dependency benchmark—not a broad feature build.
