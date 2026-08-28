# Aura Preflight launch playbook

Status: v0.2 is live and usable. The immediate goal is validated recurring use
and contributor evidence, not a one-day star spike.

## Positioning

**One sentence:** Aura Preflight checks privacy-sensitive text and images in the
browser, creates a destructively sanitized copy, then reruns supported checks on
the exported bytes.

**The memorable difference:** most tools advertise detection, masking, or
metadata removal. Aura exposes one reviewable contract:

~~~text
inspect → review → sanitize → decode exported bytes → verify → match receipt
~~~

Lead with the concrete task: “check before you share.” Follow with local
processing and exported-byte verification. OCR, a PWA, EXIF removal, and generic
redaction are supporting capabilities, not novelty claims.

Never claim that Aura makes an artifact safe, finds everything, signs receipts,
supports every metadata channel, or has completed a third-party security audit.

## Canonical links and assets

- App: <https://nahin333.github.io/Aura/>
- Repository: <https://github.com/nahin333/Aura>
- Release: <https://github.com/nahin333/Aura/releases/tag/v0.2.0>
- Threat model: <https://github.com/nahin333/Aura/blob/main/docs/threat-model.md>
- Alpha feedback: <https://github.com/nahin333/Aura/issues/new?template=user-test.yml>
- Review screenshot: `docs/assets/review.png` (1440×814)
- Verified-copy screenshot: `docs/assets/verified.png` (1440×814)

All screenshots use the labeled synthetic walkthrough. Do not publish a real
artifact, receipt, finding, or filename as launch material.

## Funnel and weekly scorecard

Measure the sequence, not just the endpoint:

~~~text
qualified visitor → sample or real task → checked copy → feedback → 7-day repeat
                                                    ↘ issue → contribution
~~~

Each Friday record GitHub visitors, unique clones, stars, forks, feedback issues,
recent-problem participants, unaided completions, median first-value bucket,
seven-day repeats, first-time issue authors, and external pull requests. GitHub
traffic is a rolling short-window view, so capture it consistently. Do not add
artifact telemetry to the app merely to improve the dashboard.

## Sequence

Before broad directory or Product Hunt submissions, decide whether Aura
Preflight remains the stable public name. Renaming after durable listings costs
search history and confuses release references. The working name is sufficient
for small validation sessions.

### 1. Recruit the first ten relevant users directly

Use the message in `docs/user-validation.md`. Contact people who have recently
shared bug reports, support screenshots, logs, classroom material, recruiting
material, or source material—not a generic audience. Ask for a five-minute test,
not a star. Fix only repeated blockers or trust-language failures.

### 2. Show HN after three unaided external completions

Suggested title:

> Show HN: Aura Preflight – verify text and image redactions locally

Submit the live app so readers can try it without signup. The maker must write
the opening comment personally: Hacker News asks users not to post generated or
AI-edited comments. In the maker's own words, cover:

- the last pre-share mistake or workaround that motivated the project;
- why checking the exported bytes is different from drawing an overlay;
- the local/no-account architecture and the exact supported formats;
- the honest limits: English OCR, one QR result, supported metadata groups,
  unsigned receipts, and no guarantee;
- one narrow feedback question: where the inspect/review/verify contract is
  unclear or too slow.

Do not ask anyone to upvote or comment, coordinate votes, repost a weak launch,
or use Hacker News primarily as a promotion channel.

### 3. Product Hunt after the account and gallery are ready

Product Hunt currently requires a personal account; a newly created account
must wait before posting. Self-hunt the product and use the live app as the main
link.

- **Name:** Aura Preflight
- **Tagline:** Check what your screenshots leak before sharing
- **Short description:** Paste text or drop an image. Aura detects supported PII,
  secrets, QR payloads, and hidden metadata locally; lets you redact visible
  content; strips supported metadata; then rescans the exported bytes and creates
  a diagnostic receipt. Free, open source, and no account or upload required.
- **First comment:** Explain the personal problem, the exported-byte verification
  contract, what is intentionally unsupported, and ask people to try the sample
  and name the check they expected but did not see.
- **Gallery order:** review screenshot, verified-copy screenshot, then a short
  pipeline diagram or demo video when one exists.

Ask people to visit and give honest feedback, never to upvote. Stay available to
answer technical and privacy questions during launch day.

