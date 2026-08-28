# Architecture

## Pipeline

~~~text
input bytes
   │
   ├── session-only protected literals
   ├── deterministic rules (plain text)
   ├── OCR → normalized text → deterministic rules
   ├── QR decoder
   └── metadata parser
          │
          ▼
privacy-minimized findings + optional pixel boxes
          │
          ▼
visible-finding selection + mandatory supported-metadata stripping + manual boxes
          │
          ├── text → new string → deterministic-rule rescan
          │
          └── image → fresh canvas → newly encoded PNG
                                      │
                                      ▼
                         decode + metadata/chunk/OCR/QR
                         scans + solid-region verification
          │
          ▼
checked artifact + aggregate-only receipt
          │
          └── optional local artifact ↔ receipt byte matching
~~~

## Modules

| Path | Responsibility |
| --- | --- |
| <code>packages/core/src</code> | Dependency-free text detectors, overlap handling, text redaction, verification, aggregate receipts |
| <code>packages/core/src/literal.ts</code> | Bounded, escaped, session-only protected-literal detector |
| <code>src/lib/ocr.ts</code> | Same-origin Tesseract worker lifecycle, line normalization, rule execution, source-box mapping |
| <code>src/lib/image.ts</code> | Input validation, decoding, metadata/QR inspection, fresh PNG rasterization, pixel verification |
| <code>src/lib/receipt-match.ts</code> | Strict receipt parsing and content-free text/PNG byte comparison results |
| <code>src/lib/replacements.ts</code> | Collision-safe opaque and typed text output markers |
| <code>src/lib/pwa.ts</code> | Production worker registration and browser install-prompt lifecycle |
| <code>src/lib/sample.ts</code> | Synthetic, explicitly preloaded golden-flow artifact |
| <code>src/App.tsx</code> | Workflow state, user selection, failure handling, output and receipt actions |
| <code>scripts/build-pwa.mjs</code> | Production asset validation and exhaustive content-hashed service-worker generation |
| <code>scripts/e2e-smoke.mjs</code> | Browser proof of demo, text, and real local OCR/output verification paths |

## Dependency boundaries

The deterministic core does not import React, browser rendering libraries, OCR,
QR, or metadata packages. This keeps a future CLI/library extraction possible.

Large scanners are dynamically imported. OCR worker/core/model files are copied into the production output and loaded from the same origin. The initial interface bundle does not include scanner code.

The detector array used for a check is frozen in memory and reused for output
verification. Protected phrases are held only in the React session and detector
closure; reset and sample mode replace that snapshot with built-in detectors.
Readable aliases are assigned from in-memory finding hashes, but neither the
hash-to-alias map nor a protected phrase enters a receipt.

The generated service worker precaches only the exact production build files.
It ignores non-GET and cross-origin requests, never adds arbitrary runtime
requests, and never receives uploaded or generated artifacts from application
code. Every response is checked against a build-time SHA-256 digest; for gzip
assets, both the stored gzip bytes and their build-derived decoded bytes are
known so hosts with either standard header behavior remain verifiable.
Navigation is network-first with the cached app shell as an offline fallback.

Text detection is capped at 1,000 findings before per-finding hashing or UI
rendering. Protected-literal detection enforces the same cap while matching,
and overlap groups track their extent and representative incrementally.

## Receipt boundary

Receipts are intentionally less expressive than in-memory findings. They may contain:

- schema/version;
- timestamps;
- byte or character counts;
- an output SHA-256 fingerprint (never an input-content fingerprint);
- detector/category counts;
- check identifiers and statuses;
- engine versions for image receipts;
- documented limitations.

They must not contain matched text, OCR text, QR payloads, input hashes,
coordinates derived from metadata, or masked previews. Receipts are unsigned
diagnostics, not attestations.

The receipt matcher accepts only Aura text/image v1 schemas and returns
fingerprint/metric outcomes without filenames, text content, image bytes, or
receipt contents. Matching an unsigned receipt is correlation, not provenance.

## Intended evolution

~~~text
packages/rules       versioned data-only rule packs
crates/preflight     native sanitization/verification core
apps/desktop         signed cross-platform review surface
apps/cli             scan, sanitize, verify, receipt
fixtures/public      synthetic and licensed adversarial corpus
~~~

The browser prototype validates the interaction contract. Native/CLI extraction should happen only after fixture and dependency benchmarks define measurable guarantees.
