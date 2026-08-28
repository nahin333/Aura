# Aura product discovery

Status: direction approved; 0.2 browser product implemented and validated
Research snapshot: 2026-08-28

## Decision

Build a local, cross-platform **pre-share privacy verifier**.

> Drop or paste something. Review what it leaks. Export a cleaned copy and verify what was removed.

This is not a generic screenshot editor, PDF toolbox, metadata remover, or AI wrapper. It owns one complete workflow:

1. Inspect visible and hidden data.
2. Explain each finding without exposing it again.
3. Let the user choose visible-content removals; supported hidden metadata is
   always stripped from image exports.
4. Sanitize into a new, flattened artifact.
5. Decode and scan the exported bytes again.
6. Report what was verified and what cannot be verified.

The working name is **Aura Preflight**. It should be revisited before a stable
release because “Aura” is already heavily used by a large digital-security
company, an Arch Linux package manager, and multiple active developer products.

## Why this direction

- The problem and before/after result fit a ten-second demo.
- First value needs no account, server, API key, or setup wizard.
- Local processing is a structural open-source advantage.
- One engine can power a desktop app, CLI, library, share-sheet integration, and CI.
- Detector rules, adapters, translations, and adversarial fixtures create real contribution and fork surfaces.
- A narrow image-first release is useful while leaving a path to documents, logs, URLs, archives, and recordings.

The novelty hypothesis is not OCR or redaction. The proposed opening is a
polished, transparent **inspect -> review -> sanitize -> verify** contract
across visible and invisible leakage. Hands-on competitor testing and user
interviews are still required to validate that opening.

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

Working hypothesis: auto-redaction alone is not defensible. Post-sanitization
verification, exact check language, cross-format architecture, and a very fast
share workflow may provide a defensible product if the validation gate below is met.

### 0.2 competitive check

The follow-up review treated client-side OCR, EXIF stripping, generic
redaction, PWA installation, PDF support, face detection, and a CLI as crowded
capabilities rather than a unique pitch. Several current tools already combine
some of them. Aura 0.2 therefore concentrates on a narrower product loop:

~~~text
personal privacy lens
  → explicit review
  → destructive checked copy
  → exported-byte verification
  → later artifact/receipt matching
~~~

The session-only privacy lens and readable aliases improve repeated daily use.
Receipt matching extends verification beyond the original browser session.
Offline installation and native share-out reduce friction, but are distribution
features—not the differentiation by themselves. PDF, face models, batch mode,
and inbound share targeting remain deferred until their verification and
transient-data boundaries are credible.

## Ranked alternatives

This preliminary 100-point screen weights repeated pain, demo clarity,
open-source advantage, whitespace, first-value speed, MVP feasibility,
contribution surface, and reachable communities. Scores are prioritization
hypotheses, not market validation; interviews and hands-on tests remain open.

| Direction | Score | Decision |
| --- | ---: | --- |
| Verified pre-share privacy workflow | 88 | Validate and build first |
| Semantic cross-device context capsule | 82 | Keep as a future candidate; permissions/onboarding make the MVP risky |
| Privacy-safe reproducible bug bundle | 79 | Useful, but Browser Recorder and OpenJam now cover much of the browser flow |
| Personal-data export repair/migration | 78 | Strong ecosystem, but use is episodic and vendor schemas churn |
| Action-first life-admin inbox | 76 | High value, but difficult extraction accuracy and weaker GitHub distribution |
| Forgotten-account/subscription sweep | Rejected | Paperweight and Aura Digital Security offer similar discovery flows |
| Generic agent recorder, notes, PDF, transfer, or local chat app | Rejected | Mature or rapidly crowding categories |

## Target alpha contract

### Target user

A developer, support worker, founder, teacher, recruiter, journalist, or privacy-conscious user who shares screenshots or copied text in chats, issues, documents, or AI tools.

### Golden flow

1. Paste a screenshot/text or drop PNG, JPEG, or WebP.
2. See local findings grouped as visible text, secret, QR, and hidden metadata.
3. Include/exclude visible findings, add manual solid-redaction boxes, and see
   that supported hidden metadata removal is mandatory.
4. Select **Create checked copy**.
5. Copy/save the new artifact and review a concise diagnostic receipt.

Target: median under 45 seconds, excluding the user's review time.

