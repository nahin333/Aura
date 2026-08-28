# Contributing to Aura Preflight

Thank you for helping build a trustworthy pre-share privacy workflow.

The most valuable contributions improve a supported guarantee, add a synthetic adversarial fixture, or make the review flow clearer. Please do not submit cosmetic detector-count inflation.

## Before you start

1. Read the [threat model](docs/threat-model.md).
2. Check the [roadmap](docs/roadmap.md) and open issues.
3. For a substantial new format, engine, or architecture change, open a proposal issue before implementation.
4. Never attach real secrets, private screenshots, or identifying metadata. Reproduce with synthetic values on reserved/example domains.

## Local setup

~~~bash
npm ci
npm test
npm run build
~~~

For browser smoke testing:

~~~bash
npm run build
npm run preview
# In another terminal:
AURA_BASE_URL=http://127.0.0.1:4173 npm run test:e2e
~~~

Override <code>FIREFOX_PATH</code>, <code>GECKODRIVER_PATH</code>, or <code>AURA_BASE_URL</code> when the defaults do not match your system.

## Good contribution surfaces

### Deterministic detector

- Keep the implementation dependency-free and browser-compatible under <code>packages/core</code>.
- Include positive, negative, boundary, overlap, Unicode, and false-positive fixtures.
- Return offsets and a masked preview; never retain the raw match in a finding.
- Use a stable detector identifier.
- Document precision limits.

### Image or OCR fixture

- Use only synthetic or clearly licensed artifacts.
- Record dimensions, expected categories, expected boxes, and expected post-export checks.
- Include a negative control.
- Do not embed a live credential, routable personal email, or real location.

### New format

A format is not accepted until redaction is destructive and testable. Visual overlays are not redaction. The pull request must show how exported bytes are decoded and checked again.

### Interface or accessibility

- Keep every canvas finding synchronized with an accessible list.
- Maintain visible keyboard focus and 44×44px touch targets where practical.
- Do not use color as the only state signal.
- Never replace exact check language with “safe,” “clean,” or “100% private.”

## Pull-request checklist

- [ ] Tests cover the behavior and a meaningful failure case.
- [ ] <code>npm test</code> passes.
- [ ] <code>npm run build</code> passes.
- [ ] No raw detected value enters logs, filenames, diagnostics, or receipts.
- [ ] Failures remain fail-closed; they cannot produce the passed UI.
- [ ] Documentation states what is and is not verified.
- [ ] Dependencies are pinned, licensed compatibly, and audited.

By contributing, you agree that your contribution is licensed under Apache-2.0.
