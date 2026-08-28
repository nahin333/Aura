import type {
  Finding,
  FindingCategory,
  FindingSeverity,
  TextDetector,
} from "./types";

const SAFE_REPLACEMENTS = new Set([
  "[redacted]",
  "<redacted>",
  "(redacted)",
  "redacted",
  "removed",
  "***",
]);
const SAFE_TYPED_ALIAS =
  /^\[(?:EMAIL|PHONE|IP|LINK|TOKEN|CARD|PROTECTED)_[1-9]\d{0,5}\]$/i;

const SENSITIVE_QUERY_KEYS = new Set([
  "access_key",
  "access_token",
  "api_key",
  "apikey",
  "auth",
  "authorization",
  "client_secret",
  "code",
  "credential",
  "key",
  "oauth_token",
  "password",
  "passwd",
  "pwd",
  "refresh_token",
  "secret",
  "session",
  "session_id",
  "sessionid",
  "sig",
  "signature",
  "token",
]);

function createMaskedPreview(value: string): string {
  const shownCharacters = Math.min(Math.max(value.length, 4), 12);
  const ellipsis = value.length > shownCharacters ? "…" : "";
  return `${"•".repeat(shownCharacters)}${ellipsis} (${value.length} chars)`;
}

function makeFinding(
  text: string,
  start: number,
  end: number,
  category: FindingCategory,
  severity: FindingSeverity,
  detectorId: string,
  confidence: number,
): Finding | undefined {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > text.length
  ) {
    return undefined;
  }

  return {
    category,
    severity,
    start,
    end,
    maskedPreview: createMaskedPreview(text.slice(start, end)),
    detectorId,
    confidence,
  };
}

function isAsciiAlphaNumeric(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9]/.test(character);
}

function isTokenCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_-]/.test(character);
}

function decodedValue(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function isKnownSafeReplacement(value: string): boolean {
  const decoded = decodedValue(value).trim();
  return (
    SAFE_REPLACEMENTS.has(decoded.toLowerCase()) ||
    SAFE_TYPED_ALIAS.test(decoded)
  );
}

function normalizedQueryKey(key: string): string {
  return decodedValue(key)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isSensitiveQueryKey(key: string): boolean {
  const normalized = normalizedQueryKey(key);
  if (SENSITIVE_QUERY_KEYS.has(normalized)) {
    return true;
  }

  return /(?:^|_)(?:api_key|auth|credential|password|secret|session|signature|token)$/.test(
    normalized,
  );
}

function findingsFromPattern(
  text: string,
  pattern: RegExp,
  category: FindingCategory,
  severity: FindingSeverity,
  detectorId: string,
  confidence: number,
): Finding[] {
  const findings: Finding[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || match[0].length === 0) {
      continue;
    }

    const start = match.index;
    const end = start + match[0].length;
    const finding = makeFinding(
      text,
      start,
      end,
      category,
      severity,
      detectorId,
      confidence,
    );
    if (finding) {
      findings.push(finding);
    }
  }
  return findings;
}

export const emailDetector: TextDetector = {
  id: "pii.email",
  detect(text) {
    return findingsFromPattern(
      text,
      /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+\b/gi,
      "email_address",
      "medium",
      this.id,
      0.98,
    );
  },
};

export const phoneDetector: TextDetector = {
  id: "pii.phone",
  detect(text) {
    const findings: Finding[] = [];
    const formattedPattern =
      /(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})[ .-]\d{3,4}[ .-]\d{3,4}\b/g;

    for (const match of text.matchAll(formattedPattern)) {
      if (match.index === undefined) {
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      const digitCount = match[0].replace(/\D/g, "").length;
      if (
        digitCount < 10 ||
        digitCount > 15 ||
        isAsciiAlphaNumeric(text[start - 1]) ||
        isAsciiAlphaNumeric(text[end])
      ) {
        continue;
      }
      const finding = makeFinding(
        text,
        start,
        end,
        "phone_number",
        "medium",
        this.id,
        0.9,
      );
      if (finding) {
        findings.push(finding);
      }
    }

    const compactPatterns: readonly [RegExp, number][] = [
      [/(?:^|[^A-Za-z0-9+])(\+\d{10,15})(?![A-Za-z0-9])/g, 0.87],
      [/(?:^|[^A-Za-z0-9])(\d{10,11})(?![A-Za-z0-9])/g, 0.72],
    ];

    for (const [pattern, confidence] of compactPatterns) {
      for (const match of text.matchAll(pattern)) {
        const value = match[1];
        if (match.index === undefined || !value) {
          continue;
        }
        const relativeStart = match[0].lastIndexOf(value);
        const start = match.index + relativeStart;
        const finding = makeFinding(
          text,
          start,
          start + value.length,
          "phone_number",
          "medium",
          this.id,
          confidence,
        );
        if (finding) {
          findings.push(finding);
        }
      }
    }

    return findings;
  },
};

export const ipv4Detector: TextDetector = {
  id: "network.ipv4",
  detect(text) {
    const findings: Finding[] = [];
    const pattern = /(?:\d{1,3}\.){3}\d{1,3}/g;
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      if (
        /[\d.]/.test(text[start - 1] ?? "") ||
        /[\d.]/.test(text[end] ?? "") ||
        !match[0].split(".").every((part) => Number(part) <= 255)
      ) {
        continue;
      }
      const finding = makeFinding(
        text,
        start,
        end,
        "ip_address",
        "medium",
        this.id,
        0.97,
      );
      if (finding) {
        findings.push(finding);
      }
    }
    return findings;
  },
};