### Included

- Image and plain-text clipboard input.
- English OCR bounding boxes.
- Deterministic email, phone, IP, common credential/token, sensitive URL
  parameter, and Luhn-valid payment-card detectors.
- QR-code detection.
- EXIF, GPS, IPTC, XMP, PNG text, ICC, and Photoshop inspection.
- Manual solid redaction.
- Newly encoded, flattened PNG output with supported metadata groups absent.
- Fresh output scan for OCR, configured patterns, QR, and supported metadata.
- Raw-value-excluding, unsigned diagnostic JSON receipt with an output SHA-256
  fingerprint, engine versions, aggregate categories/counts, and checks.
- No external requests or artifact uploads in the application flow; packaged
  runtime assets load from the same origin.

Face detection is a measured spike, not a launch promise.

### Deferred

- PDF/Office redaction until destructive, format-specific tests exist.
- Video/audio, background clipboard surveillance, automatic sending/uploading, cloud AI, and required local LLMs.
- Compliance certification or a universal “safe” claim.
- Blur/pixelation as security controls; the target alpha uses destructive solid replacement.

## Trust rules

The interface must say what was checked, not “nothing sensitive remains.”

- Originals are immutable.
- Output images are decoded, redacted at pixel level, and newly encoded; original compressed chunks are not copied.
- Selected values never appear raw in logs, diagnostics, filenames, or receipts.
- Verification runs on exported bytes, not the pre-export canvas.
- A verification error never produces a green state.
- Findings show category, location where available, masked preview, detector
  source, and confidence where meaningful.
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

OCR/QR dependencies require a benchmark covering recall, bounding-box quality,
binary/model size, cold start, language coverage, license, and packaging.

## Validation gate

Build only a thin golden-flow prototype first. Continue when:

- 20 target users discuss their most recent incident/workaround, not whether they like the pitch.
- At least 8 had the problem in the prior 90 days and 5 will test their own non-critical artifact.
- Current builds of at least five direct competitors are tested hands-on.
- At least 60% complete the flow unaided; median time is below 45 seconds.
- At least 30% of relevant testers repeat within seven days.
- Supported metadata removal passes 100% of the public fixtures.
- Every selected deterministic token is absent from output bytes, decoded
  metadata, OCR, and QR results in supported fixtures.
- OCR recall/false-positive results are published per fixture class.

Kill or re-scope if fewer than five users trust it with their own artifact, review is slower than manual redaction, or the verification boundary cannot be explained in one sentence.

## Delivery sequence

1. **Phase 0:** synthetic golden-flow browser prototype, local scanners, threat
   model, post-export checks, and automated smoke paths.
2. **0.2 utility release:** personal protected terms, typed aliases, receipt
   matching, offline installation, explicit share-out, and truthful
   zero-finding image export.
3. **Alpha validation:** public adversarial corpus, OCR/QR benchmark, five
   hands-on competitor tests, and twenty recent-problem interviews.
4. **Private alpha:** core/CLI extraction decision, desktop review surface,
   reproducible packaging, and 30–50 testers.
5. **Public beta:** CLI/library docs, sample mode, contribution schema,
   translations, and real starter issues.
6. **Launch:** seed real users, then stagger Hacker News, relevant communities,
   Product Hunt, newsletters, and creator outreach; ship weekly visual releases
   for the first month.

## Success measures

Track completed verified copies, first-value time, seven-day repeat use, release downloads, active installs, external contributors, accepted rules/fixtures/translations, and issue response time. Stars and forks are secondary distribution signals.

A literal 1,000-fork target normally implies far more than 1,000 stars. The reusable core, CLI, rule packs, and fixtures are necessary if forks are a real objective.

## Implementation status

The direction was approved and the working 0.2 browser product now lives in
this repository. In addition to the Phase-0 vertical slice, it includes
session-only literal phrases, collision-safe typed aliases, artifact-to-receipt
matching, an installable static-only offline build, supported native share-out,
and a checked zero-finding image path. Unit and production Firefox coverage
exercise the complete flow with synthetic fixtures.

The prototype is deliberately narrower than the target alpha contract.
PDF/Office support, a native desktop wrapper, multilingual OCR, adversarial
fixture coverage, and stable release packaging remain gated work.
