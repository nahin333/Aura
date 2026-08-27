<div align="center">
  <h1>Aura Preflight</h1>
  <p><strong>Check before you share.</strong></p>
  <p>
    A local-first pre-share privacy verifier for screenshots, images, and text.
    Inspect possible leaks, choose visible-content removals, export a newly
    encoded copy with supported hidden metadata stripped, then run supported
    checks against the exported bytes.
  </p>
</div>

> [!IMPORTANT]
> Aura Preflight is a Phase-0 prototype, not a guarantee that an artifact is safe. Detection can miss sensitive content. Review every output before sharing it.

![Aura Preflight synthetic review screen with preloaded findings](docs/assets/review.png)

_Synthetic walkthrough: the findings are preloaded and labeled; this is not a live OCR/QR result._

## Why this exists

Sharing a screenshot or log can expose more than the thing you meant to show:

- visible emails, phone numbers, tokens, payment-card-like numbers, or sensitive URL parameters;
- QR payloads;
- hidden EXIF, GPS, IPTC, XMP, PNG text, ICC, or Photoshop fields;
- content missed by automatic detection.

Existing tools often stop after detection or visual masking. Aura owns a stricter workflow:

~~~text
inspect → review → sanitize → decode exported bytes → verify → receipt
~~~

The original stays untouched. Image removals are solid pixel replacement, never blur or pixelation. Output images are rendered into a fresh PNG rather than copying original compressed chunks.

## Try it

Requirements: Node.js 18 or newer.

~~~bash
git clone https://github.com/nahin333/Aura.git
cd Aura
npm ci
npm run dev
~~~

Open the local URL and choose **Try the sample**. The sample is synthetic and
its findings are explicitly labeled as preloaded. Its OCR and QR
post-export checks are shown as not run.

No account, API key, backend, or cloud model is required. OCR worker, WASM core, and English model files are served from the same local build—not a CDN.

## What works today

- Paste or drop PNG, JPEG, and WebP images up to 25 MB.
- Paste text, logs, links, or messages.
- Local English OCR with finding boxes.
- Deterministic rules for:
  - email addresses;
  - phone numbers;
  - IPv4 addresses;
  - sensitive URL query values;
  - JWT, AWS, GitHub, OpenAI, and common credential/token patterns;
  - payment-card-like numbers validated with Luhn.
- QR-code inspection with a browser-based ZXing decoder.
- EXIF, GPS, IPTC, XMP, PNG text, ICC, and Photoshop group inspection.
- User-selected visible findings, manual redaction boxes, and mandatory removal
  of supported hidden metadata on image export.
- Newly encoded PNG output with solid replacement pixels.
- Post-export decode, pixel, OCR/rule, QR, metadata, and PNG-chunk checks.
- Unsigned diagnostic JSON receipts containing an output SHA-256 fingerprint,
  aggregate categories/counts and check statuses, plus image-engine versions—
  never an input fingerprint or raw detected value.
- A tested synthetic demo and real browser smoke paths.

![Aura Preflight synthetic demo result screen](docs/assets/verified.png)

_Synthetic walkthrough result: structural checks run, while OCR and QR are explicitly marked not run._

## Honest limits

- OCR and rules can miss content or produce false positives.
- English is the only packaged OCR language.
- The current QR path reports one code per scan; 1-D barcodes are not supported.
- Metadata verification covers the groups listed above plus a strict output-PNG
  chunk allowlist, not every possible proprietary or steganographic channel.
- “Export checks passed” means every listed required check ran, no approved
  finding was detected again, and no new/unreviewed supported finding appeared.
  An explicitly retained reviewed finding may remain and is disclosed.
- Diagnostic receipts are unsigned and editable; their output fingerprint can
  correlate a receipt with a known exported artifact. They are not attestations.
- PDF, Office, video, audio, faces, native share sheets, and desktop packaging are not implemented.
- Real uploads never receive the demo's preloaded findings.

See the [threat model](docs/threat-model.md) for the exact trust boundary.

## Development

~~~bash
npm ci
npm test
npm run build
~~~

The unit suite covers detector behavior, overlap resolution, destructive text replacement, receipt privacy, verification, and OCR punctuation repair.

For the full Firefox smoke suite, start the dev server in one terminal:

~~~bash
npm run dev
~~~

Then run:

~~~bash
npm run test:e2e
~~~

The smoke suite covers:

1. the four-finding synthetic image flow;
2. pasted-text detection, full removal, and explicit-retention behavior;
3. manual image redaction and diagnostic-receipt privacy;
4. a real uploaded PNG with a positive OCR finding plus negative QR and
   metadata scans, rasterization, and post-export verification.

The script defaults to Ubuntu Snap paths. Override <code>FIREFOX_PATH</code>, <code>GECKODRIVER_PATH</code>, or <code>AURA_BASE_URL</code> when needed.

## Optional GitHub Pages deployment

The production build uses relative asset paths, including the packaged OCR
worker, WASM, and language model. After enabling **GitHub Actions** as the Pages
source in repository settings, run the **Deploy GitHub Pages** workflow from
the Actions tab. It is manual by design so a new fork does not publish
unexpectedly.

## Architecture

~~~text
src/                     React review/sanitize/verify application
src/lib/image.ts         decode, metadata/QR scan, rasterize, pixel verify
src/lib/ocr.ts           local Tesseract worker and finding-box mapping
packages/core/           dependency-free deterministic privacy engine
scripts/e2e-smoke.mjs    complete browser smoke paths
docs/                    discovery, threat model, architecture, roadmap
~~~

The deterministic core is browser-compatible and independent of React. The intended next extraction is a stable package API, followed by a CLI and native desktop shell. Read the [architecture notes](docs/architecture.md).

## Contributing

The project is designed to create meaningful contribution surfaces rather than empty forks:

- detectors with synthetic positive/negative fixtures;
- OCR normalization and language benchmarks;
- QR and metadata adversarial fixtures;
- accessible review interactions;
- translations;
- browser/platform packaging;
- threat-model and verification tests.

Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [roadmap](docs/roadmap.md). Never attach a real secret or private artifact to an issue—use synthetic replacements.

## Product direction

The initial product discovery and competitive desk review are recorded in
[docs/product-discovery.md](docs/product-discovery.md). The key distinction is
not “AI redaction”; it is a transparent **inspect → select → sanitize → verify**
contract.

The public name is still provisional because “Aura” is heavily used by existing products.

## License

Apache-2.0. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
Production builds include these files and direct runtime dependency licenses.
