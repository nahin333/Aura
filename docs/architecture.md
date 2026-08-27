# Architecture

## Pipeline

~~~text
input bytes
   │
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
~~~

## Modules

| Path | Responsibility |
| --- | --- |
| <code>packages/core/src</code> | Dependency-free text detectors, overlap handling, text redaction, verification, aggregate receipts |
| <code>src/lib/ocr.ts</code> | Same-origin Tesseract worker lifecycle, line normalization, rule execution, source-box mapping |
| <code>src/lib/image.ts</code> | Input validation, decoding, metadata/QR inspection, fresh PNG rasterization, pixel verification |
| <code>src/lib/sample.ts</code> | Synthetic, explicitly preloaded golden-flow artifact |
| <code>src/App.tsx</code> | Workflow state, user selection, failure handling, output and receipt actions |
| <code>scripts/e2e-smoke.mjs</code> | Browser proof of demo, text, and real local OCR/output verification paths |

## Dependency boundaries

The deterministic core does not import React, browser rendering libraries, OCR,
QR, or metadata packages. This keeps a future CLI/library extraction possible.

Large scanners are dynamically imported. OCR worker/core/model files are copied into the production output and loaded from the same origin. The initial interface bundle does not include scanner code.

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

## Intended evolution

~~~text
packages/rules       versioned data-only rule packs
crates/preflight     native sanitization/verification core
apps/desktop         signed cross-platform review surface
apps/cli             scan, sanitize, verify, receipt
fixtures/public      synthetic and licensed adversarial corpus
~~~

The browser prototype validates the interaction contract. Native/CLI extraction should happen only after fixture and dependency benchmarks define measurable guarantees.
