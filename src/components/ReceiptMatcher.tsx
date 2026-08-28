import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  matchReceiptFiles,
  RECEIPT_MATCH_DISCLAIMER,
  RECEIPT_MATCH_LIMITS,
  type ReceiptMatchResult,
} from "../lib/receipt-match";

export interface ReceiptMatcherProps {
  readonly onBack: () => void;
  readonly onBusyChange?: (busy: boolean) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MiB`;
}

export function ReceiptMatcher({ onBack, onBusyChange }: ReceiptMatcherProps) {
  const artifactInputId = useId();
  const receiptInputId = useId();
  const resultHeadingId = useId();
  const [artifactFile, setArtifactFile] = useState<File>();
  const [receiptFile, setReceiptFile] = useState<File>();
  const [result, setResult] = useState<ReceiptMatchResult>();
  const [isMatching, setIsMatching] = useState(false);
  const operationIdRef = useRef(0);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(
    () => () => {
      operationIdRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    onBusyChange?.(isMatching);
  }, [isMatching, onBusyChange]);

  useEffect(
    () => () => {
      onBusyChange?.(false);
    },
    [onBusyChange],
  );

  useEffect(() => {
    if (!result) return;
    const frame = window.requestAnimationFrame(() => {
      const heading = resultHeadingRef.current;
      if (!heading) return;
      heading.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
      heading.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [result]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!artifactFile || !receiptFile || isMatching) return;
    const operationId = ++operationIdRef.current;
    setIsMatching(true);
    setResult(undefined);
    const nextResult = await matchReceiptFiles(artifactFile, receiptFile);
    if (operationId !== operationIdRef.current) return;
    setResult(nextResult);
    setIsMatching(false);
  };

  return (
    <main className="receipt-matcher" aria-labelledby="receipt-matcher-title">
      <header className="receipt-matcher__header">
        <button
          className="receipt-matcher__back"
          type="button"
          onClick={onBack}
          disabled={isMatching}
          title={isMatching ? "Wait for the local comparison to finish" : undefined}
        >
          Back to preflight
        </button>
        <div>
          <p className="receipt-matcher__eyebrow">Local receipt matcher</p>
          <h1 id="receipt-matcher-title">Does this receipt describe this artifact?</h1>
        </div>
      </header>

      <section className="receipt-matcher__intro" aria-label="How receipt matching works">
        <p>
          Select an exported text or PNG artifact and its Aura JSON receipt. Aura reads
          both files locally, recomputes the artifact fingerprint, and does not upload or
          preview the artifact.
        </p>
        <p className="receipt-matcher__warning">
          <strong>Important:</strong> {RECEIPT_MATCH_DISCLAIMER}
        </p>
      </section>

      <form className="receipt-matcher__form" onSubmit={handleSubmit} aria-busy={isMatching}>
        <div className="receipt-matcher__field">
          <label className="receipt-matcher__label" htmlFor={artifactInputId}>
            Exported artifact
          </label>
          <input
            className="receipt-matcher__input"
            id={artifactInputId}
            type="file"
            accept="text/plain,image/png,.txt,.png"
            aria-describedby={`${artifactInputId}-hint`}
            disabled={isMatching}
            onChange={(event) => {
              operationIdRef.current += 1;
              setArtifactFile(event.currentTarget.files?.[0]);
              setResult(undefined);
            }}
          />
          <p className="receipt-matcher__hint" id={`${artifactInputId}-hint`}>
            Text up to {formatBytes(RECEIPT_MATCH_LIMITS.textArtifactBytes)} or PNG
            up to {formatBytes(RECEIPT_MATCH_LIMITS.imageArtifactBytes)}. Its content
            is never shown.
          </p>
        </div>

        <div className="receipt-matcher__field">
          <label className="receipt-matcher__label" htmlFor={receiptInputId}>
            Aura JSON receipt
          </label>
          <input
            className="receipt-matcher__input"
            id={receiptInputId}
            type="file"
            accept="application/json,.json"
            aria-describedby={`${receiptInputId}-hint`}
            disabled={isMatching}
            onChange={(event) => {
              operationIdRef.current += 1;
              setReceiptFile(event.currentTarget.files?.[0]);
              setResult(undefined);
            }}
          />
          <p className="receipt-matcher__hint" id={`${receiptInputId}-hint`}>
            Aura text receipt v1 or image receipt v1, up to{" "}
            {formatBytes(RECEIPT_MATCH_LIMITS.receiptBytes)}.
          </p>
        </div>

        <button
          className="receipt-matcher__submit"
          type="submit"
          disabled={!artifactFile || !receiptFile || isMatching}
        >
          {isMatching ? "Matching locally…" : "Match artifact to receipt"}
        </button>
      </form>

      <p className="receipt-matcher__local-note">
        Matching is local-only. Aura does not send either selected file over the network.
      </p>

      {result && (
        <section
          className={`receipt-matcher__result receipt-matcher__result--${result.status}`}
          aria-labelledby={resultHeadingId}
          aria-live="polite"
        >
          <p className="receipt-matcher__result-kicker">Result</p>
          <h2 id={resultHeadingId} ref={resultHeadingRef} tabIndex={-1}>
            {result.status === "match"
              ? "Artifact matches receipt"
              : result.status === "mismatch"
                ? "Artifact does not match receipt"
                : "Files could not be matched"}
          </h2>
          <p>{result.message}</p>

          {result.artifact && (
            <dl className="receipt-matcher__summary">
              <div className="receipt-matcher__summary-item">
                <dt>Artifact size</dt>
                <dd>{formatBytes(result.artifact.byteLength)}</dd>
              </div>
              {result.artifact.characterCount !== undefined && (
                <div className="receipt-matcher__summary-item">
                  <dt>UTF-16 characters</dt>
                  <dd>{result.artifact.characterCount}</dd>
                </div>
              )}
              {result.artifact.width !== undefined && result.artifact.height !== undefined && (
                <div className="receipt-matcher__summary-item">
                  <dt>PNG dimensions</dt>
                  <dd>
                    {result.artifact.width} × {result.artifact.height}
                  </dd>
                </div>
              )}
              {result.receiptVerificationStatus && (
                <div className="receipt-matcher__summary-item">
                  <dt>Receipt-recorded check status</dt>
                  <dd>{result.receiptVerificationStatus}</dd>
                </div>
              )}
            </dl>
          )}

          {result.checks.length > 0 && (
            <ul className="receipt-matcher__checks" aria-label="Receipt comparison checks">
              {result.checks.map((check) => (
                <li
                  className={`receipt-matcher__check receipt-matcher__check--${
                    check.matched ? "match" : "mismatch"
                  }`}
                  key={check.id}
                >
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="receipt-matcher__warning">
            <strong>Not a safety proof:</strong> {result.disclaimer}
          </p>
        </section>
      )}
    </main>
  );
}

export default ReceiptMatcher;
