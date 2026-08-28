# Security policy

Aura Preflight handles potentially sensitive local artifacts. Please report security defects privately.

## Report a vulnerability

Use GitHub's private security advisory flow for this repository:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include the affected commit, impact, reproduction steps, and a synthetic proof of concept.

Do not open a public issue before a fix is available. Do not attach real secrets, personal screenshots, private documents, or identifying metadata.

## In scope

- raw values entering logs, receipts, filenames, analytics, or unintended network requests;
- redactions that are cosmetic or recoverable from exported bytes;
- original compressed data or metadata copied into output;
- verification running on pre-export state instead of exported bytes;
- parser failures incorrectly producing a passed state;
- content-security-policy bypasses in the supported local build;
- dependency or fixture supply-chain issues.

## Prototype support

The current supported line is the latest commit on <code>main</code>. Version
0.2 is a prototype and has not received an independent security audit. Do not
use it as the sole control for high-risk or regulated disclosures. Diagnostic
receipts are unsigned, and matching one to an artifact is not proof of
authenticity or safety.
