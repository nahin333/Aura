import {
  BadgeCheck,
  Check,
  ChevronRight,
  CircleAlert,
  Clipboard,
  Copy,
  CreditCard,
  Download,
  Eye,
  FileCheck2,
  FileJson,
  FileText,
  Fingerprint,
  GitFork,
  Image as ImageIcon,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  MonitorDown,
  MousePointer2,
  Network,
  Phone,
  Plus,
  QrCode,
  RotateCcw,
  ScanLine,
  Share2,
  ShieldAlert,
  Sparkles,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BUILT_IN_TEXT_DETECTORS,
  MAX_PROTECTED_TERMS,
  buildReceipt,
  createProtectedTermDetector,
  detectText,
  redactText,
  summarizeFindings,
  verifyText,
  type Finding,
  type FindingCategory,
  type TextDetector,
} from "../packages/core/src";
import { ReceiptMatcher } from "./components/ReceiptMatcher";
import {
  createInstallPromptController,
  type InstallPromptController,
} from "./lib/pwa";
import {
  decodeImage,
  rasterizeImage,
  scanBarcode,
  scanMetadata,
  scanOutputPngChunks,
  sha256,
  validateImageFile,
  verifySolidRegions,
} from "./lib/image";
import { scanOcr, terminateOcrWorker } from "./lib/ocr";
import {
  countCategories,
  downloadBlob,
  findingValueHash,
  outputFilename,
  receiptFilename,
} from "./lib/privacy";
import {
  chooseOpaqueReplacement,
  collisionSafeTypedAlias,
} from "./lib/replacements";
import { createSampleFile, sampleFindingSeeds } from "./lib/sample";
import {
  buildImageChecks,
  classifyOutputFindings,
} from "./lib/verification";
import type {
  AppStage,
  FindingKind,
  ImageDocument,
  ImageReceipt,
  MetadataScan,
  NormalizedRect,
  PreflightDocument,
  PreflightResult,
  ReviewFinding,
} from "./types";

const STAGES = ["Inspect", "Review", "Sanitize", "Verify"] as const;
const TEXT_LIMIT = 250_000;
const PROTECTED_TERMS_DRAFT_LIMIT = 4_000;

type ScanStatus = "not-run" | "checked" | "error";
type ReplacementMode = "opaque" | "aliases";
type ToolMode = "preflight" | "receipt";

interface ScanSummary {
  ocr: ScanStatus;
  barcode: ScanStatus;
  metadata: ScanStatus;
}

const EMPTY_SCANS: ScanSummary = {
  ocr: "not-run",
  barcode: "not-run",
  metadata: "not-run",
};

const ALIAS_PREFIX: Record<FindingCategory, string> = {
  email_address: "EMAIL",
  phone_number: "PHONE",
  ip_address: "IP",
  sensitive_url_parameter: "LINK",
  authentication_token: "TOKEN",
  payment_card: "CARD",
  custom_sensitive: "PROTECTED",
};