export const sensitiveUrlDetector: TextDetector = {
  id: "url.sensitive-query-value",
  detect(text) {
    const findings: Finding[] = [];
    const pattern = /[?&]([^&=#\s]+)=([^&#\s]*)/g;
    for (const match of text.matchAll(pattern)) {
      const key = match[1];
      const value = match[2];
      if (
        match.index === undefined ||
        !key ||
        !value ||
        !isSensitiveQueryKey(key) ||
        isKnownSafeReplacement(value)
      ) {
        continue;
      }
      const relativeStart = match[0].lastIndexOf(value);
      const start = match.index + relativeStart;
      const finding = makeFinding(
        text,
        start,
        start + value.length,
        "sensitive_url_parameter",
        "high",
        this.id,
        0.96,
      );
      if (finding) {
        findings.push(finding);
      }
    }
    return findings;
  },
};

export const jwtDetector: TextDetector = {
  id: "secret.jwt",
  detect(text) {
    const findings: Finding[] = [];
    const pattern = /eyJ[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{8,}/g;
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      if (isTokenCharacter(text[start - 1]) || isTokenCharacter(text[end])) {
        continue;
      }
      const finding = makeFinding(
        text,
        start,
        end,
        "authentication_token",
        "critical",
        this.id,
        0.99,
      );
      if (finding) {
        findings.push(finding);
      }
    }
    return findings;
  },
};

export const awsAccessKeyDetector: TextDetector = {
  id: "secret.aws-access-key-id",
  detect(text) {
    return findingsFromPattern(
      text,
      /\b(?:AKIA|ASIA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[A-Z0-9]{16}\b/g,
      "authentication_token",
      "critical",
      this.id,
      0.99,
    );
  },
};

export const githubTokenDetector: TextDetector = {
  id: "secret.github-token",
  detect(text) {
    return findingsFromPattern(
      text,
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})\b/g,
      "authentication_token",
      "critical",
      this.id,
      0.99,
    );
  },
};

export const openAiTokenDetector: TextDetector = {
  id: "secret.openai-token",
  detect(text) {
    return findingsFromPattern(
      text,
      /\bsk-(?:(?:proj|svcacct)-)?[A-Za-z0-9][A-Za-z0-9_-]{18,}[A-Za-z0-9]\b/g,
      "authentication_token",
      "critical",
      this.id,
      0.99,
    );
  },
};

export const commonTokenDetector: TextDetector = {
  id: "secret.common-token",
  detect(text) {
    const findings = findingsFromPattern(
      text,
      /\b(?:xox[baprs]-[A-Za-z0-9-]{10,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|AIza[A-Za-z0-9_-]{35}|npm_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{20,})\b/g,
      "authentication_token",
      "critical",
      this.id,
      0.98,
    );

    const contextualPatterns: readonly [RegExp, number][] = [
      [
        /\b(?:api[_-]?key|access[_-]?token|auth(?:orization)?|aws[_-]?secret[_-]?access[_-]?key|client[_-]?secret|password|passwd|secret|token)\s*[:=]\s*(?:"([^"\r\n]{8,})"|'([^'\r\n]{8,})'|([A-Za-z0-9_./+=~-]{8,}))/gi,
        0.9,
      ],
      [/\b(?:bearer|basic)\s+([A-Za-z0-9._~+/=-]{12,})/gi, 0.92],
    ];

    for (const [pattern, confidence] of contextualPatterns) {
      for (const match of text.matchAll(pattern)) {
        const value = match[1] ?? match[2] ?? match[3];
        if (match.index === undefined || !value || isKnownSafeReplacement(value)) {
          continue;
        }
        const relativeStart = match[0].lastIndexOf(value);
        const start = match.index + relativeStart;
        const finding = makeFinding(
          text,
          start,
          start + value.length,
          "authentication_token",
          "critical",
          this.id,
          confidence,
        );
        if (finding) {
          findings.push(finding);
        }
      }
    }

    return findings;
  },
};

export function passesLuhn(value: string): boolean {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export const paymentCardDetector: TextDetector = {
  id: "financial.payment-card-luhn",
  detect(text) {
    const findings: Finding[] = [];
    const pattern = /\d(?:[ -]?\d){12,18}/g;
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined || !passesLuhn(match[0])) {
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      if (/\d/.test(text[start - 1] ?? "") || /\d/.test(text[end] ?? "")) {
        continue;
      }
      const finding = makeFinding(
        text,
        start,
        end,
        "payment_card",
        "critical",
        this.id,
        0.99,
      );
      if (finding) {
        findings.push(finding);
      }
    }
    return findings;
  },
};

export const BUILT_IN_TEXT_DETECTORS: readonly TextDetector[] = Object.freeze([
  emailDetector,
  phoneDetector,
  ipv4Detector,
  sensitiveUrlDetector,
  jwtDetector,
  awsAccessKeyDetector,
  githubTokenDetector,
  openAiTokenDetector,
  commonTokenDetector,
  paymentCardDetector,
]);

export const BUILT_IN_DETECTOR_IDS: readonly string[] = Object.freeze(
  BUILT_IN_TEXT_DETECTORS.map((detector) => detector.id),
);
