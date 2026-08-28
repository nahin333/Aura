# Changelog

## 0.2.0 — 2026-08-28

### Added

- Session-only **Always hide** literal phrases for names, handles, IDs, and
  project terms, with the same detector snapshot used before and after export.
- Optional stable typed aliases for text, with collision-safe opaque fallback.
- Local artifact-to-receipt matching for Aura text and image receipt v1 files.
- Installable offline PWA support with deterministic icons and a validated,
  content-hashed static cache.
- Native share-out for passed text and PNG outputs on supported platforms.
- Checked image export when supported scans find no visual redactions to make.

### Hardened

- Protected values and their hashes remain outside receipts.
- Receipt JSON parsing rejects unsafe object keys, inconsistent aggregates,
  unsupported schemas, oversized files, invalid UTF-8, and malformed PNGs.
- Text inspection fails closed above 1,000 supported matches, and overlap
  grouping no longer performs quadratic scans or spread-based reductions.
- Static-cache digests accept only the build-known compressed or transparently
  decoded representation of packaged gzip assets.
- Zero-finding receipts no longer claim selected pixels were verified.
- Receipt mode is isolated from global preflight paste handling.
- Production browser coverage now exercises protected aliases, receipt
  matching, zero-finding images, real OCR, CSP, and same-origin runtime assets.

Aura remains a prototype. A passed check or matching unsigned receipt is not a
guarantee that an artifact is safe.