function detectorSnapshotForDraft(draft: string): {
  detectors: readonly TextDetector[];
  protectedTermCount: number;
} {
  if (draft.length > PROTECTED_TERMS_DRAFT_LIMIT) {
    throw new RangeError(
      `Protected terms are limited to ${PROTECTED_TERMS_DRAFT_LIMIT.toLocaleString()} typed characters in total.`,
    );
  }
  const protectedTerms = draft
    .split(/\r\n?|\n/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (!protectedTerms.length) {
    return {
      detectors: BUILT_IN_TEXT_DETECTORS,
      protectedTermCount: 0,
    };
  }
  const protectedTermDetector = createProtectedTermDetector(protectedTerms);
  return {
    detectors: Object.freeze([
      ...BUILT_IN_TEXT_DETECTORS,
      protectedTermDetector,
    ]),
    protectedTermCount: protectedTerms.length,
  };
}

function typedAliasMarkers(
  selected: readonly (ReviewFinding & { textFinding: Finding })[],
): readonly string[] {
  const counters = new Map<string, number>();
  const aliases = new Map<string, string>();
  return selected.map((finding) => {
    const prefix = ALIAS_PREFIX[finding.textFinding.category];
    const identity = finding.valueHash ?? `${prefix}:${finding.id}`;
    const existing = aliases.get(identity);
    if (existing) return existing;
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    const alias = `[${prefix}_${next}]`;
    aliases.set(identity, alias);
    return alias;
  });
}

function kindForCategory(category: FindingCategory): FindingKind {
  const kinds: Record<FindingCategory, FindingKind> = {
    email_address: "email",
    phone_number: "phone",
    ip_address: "network",
    sensitive_url_parameter: "link",
    authentication_token: "credential",
    payment_card: "payment",
    custom_sensitive: "custom",
  };
  return kinds[category];
}

function titleForCategory(category: FindingCategory): string {
  const titles: Record<FindingCategory, string> = {
    email_address: "Email address",
    phone_number: "Phone number",
    ip_address: "IP address",
    sensitive_url_parameter: "Sensitive link",
    authentication_token: "Credential",
    payment_card: "Payment card",
    custom_sensitive: "Protected term",
  };
  return titles[category];
}

function findingIcon(kind: FindingKind) {
  const props = { size: 17, strokeWidth: 1.9, "aria-hidden": true };
  switch (kind) {
    case "email":
      return <Mail {...props} />;
    case "phone":
      return <Phone {...props} />;
    case "network":
      return <Network {...props} />;
    case "link":
    case "credential":
      return <KeyRound {...props} />;
    case "payment":
      return <CreditCard {...props} />;
    case "custom":
      return <Fingerprint {...props} />;
    case "barcode":
      return <QrCode {...props} />;
    case "metadata":
      return <MapPin {...props} />;
    case "manual":
      return <MousePointer2 {...props} />;
  }
}

function reviewFindingFromText(finding: Finding, index: number): ReviewFinding {
  return {
    id: `text-${finding.detectorId}-${finding.start}-${index}`,
    kind: kindForCategory(finding.category),
    title: titleForCategory(finding.category),
    preview: finding.maskedPreview,
    evidence: `Pasted text · ${finding.detectorId}`,
    detectorId: finding.detectorId,
    selected: true,
    required: finding.category === "custom_sensitive",
    textFinding: finding,
  };
}

function activeStageIndex(stage: AppStage): number {
  if (stage === "empty" || stage === "inspecting") return 0;
  if (stage === "reviewing") return 1;
  if (stage === "sanitizing") return 2;
  return 3;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function TextPreview({
  text,
  findings,
}: {
  text: string;
  findings: readonly ReviewFinding[];
}) {
  const ranged = findings
    .filter(
      (finding): finding is ReviewFinding & { textFinding: Finding } =>
        Boolean(finding.textFinding),
    )
    .sort(
      (left, right) => left.textFinding.start - right.textFinding.start,
    );
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const finding of ranged) {
    const { start, end } = finding.textFinding;
    nodes.push(text.slice(cursor, start));
    nodes.push(
      <mark
        key={finding.id}
        className={finding.selected ? "text-mark selected" : "text-mark"}
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  nodes.push(text.slice(cursor));
  return <pre className="text-preview">{nodes}</pre>;
}

function App() {
  const [toolMode, setToolMode] = useState<ToolMode>("preflight");
  const [stage, setStage] = useState<AppStage>("empty");
  const [document, setDocument] = useState<PreflightDocument>();
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [result, setResult] = useState<PreflightResult>();
  const [textDraft, setTextDraft] = useState("");
  const [protectedTermsDraft, setProtectedTermsDraft] = useState("");
  const [activeProtectedTermCount, setActiveProtectedTermCount] = useState(0);
  const [replacementMode, setReplacementMode] =
    useState<ReplacementMode>("opaque");
  const [aliasFallbackUsed, setAliasFallbackUsed] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(false);
  const [receiptMatching, setReceiptMatching] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [scanSummary, setScanSummary] = useState<ScanSummary>(EMPTY_SCANS);
  const [activeFindingId, setActiveFindingId] = useState<string>();
  const [manualMode, setManualMode] = useState(false);
  const [draftBox, setDraftBox] = useState<NormalizedRect>();
  const [viewOriginal, setViewOriginal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drawStartRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const documentUrlRef = useRef<string | undefined>(undefined);
  const resultUrlRef = useRef<string | undefined>(undefined);
  const operationIdRef = useRef(0);
  const detectorSnapshotRef = useRef<readonly TextDetector[]>(
    BUILT_IN_TEXT_DETECTORS,
  );
  const installPromptRef = useRef<InstallPromptController | undefined>(
    undefined,
  );

  const selectedFindings = useMemo(
    () => findings.filter((finding) => finding.selected),
    [findings],
  );
  const protectedTermDraftCount = useMemo(
    () =>
      protectedTermsDraft
        .split(/\r\n?|\n/)
        .filter((term) => term.trim().length > 0).length,
    [protectedTermsDraft],
  );
  const busy =
    stage === "inspecting" ||
    stage === "sanitizing" ||
    stage === "verifying" ||
    receiptMatching;

  const cleanObjectUrls = useCallback(() => {
    if (document?.kind === "image") URL.revokeObjectURL(document.url);
    if (result?.kind === "image") URL.revokeObjectURL(result.url);
  }, [document, result]);

  useEffect(() => {
    documentUrlRef.current =
      document?.kind === "image" ? document.url : undefined;
  }, [document]);

  useEffect(() => {
    resultUrlRef.current = result?.kind === "image" ? result.url : undefined;
  }, [result]);

  useEffect(
    () => () => {
      operationIdRef.current += 1;
      if (documentUrlRef.current) URL.revokeObjectURL(documentUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      void terminateOcrWorker();
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && manualMode) {
        setManualMode(false);
        setDraftBox(undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [manualMode]);

  useEffect(() => {
    const controller = createInstallPromptController(setInstallAvailable);
    installPromptRef.current = controller;
    return () => {
      controller.dispose();
      if (installPromptRef.current === controller) {
        installPromptRef.current = undefined;
      }
    };
  }, []);

  const reset = useCallback(() => {
    operationIdRef.current += 1;
    cleanObjectUrls();
    setStage("empty");
    setToolMode("preflight");
    setDocument(undefined);
    setFindings([]);
    setResult(undefined);
    setTextDraft("");
    setProtectedTermsDraft("");
    setActiveProtectedTermCount(0);
    setReplacementMode("opaque");
    setAliasFallbackUsed(false);
    setReceiptMatching(false);
    detectorSnapshotRef.current = BUILT_IN_TEXT_DETECTORS;
    setStatusMessage("");
    setErrorMessage("");
    setNotice("");
    setScanSummary(EMPTY_SCANS);
    setActiveFindingId(undefined);
    setManualMode(false);
    setDraftBox(undefined);
    setViewOriginal(false);
  }, [cleanObjectUrls]);

  const inspectImage = useCallback(async (
    file: File,
    synthetic = false,
    forcedDetectors?: readonly TextDetector[],
  ) => {
    let detectors: readonly TextDetector[];
    let protectedTermCount = 0;
    try {
      if (forcedDetectors) {
        detectors = forcedDetectors;
      } else {
        const snapshot = detectorSnapshotForDraft(protectedTermsDraft);
        detectors = snapshot.detectors;
        protectedTermCount = snapshot.protectedTermCount;
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The protected terms could not be used.",
      );
      setStage("empty");
      return;
    }
    detectorSnapshotRef.current = detectors;
    setActiveProtectedTermCount(protectedTermCount);
    const operationId = ++operationIdRef.current;
    setErrorMessage("");
    setNotice("");
    setStage("inspecting");
    setStatusMessage("Reading image bytes…");
    setScanSummary(EMPTY_SCANS);
    try {
      validateImageFile(file);
      const { width, height } = await decodeImage(file);
      if (operationId !== operationIdRef.current) return;

      if (synthetic) {
        const seeded = await Promise.all(
          sampleFindingSeeds.map(async (seed) => ({
            id: seed.id,
            kind: seed.kind,
            title: seed.title,
            preview: seed.preview,
            evidence: seed.evidence,
            detectorId: seed.detectorId,
            selected: true,
            required: seed.kind === "metadata",
            box: seed.box,
            valueHash: await sha256(seed.rawValue),
            synthetic: true,
          })),
        );
        if (operationId !== operationIdRef.current) return;
        const imageDocument: ImageDocument = {
          kind: "image",
          file,
          url: URL.createObjectURL(file),
          width,
          height,
          mimeType: file.type,
          byteLength: file.size,
          synthetic,
        };
        setDocument(imageDocument);
        setFindings(seeded);
        setScanSummary({
          ocr: "not-run",
          barcode: "not-run",
          metadata: "checked",
        });
        setStatusMessage("");
        setStage("reviewing");
        return;
      }

      setStatusMessage("Inspecting metadata, QR codes, and visible text…");
      const [metadata, barcode, ocr] = await Promise.all([
        scanMetadata(file),
        scanBarcode(file),
        scanOcr(file, width, height, ({ status, progress }) => {
          if (operationId !== operationIdRef.current) return;
          const percent = Math.round(progress * 100);
          setStatusMessage(
            progress > 0
              ? `Visible-text engine: ${status} (${percent}%)`
              : `Visible-text engine: ${status}`,
          );
        }, detectors),
      ]);
      if (operationId !== operationIdRef.current) return;

      const imageFindings: ReviewFinding[] = ocr.findings.map(
        ({ finding, box, valueHash, engineConfidence }, index) => ({
          id: `ocr-${finding.detectorId}-${index}`,
          kind: kindForCategory(finding.category),
          title: titleForCategory(finding.category),
          preview: finding.maskedPreview,
          evidence: `Visible text · OCR score ${Math.round(engineConfidence)}`,
          detectorId: finding.detectorId,
          selected: true,
          required: finding.category === "custom_sensitive",
          box,
          valueHash,
        }),
      );

      if (barcode.finding) {
        imageFindings.push({
          id: "barcode-0",
          kind: "barcode",
          title: "QR code",
          preview: barcode.finding.preview,
          evidence: `Decoded payload · ${barcode.finding.format}`,
          detectorId: "zxing.qr",
          selected: true,
          box: barcode.finding.box,
          valueHash: barcode.finding.valueHash,
        });
      }

      for (const group of metadata.groups) {
        imageFindings.push({
          id: `metadata-${group.id}`,
          kind: "metadata",
          title: group.label,
          preview: `${group.fieldCount} field${group.fieldCount === 1 ? "" : "s"}`,
          evidence: `Hidden metadata · Exact ${group.id.toUpperCase()} fields`,
          detectorId: `exifreader.${group.id}`,
          selected: true,
          required: true,
        });
      }

      const imageDocument: ImageDocument = {
        kind: "image",
        file,
        url: URL.createObjectURL(file),
        width,
        height,
        mimeType: file.type,
        byteLength: file.size,
        synthetic,
      };
      setDocument(imageDocument);
      setFindings(imageFindings);
      setScanSummary({
        ocr: ocr.status,
        barcode: barcode.status,
        metadata: metadata.status,
      });
      const failedScans = [ocr.status, barcode.status, metadata.status].filter(
        (status) => status === "error",
      ).length;
      if (failedScans) {
        setNotice(
          `${failedScans} inspection check${failedScans === 1 ? "" : "s"} could not complete. A checked export cannot pass until every required check runs.`,
        );
      }
      setStatusMessage("");
      setStage("reviewing");
    } catch (error) {
      if (operationId !== operationIdRef.current) return;
      setErrorMessage(
        error instanceof Error ? error.message : "The image could not be read.",
      );
      setStatusMessage("");
      setStage("error");
    }
  }, [protectedTermsDraft]);

  const loadSample = useCallback(async () => {
    const operationId = ++operationIdRef.current;
    setErrorMessage("");
    setNotice("");
    setStage("inspecting");
    setStatusMessage("Creating a local synthetic sample…");
    try {
      setProtectedTermsDraft("");
      setTextDraft("");
      setActiveProtectedTermCount(0);
      detectorSnapshotRef.current = BUILT_IN_TEXT_DETECTORS;
      const file = await createSampleFile();
      if (operationId !== operationIdRef.current) return;
      void inspectImage(file, true, BUILT_IN_TEXT_DETECTORS);
    } catch (error) {
      if (operationId !== operationIdRef.current) return;
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The synthetic demo could not be created.",
      );
      setStage("error");
    }
  }, [inspectImage]);

  const inspectText = useCallback(async (text: string) => {
    if (!text.trim()) {
      setErrorMessage("Paste some text before running the check.");
      return;
    }
    if (text.length > TEXT_LIMIT) {
      setErrorMessage("For this prototype, keep pasted text below 250,000 characters.");
      return;
    }
    let detectors: readonly TextDetector[];
    let protectedTermCount: number;
    try {
      const snapshot = detectorSnapshotForDraft(protectedTermsDraft);
      detectors = snapshot.detectors;
      protectedTermCount = snapshot.protectedTermCount;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The protected terms could not be used.",
      );
      return;
    }
    detectorSnapshotRef.current = detectors;
    setActiveProtectedTermCount(protectedTermCount);
    const operationId = ++operationIdRef.current;
    setErrorMessage("");
    setNotice("");
    setStage("inspecting");
    setStatusMessage("Running deterministic privacy rules…");
    try {
      const detected = detectText(text, { detectors });
      const reviewFindings = await Promise.all(
        detected.map(async (finding, index) => ({
          ...reviewFindingFromText(finding, index),
          valueHash: await findingValueHash(
            text.slice(finding.start, finding.end),
            finding.detectorId,
          ),
        })),
      );
      if (operationId !== operationIdRef.current) return;
      setDocument({ kind: "text", text });
      setFindings(reviewFindings);
      setScanSummary(EMPTY_SCANS);
      setStatusMessage("");
      setStage("reviewing");
    } catch (error) {
      if (operationId !== operationIdRef.current) return;
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The text check could not be completed.",
      );
      setStatusMessage("");
      setStage("error");
    }
  }, [protectedTermsDraft]);

  const handleFile = useCallback(
    (file?: File) => {
      if (file) void inspectImage(file);
    },
    [inspectImage],
  );

  useEffect(() => {
    if (toolMode !== "preflight" || stage !== "empty") return;
    const onPaste = (event: globalThis.ClipboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      const image = Array.from(event.clipboardData?.files ?? []).find((file) =>
        file.type.startsWith("image/"),
      );
      if (image) {
        event.preventDefault();
        handleFile(image);
        return;
      }
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (text.trim()) {
        event.preventDefault();
        setTextDraft(text);
        void inspectText(text);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFile, inspectText, stage, toolMode]);

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleFile(event.dataTransfer.files?.[0]);
  };

  const toggleFinding = (id: string) => {
    setFindings((current) =>
      current.map((finding) =>
        finding.id === id
          ? finding.required
            ? finding
            : { ...finding, selected: !finding.selected }
          : finding,
      ),
    );
  };

  const pointerPosition = (
    event: PointerEvent<HTMLDivElement>,
  ): { x: number; y: number } => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };

  const onCanvasPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!manualMode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPosition(event);
    drawStartRef.current = point;
    setDraftBox({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const onCanvasPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!manualMode || !drawStartRef.current) return;
    const point = pointerPosition(event);
    const start = drawStartRef.current;
    setDraftBox({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  };

  const onCanvasPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!manualMode || !draftBox || !drawStartRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    drawStartRef.current = undefined;
    if (draftBox.width > 0.008 && draftBox.height > 0.008) {
      const id = `manual-${crypto.randomUUID()}`;
      setFindings((current) => [
        ...current,
        {
          id,
          kind: "manual",
          title: "Manual redaction",
          preview: "Solid region",
          evidence: "Added by you · Pixel-level replacement",
          detectorId: "manual.region",
          selected: true,
          box: draftBox,
        },
      ]);
      setActiveFindingId(id);
    }
    setDraftBox(undefined);
    setManualMode(false);
  };

  const nudgeManualBox = (
    event: KeyboardEvent<HTMLButtonElement>,
    finding: ReviewFinding,
  ) => {
    if (finding.kind !== "manual" || !finding.box) return;
    const delta = event.shiftKey ? 0.01 : 0.002;
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-delta, 0],
      ArrowRight: [delta, 0],
      ArrowUp: [0, -delta],
      ArrowDown: [0, delta],
    };
    const change = movement[event.key];
    if (!change) return;
    event.preventDefault();
    setFindings((current) =>
      current.map((item) =>
        item.id === finding.id && item.box
          ? {
              ...item,
              box: {
                ...item.box,
                x: Math.max(
                  0,
                  Math.min(1 - item.box.width, item.box.x + change[0]),
                ),
                y: Math.max(
                  0,
                  Math.min(1 - item.box.height, item.box.y + change[1]),
                ),
              },
            }
          : item,
      ),
    );
  };

  const sanitizeText = async () => {
    if (document?.kind !== "text") return;
    const operationId = ++operationIdRef.current;
    setErrorMessage("");
    setStage("sanitizing");
    setStatusMessage("Replacing approved spans in a new text artifact…");
    try {
      const selectedReviewFindings = selectedFindings
        .filter(
          (
            finding,
          ): finding is ReviewFinding & { textFinding: Finding } =>
            Boolean(finding.textFinding),
        )
        .sort(
          (left, right) =>
            left.textFinding.start - right.textFinding.start,
        );
      const selected = selectedReviewFindings.map(
        (finding) => finding.textFinding,
      );
      const detectors = detectorSnapshotRef.current;
      const opaqueReplacement = chooseOpaqueReplacement(detectors);
      const aliases =
        replacementMode === "aliases"
          ? typedAliasMarkers(selectedReviewFindings).map((alias) =>
              collisionSafeTypedAlias(alias, detectors, opaqueReplacement),
            )
          : [];
      setAliasFallbackUsed(
        replacementMode === "aliases" &&
          aliases.some((alias) => alias === opaqueReplacement),
      );
      let aliasIndex = 0;
      const redaction = redactText(document.text, {
        findings: selected,
        replacement: opaqueReplacement,
        replacementForFinding:
          replacementMode === "aliases"
            ? () => aliases[aliasIndex++] ?? "[REDACTED]"
            : undefined,
      });
      setStage("verifying");
      setStatusMessage("Re-scanning the sanitized text…");
      const observedVerification = verifyText(redaction.sanitizedText, {
        detectors: detectorSnapshotRef.current,
      });
      const selectedHashes = selectedFindings
        .map((finding) => finding.valueHash)
        .filter((hash): hash is string => Boolean(hash));
      const retainedHashes = findings
        .filter((finding) => !finding.selected)
        .map((finding) => finding.valueHash)
        .filter((hash): hash is string => Boolean(hash));
      const [hashedOutputFindings, outputHash] = await Promise.all([
        Promise.all(
          observedVerification.findings.map(async (finding) => ({
            finding,
            valueHash: await findingValueHash(
              redaction.sanitizedText.slice(finding.start, finding.end),
              finding.detectorId,
            ),
          })),
        ),
        sha256(redaction.sanitizedText),
      ]);
      if (operationId !== operationIdRef.current) return;
      const classification = classifyOutputFindings(
        hashedOutputFindings,
        selectedHashes,
        retainedHashes,
      );
      const selectedHashSet = new Set(selectedHashes);
      const retainedHashSet = new Set(retainedHashes);
      const blockingFindings = hashedOutputFindings
        .filter(
          ({ valueHash }) =>
            selectedHashSet.has(valueHash) || !retainedHashSet.has(valueHash),
        )
        .map(({ finding }) => finding);
      const rawResidue = selected.some((finding) => {
        const value = document.text.slice(finding.start, finding.end);
        return value.length > 0 && redaction.sanitizedText.includes(value);
      });
      const passed =
        classification.selectedResidueCount === 0 &&
        classification.unknownCount === 0 &&
        !rawResidue;
      const verification = {
        status: passed ? ("pass" as const) : ("fail" as const),
        passed,
        remainingFindingCount: blockingFindings.length,
        counts: summarizeFindings(blockingFindings),
        findings: blockingFindings,
      };
      const receipt = buildReceipt({
        sourceCharacterCount: document.text.length,
        outputCharacterCount: redaction.sanitizedText.length,
        outputSha256: outputHash,
        acceptedFindings: redaction.acceptedFindings,
        verification,
        observedFindingCount: observedVerification.remainingFindingCount,
      });
      setResult({
        kind: "text",
        text: redaction.sanitizedText,
        receipt,
        passed,
        retainedObservedCount: classification.retainedCount,
        unknownObservedCount: classification.unknownCount,
      });
      setStatusMessage("");
      setStage("result");
    } catch (error) {
      if (operationId !== operationIdRef.current) return;
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The checked text could not be created and verified.",
      );
      setStatusMessage("");
      setStage("error");
    }
  };

  const sanitizeImage = async () => {
    if (document?.kind !== "image") return;
    const operationId = ++operationIdRef.current;
    setErrorMessage("");
    setStage("sanitizing");
    setStatusMessage("Creating a newly encoded PNG with solid redactions…");
    try {
      const selectedVisualFindings = selectedFindings.filter(
        (finding) => finding.kind !== "metadata",
      );
      const boxes = selectedVisualFindings
        .map((finding) => finding.box)
        .filter((box): box is NormalizedRect => Boolean(box));
      const everySelectedVisualFindingHasBox =
        boxes.length === selectedVisualFindings.length;
      const blob = await rasterizeImage(document.file, boxes);
      if (operationId !== operationIdRef.current) return;
      setStage("verifying");
      setStatusMessage("Checking the exported bytes…");

      let dimensions: { width: number; height: number } | undefined;
      try {
        dimensions = await decodeImage(blob);
      } catch {
        dimensions = undefined;
      }

      const solidPromise = everySelectedVisualFindingHasBox
        ? verifySolidRegions(blob, boxes).catch(() => false)
        : Promise.resolve(false);
      const metadataPromise = scanMetadata(blob);
      const pngChunksPromise = scanOutputPngChunks(blob);
      const barcodePromise = document.synthetic
        ? Promise.resolve({
            status: "checked" as const,
            finding: undefined,
          })
        : scanBarcode(blob);
      const ocrPromise =
        document.synthetic || !dimensions
          ? Promise.resolve({
              status: "checked" as const,
              findings: [],
              lineCount: 0,
            })
          : scanOcr(
              blob,
              dimensions.width,
              dimensions.height,
              ({ status }) => {
                if (operationId === operationIdRef.current) {
                  setStatusMessage(`Checking exported bytes: ${status}…`);
                }
              },
              detectorSnapshotRef.current,
            );
      const [solid, metadata, pngChunks, barcode, ocr] = await Promise.all([
        solidPromise,
        metadataPromise,
        pngChunksPromise,
        barcodePromise,
        ocrPromise,
      ]);
      if (operationId !== operationIdRef.current) return;
      const selectedOcrHashes = selectedFindings
          .filter(
            (finding) =>
              finding.kind !== "metadata" &&
              finding.kind !== "barcode" &&
              finding.kind !== "manual",
          )
          .map((finding) => finding.valueHash)
          .filter((hash): hash is string => Boolean(hash));
      const retainedOcrHashes = findings
        .filter(
          (finding) =>
            !finding.selected &&
            finding.kind !== "metadata" &&
            finding.kind !== "barcode" &&
            finding.kind !== "manual",
        )
        .map((finding) => finding.valueHash)
        .filter((hash): hash is string => Boolean(hash));
      const selectedBarcodeHashes = selectedFindings
          .filter((finding) => finding.kind === "barcode")
          .map((finding) => finding.valueHash)
          .filter((hash): hash is string => Boolean(hash));
      const retainedBarcodeHashes = findings
        .filter(
          (finding) => !finding.selected && finding.kind === "barcode",
        )
        .map((finding) => finding.valueHash)
        .filter((hash): hash is string => Boolean(hash));
      const verificationResult = buildImageChecks({
        synthetic: document.synthetic,
        dimensions,
        solid,
        everySelectedVisualFindingHasBox,
        visualRegionCount: boxes.length,
        metadata,
        pngChunks,
        ocr,
        barcode,
        selectedOcrHashes,
        retainedOcrHashes,
        selectedBarcodeHashes,
        retainedBarcodeHashes,
      });
      const { checks, passed } = verificationResult;
      const outputHash = await sha256(blob);
      if (operationId !== operationIdRef.current) return;
      const receipt: ImageReceipt = {
        schema: "aura.preflight.image-receipt/v1",
        createdAt: new Date().toISOString(),
        mediaType: "image/png",
        mode: document.synthetic ? "synthetic-demo" : "uploaded-artifact",
        source: {
          byteLength: document.byteLength,
          mimeType: document.mimeType,
        },
        output: {
          sha256: outputHash,
          byteLength: blob.size,
          width: dimensions?.width ?? 0,
          height: dimensions?.height ?? 0,
        },
        redaction: {
          selectedCount: selectedFindings.length,
          byCategory: countCategories(selectedFindings),
          manualRegionCount: selectedFindings.filter(
            (finding) => finding.kind === "manual",
          ).length,
        },
        verification: {
          status:
            document.synthetic && passed ? "demo" : passed ? "pass" : "fail",
          checks,
        },
        engines: {
          deterministicRules: "aura-rules/0.2.0",
          ocr: "tesseract.js/7.0.0",
          barcode: "@zxing/browser/0.1.5",
          metadata: "exifreader/4.44.0",
        },
        properties: [
          "original-bytes-unchanged",
          "output-newly-encoded",
          "raw-sensitive-values-excluded-from-receipt",
          ...(boxes.length > 0 && solid && everySelectedVisualFindingHasBox
            ? ["selected-redaction-pixels-verified"]
            : []),
        ],
        limitations: [
          "Detection can miss sensitive content.",
          "OCR confidence is not an accuracy guarantee.",
          "Only the checks listed in this receipt were run.",
          "This unsigned diagnostic receipt can be edited and is not an attestation.",
          ...(document.synthetic
            ? ["Synthetic demo findings were preloaded; OCR and QR checks were not run."]
            : []),
        ],
      };

      const resultUrl = URL.createObjectURL(blob);
      if (operationId !== operationIdRef.current) {
        URL.revokeObjectURL(resultUrl);
        return;
      }
      setResult({
        kind: "image",
        blob,
        url: resultUrl,
        receipt,
        passed,
      });
      setViewOriginal(false);
      setStatusMessage("");
      setStage("result");
    } catch (error) {
      if (operationId !== operationIdRef.current) return;
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The exported image could not be checked.",
      );
      setStatusMessage("");
      setStage("error");
    }
  };

  const sanitize = () => {
    const isZeroFindingImage =
      document?.kind === "image" && findings.length === 0;

    if (!selectedFindings.length && !isZeroFindingImage) {
      setNotice("Select at least one finding or add a manual redaction first.");
      return;
    }
    if (document?.kind === "text") void sanitizeText();
    if (document?.kind === "image") void sanitizeImage();
  };

  const copyOutput = async () => {
    if (!result?.passed) return;
    try {
      if (result.kind === "text") {
        await navigator.clipboard.writeText(result.text);
      } else {
        if (!("ClipboardItem" in window)) {
          throw new Error("Image clipboard is not supported.");
        }
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": result.blob }),
        ]);
      }
      setNotice("Checked copy placed on your clipboard.");
    } catch {
      setNotice("Clipboard access was unavailable. Use the save button instead.");
    }
  };

  const shareOutput = async () => {
    if (!result?.passed || typeof navigator.share !== "function") return;
    try {
      if (result.kind === "text") {
        await navigator.share({
          title: "Aura checked copy",
          text: result.text,
        });
      } else {
        const file = new File([result.blob], outputFilename(), {
          type: "image/png",
        });
        if (
          typeof navigator.canShare !== "function" ||
          !navigator.canShare({ files: [file] })
        ) {
          setNotice(
            "This browser cannot share PNG files directly. Save the checked copy instead.",
          );
          return;
        }
        await navigator.share({
          title: "Aura checked copy",
          files: [file],
        });
      }
      setNotice("Checked copy shared through your device.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice("System sharing was unavailable. Save the checked copy instead.");
    }
  };

  const saveOutput = () => {
    if (!result?.passed) return;
    if (result.kind === "image") {
      downloadBlob(result.blob, outputFilename());
    } else {
      downloadBlob(
        new Blob([result.text], { type: "text/plain;charset=utf-8" }),
        "aura-checked.txt",
      );
    }
  };

  const saveReceipt = () => {
    if (!result) return;
    downloadBlob(
      new Blob([JSON.stringify(result.receipt, null, 2)], {
        type: "application/json",
      }),
      receiptFilename(),
    );
  };

  const renderingResultImage =
    result?.kind === "image" && document?.kind === "image";
  const renderingSyntheticDemo =
    renderingResultImage && document.synthetic;
  const completedSyntheticDemo =
    Boolean(renderingSyntheticDemo && result?.passed);
  const nativeShareAvailable = (() => {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.share !== "function" ||
      !result
    ) {
      return false;
    }
    if (result.kind === "text") return true;
    if (typeof navigator.canShare !== "function") return false;
    try {
      return navigator.canShare({
        files: [
          new File([result.blob], "aura-checked.png", {
            type: "image/png",
          }),
        ],
      });
    } catch {
      return false;
    }
  })();

  const openReceiptMatcher = () => {
    reset();
    setToolMode("receipt");
  };

  const installAura = async () => {
    const outcome = await installPromptRef.current?.prompt();
    if (outcome === "dismissed") {
      setNotice("Installation was dismissed; you can keep using Aura in this tab.");
    } else if (outcome === "error") {
      setNotice("The browser could not open its install prompt.");
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="brand"
          type="button"
          onClick={reset}
          disabled={busy}
          title={busy ? "Wait for the current local check to finish" : "Start over"}
        >
          <span className="brand-mark" aria-hidden="true">
            <ScanLine size={20} strokeWidth={2.3} />
          </span>
          <span>Aura</span>
          <span className="brand-product">Preflight</span>
          <span className="prototype-tag">v0.2</span>
        </button>

        {toolMode === "preflight" ? (
          <nav className="stage-rail" aria-label="Preflight progress">
            {STAGES.map((label, index) => {
              const active = index === activeStageIndex(stage);
              const complete = index < activeStageIndex(stage);
              return (
                <div
                  className={`stage-step${active ? " active" : ""}${complete ? " complete" : ""}`}
                  key={label}
                >
                  <span className="stage-dot">
                    {complete ? <Check size={11} /> : index + 1}
                  </span>
                  <span>{label}</span>
                </div>
              );
            })}
          </nav>
        ) : (
          <div className="tool-mode-label">
            <FileCheck2 size={16} />
            Receipt matcher
          </div>
        )}

        <div className="header-trust">
          <LockKeyhole size={15} />
          <span>On-device</span>
          <span className="trust-divider" />
          <span>Original unchanged</span>
        </div>

        <a
          className="icon-button github-link"
          href="https://github.com/nahin333/Aura"
          target="_blank"
          rel="noreferrer"
          aria-label="Open Aura on GitHub"
        >
          <GitFork size={19} />
        </a>
      </header>

      {toolMode === "receipt" && (
        <ReceiptMatcher onBack={reset} onBusyChange={setReceiptMatching} />
      )}

      {toolMode === "preflight" &&
        document?.kind === "image" &&
        document.synthetic && (
        <div className="demo-banner">
          <Sparkles size={15} />
          <strong>Synthetic demo</strong>
          <span>Findings are preloaded and clearly separated from real scans.</span>
        </div>
      )}

      {toolMode === "preflight" && stage === "empty" && (
        <main className="empty-page">
          <section className="hero">
            <div className="eyebrow">
              <span className="pulse-dot" />
              Private pre-share check
            </div>
            <h1>
              Check before
              <br />
              you share.
            </h1>
            <p className="hero-copy">
              Find possible leaks in screenshots and text, choose what to
              remove, then verify the newly exported copy.
            </p>
            <div className="hero-actions">
              <button className="primary-button" type="button" onClick={loadSample}>
                <Sparkles size={18} />
                Try the sample
                <ChevronRight size={17} />
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={18} />
                Choose image
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={openReceiptMatcher}
              >
                <FileCheck2 size={18} />
                Match a receipt
              </button>
              {installAvailable && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void installAura()}
                >
                  <MonitorDown size={18} />
                  Install offline
                </button>
              )}
            </div>
            {notice && (
              <p className="hero-notice" role="status">
                {notice}
              </p>
            )}
            <div className="trust-row">
              <span>
                <WifiOff size={15} /> No upload
              </span>
              <span>
                <LockKeyhole size={15} /> No account
              </span>
              <span>
                <Eye size={15} /> Review visible findings
              </span>
            </div>
          </section>

          <section className="input-card" aria-label="Start a privacy check">
            <div
              className="drop-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
            >
              <div className="drop-icon">
                <ImageIcon size={24} />
              </div>
              <div>
                <strong>Drop or paste a screenshot</strong>
                <span>PNG, JPEG, or WebP · up to 25 MB · Ctrl/Cmd+V</span>
              </div>
              <button
                className="small-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse
              </button>
            </div>
            <div className="or-divider">
              <span>optional personal privacy lens</span>
            </div>
            <details className="protected-terms">
              <summary>
                <span>
                  <Fingerprint size={16} />
                  Always hide
                </span>
                <span className="session-badge">Session only</span>
              </summary>
              <div className="protected-terms-body">
                <label htmlFor="protected-terms">
                  Names, handles, IDs, or project terms — one literal phrase
                  per line, matched wherever it appears
                </label>
                <textarea
                  id="protected-terms"
                  value={protectedTermsDraft}
                  onChange={(event) => {
                    setProtectedTermsDraft(event.target.value);
                    setErrorMessage("");
                  }}
                  placeholder={"Acme launch\n@private-handle"}
                  rows={3}
                  maxLength={PROTECTED_TERMS_DRAFT_LIMIT}
                  spellCheck={false}
                  autoComplete="off"
                  aria-describedby="protected-terms-note"
                />
                <p id="protected-terms-note">
                  {protectedTermDraftCount}/{MAX_PROTECTED_TERMS} entries · kept
                  only in memory and forgotten on reset
                </p>
              </div>
            </details>
            <div className="or-divider">
              <span>or check pasted text</span>
            </div>
            <label className="text-input-label" htmlFor="text-input">
              <FileText size={16} />
              Text, logs, links, or messages
            </label>
            <textarea
              id="text-input"
              value={textDraft}
              onChange={(event) => setTextDraft(event.target.value)}
              placeholder="Paste text here. It never leaves this browser."
              rows={6}
              spellCheck={false}
            />
            {errorMessage && (
              <div className="input-error" role="alert">
                <CircleAlert size={15} />
                {errorMessage}
              </div>
            )}
            <button
              className="text-check-button"
              type="button"
              onClick={() => void inspectText(textDraft)}
              disabled={!textDraft.trim()}
            >
              Check pasted text
              <ChevronRight size={17} />
            </button>
          </section>

          <aside className="honest-note">
            <ShieldAlert size={19} />
            <div>
              <strong>Detection can miss things.</strong>
              <span>Always review the checked copy before sharing it.</span>
            </div>
          </aside>
        </main>
      )}

      {toolMode === "preflight" &&
        (stage === "inspecting" ||
          stage === "sanitizing" ||
          stage === "verifying") && (
        <main className="working-page" aria-live="polite">
          <div className="working-orbit">
            <LoaderCircle size={34} className="spinner" />
            <span className="orbit-dot" />
          </div>
          <p className="working-kicker">
            {stage === "inspecting"
              ? "Inspecting locally"
              : stage === "sanitizing"
                ? "Creating a new artifact"
                : "Verifying exported bytes"}
          </p>
          <h2>
            {stage === "inspecting"
              ? "Looking for possible leaks…"
              : stage === "sanitizing"
                ? "Applying destructive redactions…"
                : "Running the checks again…"}
          </h2>
          <p className="working-status">{statusMessage}</p>
          <div className="working-rules">
            <span>Nothing uploaded</span>
            <span>Original untouched</span>
            <span>No raw values logged</span>
          </div>
        </main>
      )}

      {toolMode === "preflight" && stage === "reviewing" && document && (
        <main className="review-page">
          <section className="artifact-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">Review</span>
                <h2>
                  {document.kind === "image"
                    ? document.file.name
                    : "Pasted text"}
                </h2>
              </div>
              <div className="artifact-meta">
                {document.kind === "image" ? (
                  <>
                    <span>
                      {document.width} × {document.height}
                    </span>
                    <span>{formatBytes(document.byteLength)}</span>
                  </>
                ) : (
                  <span>{document.text.length.toLocaleString()} characters</span>
                )}
              </div>
            </div>

            {notice && (
              <div className="inline-notice" role="status">
                <CircleAlert size={17} />
                {notice}
              </div>
            )}

            {document.kind === "image" ? (
              <>
                <div
                  className={`image-stage${manualMode ? " drawing" : ""}`}
                  onPointerDown={onCanvasPointerDown}
                  onPointerMove={onCanvasPointerMove}
                  onPointerUp={onCanvasPointerUp}
                >
                  <img src={document.url} alt="Artifact being reviewed" />
                  <div className="overlay-layer">
                    {findings.map((finding, index) =>
                      finding.box ? (
                        <button
                          type="button"
                          key={finding.id}
                          className={`finding-box${finding.selected ? " selected" : ""}${activeFindingId === finding.id ? " active" : ""}${finding.kind === "manual" ? " manual" : ""}`}
                          style={{
                            left: `${finding.box.x * 100}%`,
                            top: `${finding.box.y * 100}%`,
                            width: `${finding.box.width * 100}%`,
                            height: `${finding.box.height * 100}%`,
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => setActiveFindingId(finding.id)}
                          onKeyDown={(event) => nudgeManualBox(event, finding)}
                          aria-label={`Finding ${index + 1}: ${finding.title}`}
                        >
                          <span>{index + 1}</span>
                        </button>
                      ) : null,
                    )}
                    {draftBox && (
                      <div
                        className="draft-box"
                        style={{
                          left: `${draftBox.x * 100}%`,
                          top: `${draftBox.y * 100}%`,
                          width: `${draftBox.width * 100}%`,
                          height: `${draftBox.height * 100}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
                <div className="canvas-toolbar">
                  <button
                    type="button"
                    className={`manual-button${manualMode ? " active" : ""}`}
                    onClick={() => setManualMode((current) => !current)}
                  >
                    {manualMode ? <X size={17} /> : <Plus size={17} />}
                    {manualMode
                      ? "Cancel drawing"
                      : "Add manual redaction"}
                  </button>
                  <span>
                    {manualMode
                      ? "Drag over anything else you want removed · Esc to cancel"
                      : "Solid replacement only — never blur or pixelation"}
                  </span>
                </div>
              </>
            ) : (
              <TextPreview text={document.text} findings={findings} />
            )}
          </section>

          <aside className="findings-panel">
            <div className="findings-heading">
              <div>
                <span className="section-kicker">Possible leaks</span>
                <h2>
                  {findings.length
                    ? `${findings.length} finding${findings.length === 1 ? "" : "s"}`
                    : "No findings"}
                </h2>
              </div>
              <span className="selected-count">
                {selectedFindings.length} selected
              </span>
            </div>

            {document.kind === "image" && !document.synthetic && (
              <div className="scanner-strip" aria-label="Scanner status">
                <span className={scanSummary.ocr}>Text</span>
                <span className={scanSummary.barcode}>QR</span>
                <span className={scanSummary.metadata}>Metadata</span>
              </div>
            )}

            {activeProtectedTermCount > 0 && (
              <div className="privacy-lens-status">
                <Fingerprint size={14} />
                <span>
                  {activeProtectedTermCount} session-only configured line
                  {activeProtectedTermCount === 1 ? "" : "s"} active
                </span>
              </div>
            )}

            <p className="findings-instruction">
              Select what to remove. Masked previews help you review without
              repeating complete values. Hidden metadata is always removed by
              fresh image encoding.
            </p>

            <div className="finding-list">
              {findings.length === 0 && (
                <div className="no-findings">
                  <Eye size={22} />
                  <strong>No findings from the supported checks.</strong>
                  <span>
                    This is not a guarantee. You can still add a manual
                    redaction.
                  </span>
                </div>
              )}
              {findings.map((finding, index) => (
                <div
                  key={finding.id}
                  className={`finding-row${activeFindingId === finding.id ? " active" : ""}`}
                  onMouseEnter={() => setActiveFindingId(finding.id)}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={finding.selected}
                      disabled={finding.required}
                      onChange={() => toggleFinding(finding.id)}
                    />
                    <span className="custom-check">
                      <Check size={12} />
                    </span>
                    <span className="finding-number">{index + 1}</span>
                    <span className={`finding-icon ${finding.kind}`}>
                      {findingIcon(finding.kind)}
                    </span>
                    <span className="finding-content">
                      <span className="finding-title">{finding.title}</span>
                      <code>{finding.preview}</code>
                      <span className="finding-evidence">{finding.evidence}</span>
                      {finding.required && (
                        <span className="finding-required">Always removed</span>
                      )}
                    </span>
                  </label>
                  {finding.kind === "manual" && (
                    <button
                      className="remove-finding"
                      type="button"
                      onClick={() =>
                        setFindings((current) =>
                          current.filter((item) => item.id !== finding.id),
                        )
                      }
                      aria-label="Remove manual redaction"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {document.kind === "text" && (
              <fieldset className="replacement-mode">
                <legend>Replacement style</legend>
                <label>
                  <input
                    type="radio"
                    name="replacement-mode"
                    value="opaque"
                    checked={replacementMode === "opaque"}
                    onChange={() => setReplacementMode("opaque")}
                  />
                  <span>
                    <strong>Opaque</strong>
                    <small>[REDACTED]</small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="replacement-mode"
                    value="aliases"
                    checked={replacementMode === "aliases"}
                    onChange={() => setReplacementMode("aliases")}
                  />
                  <span>
                    <strong>Readable aliases</strong>
                    <small>[EMAIL_1], [TOKEN_1]…</small>
                  </span>
                </label>
              </fieldset>
            )}

            <div className="review-caution">
              <CircleAlert size={16} />
              <span>Review the whole artifact; automatic detection can miss.</span>
            </div>

            <div className="review-action">
              <div>
                <span>Planned removals</span>
                <strong>{selectedFindings.length}</strong>
              </div>
              <button
                className="primary-button create-button"
                type="button"
                onClick={sanitize}
                disabled={
                  !selectedFindings.length &&
                  !(document.kind === "image" && findings.length === 0)
                }
              >
                Create checked copy
                <ChevronRight size={18} />
              </button>
            </div>
          </aside>
        </main>
      )}

      {toolMode === "preflight" && stage === "result" && result && document && (
        <main className="result-page">
          <section className="result-artifact">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">Exported artifact</span>
                <h2>{viewOriginal ? "Original" : "Checked copy"}</h2>
              </div>
              {renderingResultImage && (
                <div className="view-toggle" role="group" aria-label="Image view">
                  <button
                    type="button"
                    className={viewOriginal ? "active" : ""}
                    onClick={() => setViewOriginal(true)}
                  >
                    Before
                  </button>
                  <button
                    type="button"
                    className={!viewOriginal ? "active" : ""}
                    onClick={() => setViewOriginal(false)}
                  >
                    Checked copy
                  </button>
                </div>
              )}
            </div>

            {renderingResultImage ? (
              <div className="result-image">
                <img
                  src={viewOriginal ? document.url : result.url}
                  alt={viewOriginal ? "Original artifact" : "Checked copy"}
                />
                <span className={viewOriginal ? "before-badge" : "output-badge"}>
                  {viewOriginal ? (
                    <>
                      <Eye size={14} /> Original
                    </>
                  ) : (
                    <>
                      <BadgeCheck size={14} /> Newly encoded PNG
                    </>
                  )}
                </span>
              </div>
            ) : result.kind === "text" ? (
              <pre className="text-preview result-text">{result.text}</pre>
            ) : null}
          </section>

          <aside className={`receipt-panel${result.passed ? " passed" : " failed"}`}>
            <div className="result-status-icon">
              {completedSyntheticDemo ? (
                <Sparkles size={27} />
              ) : result.passed ? (
                <BadgeCheck size={27} />
              ) : (
                <ShieldAlert size={27} />
              )}
            </div>
            <span className="section-kicker">
              {completedSyntheticDemo
                ? "Synthetic walkthrough"
                : result.passed
                  ? "Completed checks"
                  : "Verification stopped"}
            </span>
            <h2>
              {completedSyntheticDemo
                ? "Demo checks completed"
                : result.passed
                  ? "Export checks passed"
                  : "The checked copy needs attention"}
            </h2>
            <p className="result-subtitle">
              {completedSyntheticDemo
                ? "This preloaded sample demonstrates the workflow. OCR and QR checks were not run."
                : result.passed
                  ? "The newly created artifact passed the specific checks listed below."
                  : "At least one required check failed. Copy and save actions stay disabled."}
            </p>

            <div className="check-list">
              {result.kind === "image" ? (
                result.receipt.verification.checks.map((check) => (
                  <div className={`check-row ${check.status}`} key={check.id}>
                    <span className="check-status">
                      {check.status === "passed" ? (
                        <Check size={14} />
                      ) : check.status === "failed" ? (
                        <X size={14} />
                      ) : (
                        <Eye size={14} />
                      )}
                    </span>
                    <span>
                      <strong>{check.label}</strong>
                      <small>{check.detail}</small>
                    </span>
                  </div>
                ))
              ) : (
                <>
                  <div className="check-row passed">
                    <span className="check-status">
                      <Check size={14} />
                    </span>
                    <span>
                      <strong>
                        {selectedFindings.length} approved text span
                        {selectedFindings.length === 1 ? "" : "s"} replaced with{" "}
                        {replacementMode === "aliases"
                          ? aliasFallbackUsed
                            ? "typed aliases with a safe opaque fallback"
                            : "typed aliases"
                          : "opaque markers"}
                      </strong>
                      <small>
                        Stable, non-sensitive markers were written into a new
                        artifact.
                      </small>
                    </span>
                  </div>
                  <div className={`check-row ${result.passed ? "passed" : "failed"}`}>
                    <span className="check-status">
                      {result.passed ? <Check size={14} /> : <X size={14} />}
                    </span>
                    <span>
                      <strong>Sanitized text re-scanned</strong>
                      <small>
                        {result.passed
                          ? result.retainedObservedCount
                            ? `Approved findings were absent; ${result.retainedObservedCount} explicitly retained supported finding${result.retainedObservedCount === 1 ? "" : "s"} remain.`
                            : "No approved or unknown finding was returned by supported deterministic rules."
                          : result.unknownObservedCount
                            ? `${result.unknownObservedCount} new or unreviewed supported finding${result.unknownObservedCount === 1 ? "" : "s"} appeared in the output.`
                            : "An approved deterministic finding remains."}
                      </small>
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="hash-block">
              <span>Output fingerprint</span>
              <code>
                {result.kind === "image"
                  ? `${result.receipt.output.sha256.slice(0, 16)}…`
                  : (() => {
                      const receipt = result.receipt as {
                        output?: { sha256?: string };
                      };
                      return `${receipt.output?.sha256?.slice(0, 16) ?? "unavailable"}…`;
                    })()}
              </code>
            </div>

            {notice && (
              <div className="inline-notice result-notice" role="status">
                <CircleAlert size={16} />
                {notice}
              </div>
            )}

            <div className="result-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => void copyOutput()}
                disabled={!result.passed}
              >
                <Copy size={17} />
                Copy {result.kind === "image" ? "image" : "text"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={saveOutput}
                disabled={!result.passed}
              >
                <Download size={17} />
                Save {result.kind === "image" ? "PNG" : "text"}
              </button>
              {nativeShareAvailable && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void shareOutput()}
                  disabled={!result.passed}
                >
                  <Share2 size={17} />
                  Share checked copy
                </button>
              )}
            </div>
            <button className="receipt-button" type="button" onClick={saveReceipt}>
              <FileJson size={16} />
              Download diagnostic receipt
            </button>

            <div className="result-caution">
              <ShieldAlert size={17} />
              <span>
                This is not a guarantee that the artifact contains no sensitive
                information. The unsigned receipt is editable; review the artifact
                before sharing.
              </span>
            </div>

            <button className="check-another" type="button" onClick={reset}>
              <RotateCcw size={16} />
              Check another artifact
            </button>
          </aside>
        </main>
      )}

      {toolMode === "preflight" && stage === "error" && (
        <main className="error-page" role="alert">
          <div className="error-icon">
            <CircleAlert size={28} />
          </div>
          <span className="section-kicker">Check interrupted</span>
          <h2>We couldn’t finish this preflight.</h2>
          <p>{errorMessage || "An unsupported error occurred."}</p>
          <p className="error-reassurance">Your original was not changed.</p>
          <button className="primary-button" type="button" onClick={reset}>
            Try another artifact
          </button>
        </main>
      )}

      {toolMode === "preflight" && (
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFileInput}
        />
      )}
    </div>
  );
}

export default App;
