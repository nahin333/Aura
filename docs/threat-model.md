# Threat model

## Security objective

Aura Preflight helps a user inspect text or a supported image, choose
destructive visible-content removals, strip supported hidden metadata from
image exports, create a new artifact, and see which checks succeeded against it.

It does not prove that an artifact contains no sensitive information.

## Assets

- original image or text;
- raw detected values;
- image pixels and hidden metadata;
- selected redaction geometry;
- sanitized output bytes;
- verification receipt.

## Trust boundary

The Phase-0 application runs in the browser. Runtime OCR worker, WASM, English
model, deterministic rules, QR decoder, and metadata parser are bundled or
served from the same local origin.

The application content-security policy permits same-origin assets and the
blob/data URLs required for local files, workers, and downloads. Development
also permits localhost WebSockets for hot reload; the production build removes
that allowance. Neither policy permits arbitrary internet origins.

Installing dependencies is a separate supply-chain operation. After a production build is present, the inspect/review/sanitize/verify flow does not require an account, backend, API key, cloud model, or CDN.

## Promised invariants

- The original object is never mutated.
- A selected text span is replaced with a fixed marker in a new string.
- A selected visual region is filled with solid pixels in a fresh canvas.
- Image output is encoded as a new PNG.
- Original compressed chunks are not copied into output.
- Verification reads the newly exported text or image bytes.
- Pixel verification checks every pixel inside each selected visual rectangle.
- Receipt schemas contain aggregate categories, counts, statuses, and an output
  SHA-256 fingerprint—not an input fingerprint or raw finding.
- A required check error cannot produce the passed state.
- A new or unreviewed supported finding in exported output cannot produce the
  passed state. Only an exact, explicitly retained source finding may remain.

## Supported checks

- deterministic text detectors documented in the README;
- English OCR followed by the same deterministic rules;
- one QR-code result per current scan;
- EXIF, GPS, IPTC, XMP, PNG text, ICC, and Photoshop groups;
- an allowlist of structural and non-text color/layout PNG chunks;
- output decoding;
- solid replacement pixels inside selected rectangles.

## Known non-goals and limitations

- Perfect PII, secret, face, name, or context detection.
- Protection against a compromised browser, operating system, dependency, or extension.
- Forensic deletion of the user's original file, clipboard history, backups, thumbnails, or filesystem caches.
- PDF/Office redaction.
- Removal of every proprietary or steganographic metadata channel.
- Compliance certification.
- A claim that an intentionally deselected or undetected value is absent.
- Cryptographic authenticity: diagnostic receipts are unsigned, editable
  self-reports and are not attestations.
- Unlinkability of the output fingerprint when the exported artifact is known.

## Failure behavior

- Unsupported file types stop before review.
- Decode errors create no completed output.
- Metadata, QR, OCR, or output-check errors are displayed as failed checks.
- Checksum/format errors from QR-like content fail instead of being treated
  as “nothing found.”
- Copy/save actions stay disabled when verification fails.
- The interface always retains a warning that supported checks can miss content.

## Future hardening gates

- adversarial image and metadata corpus;
- multilingual OCR benchmarks with published recall and false-positive rates;
- CSP as deployment headers in addition to the HTML fallback;
- reproducible native builds and signed releases;
- dependency provenance and software bill of materials;
- independent security review before a stable release.
