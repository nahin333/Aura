# Aura alpha user validation

This is a behavior test, not a request for compliments. The goal is to learn
whether people with a recent pre-share privacy problem can create and understand
a checked copy quickly enough to return to Aura.

## Gate

Run twenty recent-problem interviews across developers, support workers,
founders, teachers, recruiters, journalists, and privacy-conscious users.
Continue toward private alpha when all of these are true:

- at least eight participants had the problem in the previous 90 days;
- at least five test a non-critical artifact from their own workflow;
- at least 60% complete the relevant flow without help;
- median time to first checked copy is below 45 seconds, excluding deliberate
  review time;
- at least 30% of relevant participants repeat within seven days;
- at least five participants can accurately explain that Aura reruns listed
  checks on the exported bytes but cannot guarantee that nothing was missed.

Re-scope when fewer than five people trust it with a non-critical artifact,
review is slower than their current workaround, or the verification boundary
cannot be explained in one sentence.

## Privacy boundary for research

- Never ask a participant to upload, email, screen-share, or attach an artifact.
- The participant controls the artifact locally and may use the synthetic sample.
- Do not collect inputs, outputs, receipts, raw findings, filenames, employer
  names, account identifiers, or incident details.
- Record only task category, outcome, time bucket, confusion point, repeat
  intent, browser/OS, and the participant's explanation of the trust boundary.
- GitHub feedback is public. Use the structured
  [alpha user-test form](https://github.com/nahin333/Aura/issues/new?template=user-test.yml)
  and remind participants not to attach anything.

## Five-minute test

1. Ask: “Tell me about the last time you checked or removed private information
   before sharing text or an image. What did you do?” Do not pitch Aura yet.
2. Give the participant the [live app](https://nahin333.github.io/Aura/) and say:
   “Use synthetic data or a non-critical artifact. Prepare a checked copy as if
   you were about to share it. Think aloud. I cannot see or receive the content.”
3. Start timing when the app is visible. Do not explain controls unless the
   participant is fully blocked; note any intervention.
4. Stop first-value timing when the result view appears. Keep review time as a
   separate observation if it dominates the task.
5. Ask: “What did Aura verify, and what could it still have missed?”
6. Ask: “What is the one change that would make you use this for your next
   similar task?”
7. After seven days, ask only whether they encountered another relevant task and
   whether they used Aura again. Do not request the artifact.

## Scorecard

Record one row per participant outside the repository if anonymity is needed.
Publish aggregates only.

| Field | Allowed value |
| --- | --- |
| Segment | developer, support, founder, teacher, recruiter, journalist, privacy user |
| Problem recency | 0–7d, 8–30d, 31–90d, older, none |
| Input path | text, image, sample, receipt, offline |
| Outcome | unaided, assisted, failed, unsupported |
| First checked copy | <30s, 30–44s, 45–89s, 90–180s, >180s, none |
| Trust explanation | accurate, partial, inaccurate |
| Highest-friction stage | inspect, review, sanitize, verify, receipt, install |
| Seven-day repeat | yes, relevant task/no use, no relevant task, unreachable |

Do not turn open-text feedback directly into features. Cluster repeated problems,
link each proposed change to an observed task, and require a testable
inspect/sanitize/verify contract before implementation.

## Recruitment message

> I’m testing a free, open-source tool that checks text and images locally before
> sharing. I’m looking for people who recently redacted a screenshot, log, link,
> or message. The test takes five minutes; you keep the artifact on your device
> and do not send it to me. I need honest friction, not praise. Interested?

Do not offer rewards for GitHub stars, votes, comments, or public promotion.
