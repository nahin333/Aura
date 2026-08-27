# Roadmap

This roadmap is ordered by trust and repeatable user value, not feature count.

## Phase 0 — working vertical slice

- [x] Synthetic four-finding golden-flow demo
- [x] Real local text and image inputs
- [x] Dependency-free deterministic detector core
- [x] English OCR with same-origin worker, WASM, and model
- [x] QR plus EXIF/GPS/IPTC/XMP/PNG-text/ICC/Photoshop inspection
- [x] Manual solid redaction
- [x] New PNG encoding and exported-byte verification
- [x] Raw-value-excluding text and image diagnostic receipts
- [x] Unit, build, and Firefox smoke validation
- [x] Honest limitations and threat model

## Alpha gate

- [ ] Public synthetic/adversarial image and metadata fixture corpus
- [ ] OCR benchmark with recall, false positives, box quality, cold start, and binary size
- [ ] Five hands-on competitor tests documented with current builds
- [ ] Twenty recent-problem interviews and five non-critical user artifacts
- [ ] Manual box resize plus accessible numeric geometry controls
- [ ] Multiple QR results and safe 1-D barcode geometry
- [ ] Receipt schema review and deterministic serialization
- [ ] Runtime network-denial test
- [ ] Dependency notices and software bill of materials

## Private alpha

- [ ] Rust sanitization/verification spike
- [ ] CLI scan/sanitize/verify commands
- [ ] Desktop shell benchmark and packaging decision
- [ ] Reproducible Windows, macOS, and Linux builds
- [ ] Multilingual fixture benchmark before adding packaged languages
- [ ] 30–50 testers; median first checked copy below 45 seconds

## Public beta

- [ ] Stable core/library API
- [ ] Versioned detector-pack schema
- [ ] Signed releases and checksums
- [ ] Localization
- [ ] Fifteen scoped starter issues backed by tests
- [ ] 30–45 second real product demo
- [ ] Independent threat-model review

## Deferred until destructive tests exist

- PDF and Office redaction
- video/audio
- blur or pixelation as security controls
- automatic sending/uploading
- background clipboard surveillance
- required cloud AI or local LLM