### 4. Community posts only where the rules fit

Do not cross-post identical promotion to privacy or open-source communities.
For privacy communities, disclose that you are the maker, link the threat model,
state that no independent audit has occurred, describe the exact novelty claim,
and ask one technical question. Check the current community rules or ask a
moderator before posting; self-promotion rules change.

A suitable technical angle is: “How should a local redaction tool communicate
the difference between exported-byte checks and a guarantee?” The post should be
useful even if the reader never opens Aura.

Use this order, and write Reddit/Hacker News text personally:

| Channel | Appropriate use | Requirement or constraint |
| --- | --- | --- |
| Show HN | First broad technical launch | Existing genuine account history; live no-signup demo; no generated comments or vote requests |
| Privacy Guides Project Showcase | Qualified privacy and threat-model review | Disclose ownership, audit status, exact threat model, listing status, and verify developer affiliation |
| r/opensource | Open-source implementation and contributor discussion | Use the promotional flair, maintain genuine non-promotional participation, and do not paste generated posts |
| r/webdev | Client-only OCR/PWA/export verification engineering story | Showoff Saturday only, genuine participation, and a personally written post |
| r/coolgithubprojects | Direct repository discovery | Descriptive repository link; do not repost without a meaningful release |
| r/SideProject | Specific usability feedback | Ask about one workflow problem, not stars |
| r/privacy | **Do not post** | Current rules suspend app promotion requests, including open source |

Do not publish the same announcement to several communities. The technical
question, disclosure, and expected discussion must fit each audience.

### 5. Durable directories

Prepare an AlternativeTo submission under Security & Privacy with Web and
Self-Hosted platforms, Apache-2.0, the canonical description above, and
alternatives whose primary task overlaps. Submission requires a verified
personal email and human review, so the maintainer must complete it. Do not use
profile text or comments as advertising.

## Ready-to-post social copy

### Short post

> I built Aura Preflight for the awkward minute before sharing a screenshot or
> log. It finds supported PII, secrets, QR data, and metadata locally, lets you
> redact, then scans the exported bytes again. No upload or account. It can still
> miss things, so it shows exactly what ran. Try the synthetic sample and tell me
> where the workflow breaks: https://nahin333.github.io/Aura/

### Developer post

> The tricky part of screenshot redaction is not drawing a black box. It is
> proving what happened to the file you actually saved. Aura Preflight decodes
> the input locally, applies solid pixel replacement, creates a fresh PNG,
> decodes that output, reruns supported OCR/rule/QR/metadata checks, and records
> an unsigned diagnostic receipt. The 0.2 source and threat model are public:
> https://github.com/nahin333/Aura — I’m looking for failure cases described with
> synthetic data, not stars for their own sake.

## Stop conditions

Pause broad distribution when the live build is broken, required checks can
fail into a passed state, issue response time exceeds two working days, or the
same trust-boundary misunderstanding appears in three tests. Fix that failure,
rerun the test, and then resume the sequence.

## Platform rules checked

Checked on 2026-08-28. Re-check immediately before submitting because community
and platform policies can change.

- [Show HN guidelines](https://news.ycombinator.com/showhn.html)
- [Current Show HN newcomer restriction](https://news.ycombinator.com/showlim)
- [Hacker News guidelines](https://news.ycombinator.com/newsguidelines.html)
- [Product Hunt launch guide](https://www.producthunt.com/launch)
- [Product Hunt pre-launch guidance](https://www.producthunt.com/launch/before-launch)
- [Product Hunt account requirements](https://help.producthunt.com/en/articles/481909-how-can-i-get-access-to-post)
- [Privacy Guides Project Showcase rules](https://discuss.privacyguides.net/t/about-the-project-showcase-category/114)
- [Privacy Guides developer criteria](https://www.privacyguides.org/en/about/criteria/)
- [r/opensource rules](https://www.reddit.com/r/opensource/about/rules)
- [r/webdev rules](https://www.reddit.com/r/webdev/about/rules)
- [r/privacy rules](https://www.reddit.com/r/privacy/about/rules)
- [Reddit spam policy](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam)
- [AlternativeTo submission FAQ](https://alternativeto.net/faq/#add-a-new-application)
- [GitHub good-first-issue guidance](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/encouraging-helpful-contributions-to-your-project-with-labels)
