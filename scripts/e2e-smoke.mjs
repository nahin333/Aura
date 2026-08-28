import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import process from "node:process";
import { Builder, By, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

const baseUrl = process.env.AURA_BASE_URL ?? "http://127.0.0.1:5173";
const geckoDriver =
  process.env.GECKODRIVER_PATH ?? "/snap/bin/geckodriver";
const firefoxBinary =
  process.env.FIREFOX_PATH ??
  "/snap/firefox/current/usr/lib/firefox/firefox";
const artifactDir = process.env.AURA_ARTIFACT_DIR ?? "artifacts";

const options = new firefox.Options()
  .addArguments("-headless")
  .setBinary(firefoxBinary);
const service = new firefox.ServiceBuilder(geckoDriver);
const driver = await new Builder()
  .forBrowser("firefox")
  .setFirefoxOptions(options)
  .setFirefoxService(service)
  .build();

async function assertEnabledActions(labels) {
  const buttons = await driver.findElements(By.css(".result-actions button"));
  const observed = await Promise.all(
    buttons.map(async (button) => ({
      label: await button.getText(),
      enabled: await button.isEnabled(),
    })),
  );
  for (const label of labels) {
    const button = observed.find((item) => item.label === label);
    if (!button?.enabled) {
      const checks = await Promise.all(
        (await driver.findElements(By.css(".check-row"))).map(async (row) => ({
          state: await row.getAttribute("class"),
          text: await row.getText(),
        })),
      );
      throw new Error(
        `Expected enabled action "${label}", received ${JSON.stringify(observed)}; checks ${JSON.stringify(checks)}.`,
      );
    }
  }
  const allowed = new Set([...labels, "Share checked copy"]);
  const unexpected = observed.filter((item) => !allowed.has(item.label));
  if (unexpected.length) {
    throw new Error(`Unexpected result actions: ${JSON.stringify(observed)}.`);
  }
  const share = observed.find((item) => item.label === "Share checked copy");
  if (share && !share.enabled) {
    throw new Error("The optional native share action was unexpectedly disabled.");
  }
}

function assertNoForbiddenReceiptData(receipt, rawValues) {
  const forbiddenKeys = new Set([
    "preview",
    "valueHash",
    "box",
    "evidence",
    "start",
    "end",
    "maskedPreview",
  ]);
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) {
        throw new Error(`Diagnostic receipt contained forbidden key "${key}".`);
      }
      visit(child);
    }
  };
  visit(receipt);
  const serialized = JSON.stringify(receipt);
  for (const rawValue of rawValues) {
    if (serialized.includes(rawValue)) {
      throw new Error("Diagnostic receipt contained a raw fixture value.");
    }
  }
}

async function captureReceiptText() {
  await driver.executeScript(
    "window.__auraCapturedReceipt = null;" +
      "window.__auraCapturedCreateObjectURL = URL.createObjectURL.bind(URL);" +
      "window.__auraCapturedAnchorClick = HTMLAnchorElement.prototype.click;" +
      "URL.createObjectURL = function(blob) {" +
      "if (blob && blob.type === 'application/json') {" +
      "blob.text().then((value) => { window.__auraCapturedReceipt = value; });" +
      "return 'blob:aura-captured-receipt';" +
      "}" +
      "return window.__auraCapturedCreateObjectURL(blob);" +
      "};" +
      "HTMLAnchorElement.prototype.click = function() {" +
      "if (this.download && this.download.endsWith('.json')) return;" +
      "return window.__auraCapturedAnchorClick.call(this);" +
      "};",
  );
  await driver
    .findElement(
      By.xpath("//button[contains(normalize-space(.), 'Download diagnostic receipt')]"),
    )
    .click();
  await driver.wait(
    async () =>
      Boolean(
        await driver.executeScript("return window.__auraCapturedReceipt;"),
      ),
    5_000,
  );
  const receiptText = await driver.executeScript(
    "return window.__auraCapturedReceipt;",
  );
  await driver.executeScript(
    "URL.createObjectURL = window.__auraCapturedCreateObjectURL;" +
      "HTMLAnchorElement.prototype.click = window.__auraCapturedAnchorClick;",
  );
  return String(receiptText);
}

try {
  await driver
    .manage()
    .setTimeouts({ implicit: 0, pageLoad: 20_000, script: 15_000 });
  await driver.manage().window().setRect({ width: 1440, height: 900 });
  await driver.get(baseUrl);
  await driver.executeScript(
    "window.__auraCspViolations = [];" +
      "document.addEventListener('securitypolicyviolation', (event) => {" +
      "window.__auraCspViolations.push({" +
      "directive: event.violatedDirective, blocked: event.blockedURI" +
      "});" +
      "});",
  );

  const sampleButton = await driver.wait(
    until.elementLocated(
      By.xpath("//button[contains(normalize-space(.), 'Try the sample')]"),
    ),
    10_000,
  );
  await sampleButton.click();
  await driver.wait(until.elementLocated(By.css(".findings-panel")), 10_000);

  const rows = await driver.findElements(By.css(".finding-row"));
  if (rows.length !== 4) {
    throw new Error(`Expected 4 sample findings, received ${rows.length}.`);
  }
  const selected = await driver.findElements(
    By.css(".finding-row input[type='checkbox']:checked"),
  );
  if (selected.length !== 4) {
    throw new Error(`Expected 4 selected findings, received ${selected.length}.`);
  }

  await mkdir(artifactDir, { recursive: true });
  const ocrSource = await driver.executeAsyncScript(
    "const done = arguments[arguments.length - 1];" +
      "const canvas = document.createElement('canvas');" +
      "canvas.width = 1400; canvas.height = 320;" +
      "const context = canvas.getContext('2d');" +
      "context.fillStyle = '#ffffff'; context.fillRect(0, 0, 1400, 320);" +
      "context.fillStyle = '#151816'; context.font = '700 54px monospace';" +
      "context.fillText('alice@example.com', 90, 180);" +
      "canvas.toBlob((blob) => {" +
      "if (!blob) { done(null); return; }" +
      "const reader = new FileReader();" +
      "reader.onload = () => done(String(reader.result).split(',')[1]);" +
      "reader.onerror = () => done(null);" +
      "reader.readAsDataURL(blob);" +
      "}, 'image/png');",
  );
  if (typeof ocrSource !== "string") {
    throw new Error("Could not create the local OCR fixture.");
  }
  await writeFile(
    `${artifactDir}/ocr-source.png`,
    ocrSource,
    "base64",
  );
  const blankSource = await driver.executeAsyncScript(
    "const done = arguments[arguments.length - 1];" +
      "const canvas = document.createElement('canvas');" +
      "canvas.width = 900; canvas.height = 540;" +
      "const context = canvas.getContext('2d');" +
      "context.fillStyle = '#ffffff'; context.fillRect(0, 0, 900, 540);" +
      "canvas.toBlob((blob) => {" +
      "if (!blob) { done(null); return; }" +
      "const reader = new FileReader();" +
      "reader.onload = () => done(String(reader.result).split(',')[1]);" +
      "reader.onerror = () => done(null);" +
      "reader.readAsDataURL(blob);" +
      "}, 'image/png');",
  );
  if (typeof blankSource !== "string") {
    throw new Error("Could not create the blank image fixture.");
  }
  await writeFile(`${artifactDir}/blank-source.png`, blankSource, "base64");

  await driver.findElement(By.css(".manual-button")).click();
  const imageStage = await driver.findElement(By.css(".image-stage"));
  await driver.executeAsyncScript(
    "const stage = arguments[0];" +
      "const done = arguments[arguments.length - 1];" +
      "const bounds = stage.getBoundingClientRect();" +
      "const start = { x: bounds.left + bounds.width * 0.16, y: bounds.top + bounds.height * 0.16 };" +
      "const finish = { x: start.x + Math.min(140, bounds.width * 0.18), y: start.y + Math.min(90, bounds.height * 0.18) };" +
      "stage.setPointerCapture = () => {};" +
      "stage.releasePointerCapture = () => {};" +
      "const fire = (type, point, buttons) => stage.dispatchEvent(new PointerEvent(type, {" +
      "bubbles: true, pointerId: 7, pointerType: 'mouse', isPrimary: true," +
      "clientX: point.x, clientY: point.y, buttons" +
      "}));" +
      "fire('pointerdown', start, 1);" +
      "setTimeout(() => {" +
      "fire('pointermove', finish, 1);" +
      "setTimeout(() => { fire('pointerup', finish, 0); done(); }, 40);" +
      "}, 40);",
    imageStage,
  );
  await driver.wait(until.elementLocated(By.css(".finding-box.manual")), 5_000);
  const manualRows = await driver.findElements(By.css(".finding-row"));
  if (manualRows.length !== 5) {
    throw new Error(`Expected manual redaction to create a fifth row; received ${manualRows.length}.`);
  }
  const manualSelected = await driver.findElements(
    By.css(".finding-row input[type='checkbox']:checked"),
  );
  if (manualSelected.length !== 5) {
    throw new Error(`Expected all 5 demo findings selected; received ${manualSelected.length}.`);
  }
  await writeFile(
    `${artifactDir}/sample-review.png`,
    await driver.takeScreenshot(),
    "base64",
  );

  await driver.findElement(By.css(".create-button")).click();
  await driver.wait(until.elementLocated(By.css(".receipt-panel")), 15_000);
  const heading = await driver.findElement(By.css(".receipt-panel h2")).getText();
  if (heading !== "Demo checks completed") {
    throw new Error(`Unexpected result heading: ${heading}`);
  }

  await assertEnabledActions(["Copy image", "Save PNG"]);

  const failedChecks = await driver.findElements(By.css(".check-row.failed"));
  if (failedChecks.length !== 0) {
    throw new Error(`Expected zero failed checks, received ${failedChecks.length}.`);
  }
  const passedChecks = await driver.findElements(By.css(".check-row.passed"));
  if (passedChecks.length !== 4) {
    throw new Error(`Expected 4 demo checks to pass, received ${passedChecks.length}.`);
  }
  const notRunChecks = await driver.findElements(By.css(".check-row.not-run"));
  if (notRunChecks.length !== 2) {
    throw new Error(`Expected 2 demo checks to be marked not-run, received ${notRunChecks.length}.`);
  }
  const pixelCheck = await driver
    .findElement(By.xpath("//div[contains(@class,'check-row')][.//strong[contains(.,'Selected visual regions flattened')]]"))
    .getText();
  if (!pixelCheck.includes("4 selected regions")) {
    throw new Error(`Manual region was not included in pixel verification: ${pixelCheck}`);
  }

  await writeFile(
    `${artifactDir}/sample-result.png`,
    await driver.takeScreenshot(),
    "base64",
  );

  await driver.executeScript(
    "window.__auraReceiptText = null;" +
      "window.__auraCreateObjectURL = URL.createObjectURL.bind(URL);" +
      "window.__auraAnchorClick = HTMLAnchorElement.prototype.click;" +
      "URL.createObjectURL = function(blob) {" +
      "if (blob && blob.type === 'application/json') {" +
      "blob.text().then((value) => { window.__auraReceiptText = value; });" +
      "return 'blob:aura-diagnostic-receipt';" +
      "}" +
      "return window.__auraCreateObjectURL(blob);" +
      "};" +
      "HTMLAnchorElement.prototype.click = function() {" +
      "if (this.download && this.download.endsWith('.json')) return;" +
      "return window.__auraAnchorClick.call(this);" +
      "};",
  );
  await driver
    .findElement(
      By.xpath("//button[contains(normalize-space(.), 'Download diagnostic receipt')]"),
    )
    .click();
  await driver.wait(
    async () =>
      Boolean(await driver.executeScript("return window.__auraReceiptText;")),
    5_000,
  );
  const receiptText = await driver.executeScript(
    "return window.__auraReceiptText;",
  );
  await driver.executeScript(
    "URL.createObjectURL = window.__auraCreateObjectURL;" +
      "HTMLAnchorElement.prototype.click = window.__auraAnchorClick;",
  );
  const demoReceipt = JSON.parse(String(receiptText));
  if (
    demoReceipt.mode !== "synthetic-demo" ||
    demoReceipt.verification?.status !== "demo" ||
    demoReceipt.redaction?.manualRegionCount !== 1
  ) {
    throw new Error(`Unexpected demo receipt: ${JSON.stringify(demoReceipt)}`);
  }
  if ("sha256" in demoReceipt.source) {
    throw new Error("The diagnostic receipt exposed a source fingerprint.");
  }
  if (!/^[a-f0-9]{64}$/.test(demoReceipt.output?.sha256 ?? "")) {
    throw new Error("The diagnostic receipt lacked a canonical output fingerprint.");
  }
  assertNoForbiddenReceiptData(demoReceipt, [
    "maya.chen@example.test",
    "aura_demo_DEMO_NOT_VALID_7Q4F",
    "https://example.test/reset?token=DEMO-NOT-VALID-8842",
    "37.7749,-122.4194",
  ]);

  await driver.findElement(By.css(".check-another")).click();
  const textArea = await driver.wait(
    until.elementLocated(By.css("#text-input")),
    10_000,
  );
  const syntheticText = [
    "Email alice@example.com",
    "Phone +1 (415) 555-2671",
    "Card 4111 1111 1111 1111",
    `GitHub ghp_${"a".repeat(36)}`,
  ].join("\n");
  await textArea.sendKeys(syntheticText);
  await driver.findElement(By.css(".text-check-button")).click();
  await driver.wait(until.elementLocated(By.css(".findings-panel")), 10_000);
  const textRows = await driver.findElements(By.css(".finding-row"));
  if (textRows.length !== 4) {
    throw new Error(`Expected 4 pasted-text findings, received ${textRows.length}.`);
  }
  await driver.findElement(By.css(".create-button")).click();
  await driver.wait(until.elementLocated(By.css(".receipt-panel")), 10_000);
  const textHeading = await driver
    .findElement(By.css(".receipt-panel h2"))
    .getText();
  if (textHeading !== "Export checks passed") {
    throw new Error(`Unexpected text result heading: ${textHeading}`);
  }
  await assertEnabledActions(["Copy text", "Save text"]);
  const textPassedChecks = await driver.findElements(By.css(".check-row.passed"));
  if (textPassedChecks.length !== 2) {
    throw new Error(`Expected 2 pasted-text checks to pass, received ${textPassedChecks.length}.`);
  }
  const sanitizedText = await driver
    .findElement(By.css(".result-text"))
    .getText();
  for (const rawValue of [
    "alice@example.com",
    "+1 (415) 555-2671",
    "4111 1111 1111 1111",
    `ghp_${"a".repeat(36)}`,
  ]) {
    if (sanitizedText.includes(rawValue)) {
      throw new Error("A selected raw value remained in sanitized text.");
    }
  }

  await driver.findElement(By.css(".check-another")).click();
  await driver.wait(
    until.elementLocated(By.css(".protected-terms summary")),
    10_000,
  );
  await driver.findElement(By.css(".protected-terms summary")).click();
  const protectedTermInput = await driver.findElement(
    By.css("#protected-terms"),
  );
  await protectedTermInput.sendKeys("Project Cinder");
  const protectedText =
    "Project Cinder meets alice@example.com. PROJECT CINDER stays private.";
  await driver.findElement(By.css("#text-input")).sendKeys(protectedText);
  await driver.findElement(By.css(".text-check-button")).click();
  await driver.wait(until.elementLocated(By.css(".findings-panel")), 10_000);
  const protectedRows = await driver.findElements(By.css(".finding-row"));
  if (protectedRows.length !== 3) {
    throw new Error(
      `Expected 3 personal-lens findings, received ${protectedRows.length}.`,
    );
  }
  const protectedTitles = await Promise.all(
    protectedRows.map((row) =>
      row.findElement(By.css(".finding-title")).getText(),
    ),
  );
  if (
    protectedTitles.filter((title) => title === "Protected term").length !== 2 ||
    !protectedTitles.includes("Email address")
  ) {
    throw new Error(
      `Unexpected personal-lens findings: ${JSON.stringify(protectedTitles)}.`,
    );
  }
  const protectedRowsWithTitles = await Promise.all(
    protectedRows.map(async (row) => ({
      title: await row.findElement(By.css(".finding-title")).getText(),
      enabled: await row.findElement(By.css("input[type='checkbox']")).isEnabled(),
    })),
  );
  if (
    protectedRowsWithTitles.some(
      ({ title, enabled }) => title === "Protected term" && enabled,
    ) ||
    protectedRowsWithTitles.some(
      ({ title, enabled }) => title === "Email address" && !enabled,
    )
  ) {
    throw new Error(
      `Always-hide controls were not enforced: ${JSON.stringify(protectedRowsWithTitles)}.`,
    );
  }
  const privacyLensStatus = await driver
    .findElement(By.css(".privacy-lens-status"))
    .getText();
  if (!privacyLensStatus.includes("1 session-only configured line")) {
    throw new Error(`Unexpected privacy lens status: ${privacyLensStatus}`);
  }
  await driver.findElement(
    By.css(".replacement-mode input[value='aliases']"),
  ).click();
  await driver.findElement(By.css(".create-button")).click();
  await driver.wait(until.elementLocated(By.css(".receipt-panel")), 10_000);
  const protectedHeading = await driver
    .findElement(By.css(".receipt-panel h2"))
    .getText();
  if (protectedHeading !== "Export checks passed") {
    throw new Error(`Unexpected personal-lens result: ${protectedHeading}`);
  }
  const protectedOutput = await driver
    .findElement(By.css(".result-text"))
    .getText();
  const expectedProtectedOutput =
    "[PROTECTED_1] meets [EMAIL_1]. [PROTECTED_1] stays private.";
  if (protectedOutput !== expectedProtectedOutput) {
    throw new Error(
      `Readable aliases were not stable: ${JSON.stringify(protectedOutput)}.`,
    );
  }
  await assertEnabledActions(["Copy text", "Save text"]);

  const protectedReceiptText = await captureReceiptText();
  const protectedReceipt = JSON.parse(protectedReceiptText);
  if (
    protectedReceipt.verification?.status !== "pass" ||
    protectedReceipt.redaction?.byCategory?.custom_sensitive !== 2
  ) {
    throw new Error(
      `Unexpected protected-term receipt: ${JSON.stringify(protectedReceipt)}`,
    );
  }
  assertNoForbiddenReceiptData(protectedReceipt, [
    "Project Cinder",
    "PROJECT CINDER",
  ]);
  for (const rawValue of ["Project Cinder", "PROJECT CINDER"]) {
    const rawHash = createHash("sha256").update(rawValue).digest("hex");
    if (protectedReceiptText.includes(rawHash)) {
      throw new Error("A personal protected-term hash leaked into the receipt.");
    }
  }
  await writeFile(
    `${artifactDir}/receipt-match-checked.txt`,
    protectedOutput,
    "utf8",
  );
  await writeFile(
    `${artifactDir}/receipt-match-receipt.json`,
    protectedReceiptText,
    "utf8",
  );

  await driver.findElement(By.css(".check-another")).click();
  await driver
    .findElement(
      By.xpath("//button[contains(normalize-space(.), 'Match a receipt')]"),
    )
    .click();
  await driver.wait(
    until.elementLocated(By.css(".receipt-matcher")),
    10_000,
  );
  await driver.executeScript(
    "const event = new Event('paste', { bubbles: true, cancelable: true });" +
      "Object.defineProperty(event, 'clipboardData', { value: {" +
      "files: [], getData: () => 'alice@example.com'" +
      "} });" +
      "window.dispatchEvent(event);",
  );
  await driver.sleep(100);
  const visibleMains = await driver.findElements(By.css("main"));
  if (
    visibleMains.length !== 1 ||
    !(await visibleMains[0].getAttribute("class")).includes("receipt-matcher")
  ) {
    throw new Error("Pasting escaped the isolated receipt-matcher mode.");
  }
  const matcherInputs = await driver.findElements(
    By.css(".receipt-matcher__input"),
  );
  if (matcherInputs.length !== 2) {
    throw new Error(
      `Expected two receipt matcher inputs, received ${matcherInputs.length}.`,
    );
  }
  await matcherInputs[0].sendKeys(
    resolve(artifactDir, "receipt-match-checked.txt"),
  );
  await matcherInputs[1].sendKeys(
    resolve(artifactDir, "receipt-match-receipt.json"),
  );
  await driver.findElement(By.css(".receipt-matcher__submit")).click();
  await driver.wait(
    until.elementLocated(By.css(".receipt-matcher__result--match")),
    10_000,
  );
  const matchHeading = await driver
    .findElement(By.css(".receipt-matcher__result h2"))
    .getText();
  if (matchHeading !== "Artifact matches receipt") {
    throw new Error(`Unexpected receipt match result: ${matchHeading}`);
  }
  await driver.findElement(By.css(".receipt-matcher__back")).click();
  await driver.wait(until.elementLocated(By.css("#text-input")), 10_000);

  const selectiveTextArea = await driver.wait(
    until.elementLocated(By.css("#text-input")),
    10_000,
  );
  await selectiveTextArea.sendKeys(
    "Keep alice@example.com but remove 4111 1111 1111 1111",
  );
  await driver.findElement(By.css(".text-check-button")).click();
  await driver.wait(until.elementLocated(By.css(".findings-panel")), 10_000);
  const selectiveRows = await driver.findElements(By.css(".finding-row"));
  if (selectiveRows.length !== 2) {
    throw new Error(
      `Expected 2 selective findings, received ${selectiveRows.length}.`,
    );
  }
  const emailRow = await driver.findElement(
    By.xpath("//div[contains(@class,'finding-row')][.//span[contains(@class,'finding-title') and normalize-space(.)='Email address']]"),
  );
  await emailRow.findElement(By.css("input")).click();
  await driver.findElement(By.css(".create-button")).click();
  await driver.wait(until.elementLocated(By.css(".receipt-panel")), 10_000);
  const selectiveHeading = await driver
    .findElement(By.css(".receipt-panel h2"))
    .getText();
  if (selectiveHeading !== "Export checks passed") {
    throw new Error(`Unexpected selective result: ${selectiveHeading}`);
  }
  const selectiveOutput = await driver
    .findElement(By.css(".result-text"))
    .getText();
  if (selectiveOutput !== "Keep alice@example.com but remove [REDACTED]") {
    throw new Error(`Unexpected selective output: ${selectiveOutput}`);
  }
  const selectiveChecks = await driver
    .findElement(By.css(".check-list"))
    .getText();
  if (!selectiveChecks.includes("explicitly retained")) {
    throw new Error("The retained supported finding was not disclosed.");
  }
  await assertEnabledActions(["Copy text", "Save text"]);

  await driver.findElement(By.css(".check-another")).click();
  const blankFileInput = await driver.wait(
    until.elementLocated(By.css("input.visually-hidden[type='file']")),
    10_000,
  );
  await blankFileInput.sendKeys(resolve(artifactDir, "blank-source.png"));
  await driver.wait(until.elementLocated(By.css(".findings-panel")), 120_000);
  const blankFindings = await driver.findElements(By.css(".finding-row"));
  if (blankFindings.length !== 0) {
    const blankTitles = await Promise.all(
      blankFindings.map((row) =>
        row.findElement(By.css(".finding-title")).getText(),
      ),
    );
    throw new Error(
      `Expected a zero-finding blank image, received ${JSON.stringify(blankTitles)}.`,
    );
  }
  const blankCreateButton = await driver.findElement(By.css(".create-button"));
  if (!(await blankCreateButton.isEnabled())) {
    throw new Error("Zero-finding image export was unexpectedly disabled.");
  }
  await blankCreateButton.click();
  await driver.wait(until.elementLocated(By.css(".receipt-panel")), 120_000);
  const blankHeading = await driver
    .findElement(By.css(".receipt-panel h2"))
    .getText();
  if (blankHeading !== "Export checks passed") {
    throw new Error(`Unexpected blank-image result: ${blankHeading}`);
  }
  const blankPassedChecks = await driver.findElements(
    By.css(".check-row.passed"),
  );
  if (blankPassedChecks.length !== 6) {
    throw new Error(
      `Expected 6 blank-image checks to pass, received ${blankPassedChecks.length}.`,
    );
  }
  const noVisualCheck = await driver
    .findElement(
      By.xpath(
        "//div[contains(@class,'check-row')][.//strong[contains(.,'No visual redactions required')]]",
      ),
    )
    .getText();
  if (!noVisualCheck.includes("no supported or manual visual regions")) {
    throw new Error(`Unexpected zero-redaction check: ${noVisualCheck}`);
  }
  await assertEnabledActions(["Copy image", "Save PNG"]);
  const blankReceipt = JSON.parse(await captureReceiptText());
  if (
    blankReceipt.redaction?.selectedCount !== 0 ||
    blankReceipt.properties?.includes(
      "selected-redaction-pixels-verified",
    )
  ) {
    throw new Error(
      `Blank-image receipt overstated redaction work: ${JSON.stringify(blankReceipt)}`,
    );
  }

  await driver.findElement(By.css(".check-another")).click();
  const fileInput = await driver.wait(
    until.elementLocated(By.css("input.visually-hidden[type='file']")),
    10_000,
  );
  await fileInput.sendKeys(resolve(artifactDir, "ocr-source.png"));
  await driver.wait(until.elementLocated(By.css(".findings-panel")), 120_000);
  const scannerChecks = await driver.findElements(
    By.css(".scanner-strip span.checked"),
  );
  if (scannerChecks.length !== 3) {
    const scannerStates = await Promise.all(
      await driver.findElements(By.css(".scanner-strip span")),
    ).then((elements) =>
      Promise.all(
        elements.map(async (element) => ({
          label: await element.getText(),
          state: await element.getAttribute("class"),
        })),
      ),
    );
    throw new Error(
      `Expected all 3 real-image scanners to complete: ${JSON.stringify(scannerStates)}`,
    );
  }
  const uploadedFindings = await driver.findElements(By.css(".finding-row"));
  const uploadedTitles = await Promise.all(
    uploadedFindings.map((row) =>
      row.findElement(By.css(".finding-title")).getText(),
    ),
  );
  if (!uploadedTitles.includes("Email address")) {
    throw new Error(
      `Expected an OCR email finding, received ${JSON.stringify(uploadedTitles)}.`,
    );
  }
  await writeFile(
    `${artifactDir}/real-upload-review.png`,
    await driver.takeScreenshot(),
    "base64",
  );
  await driver.findElement(By.css(".create-button")).click();
  await driver.wait(until.elementLocated(By.css(".receipt-panel")), 120_000);
  const realImageHeading = await driver
    .findElement(By.css(".receipt-panel h2"))
    .getText();
  if (realImageHeading !== "Export checks passed") {
    throw new Error(`Unexpected real-image result: ${realImageHeading}`);
  }
  await assertEnabledActions(["Copy image", "Save PNG"]);
  const receiptButton = await driver.findElement(
    By.xpath("//button[contains(normalize-space(.), 'Download diagnostic receipt')]"),
  );
  if (!(await receiptButton.isEnabled())) {
    throw new Error("The diagnostic receipt action was unexpectedly disabled.");
  }
  const realPassedChecks = await driver.findElements(By.css(".check-row.passed"));
  const realFailedChecks = await driver.findElements(By.css(".check-row.failed"));
  const realSkippedChecks = await driver.findElements(By.css(".check-row.not-run"));
  if (
    realPassedChecks.length !== 6 ||
    realFailedChecks.length !== 0 ||
    realSkippedChecks.length !== 0
  ) {
    throw new Error(
      `Expected 6/0/0 real-image checks, received ${realPassedChecks.length}/${realFailedChecks.length}/${realSkippedChecks.length}.`,
    );
  }
  await writeFile(
    `${artifactDir}/real-upload-result.png`,
    await driver.takeScreenshot(),
    "base64",
  );

  const runtimeAudit = await driver.executeScript(
    "return {" +
      "violations: window.__auraCspViolations || []," +
      "resources: performance.getEntriesByType('resource').map((entry) => entry.name)" +
      "};",
  );
  const expectedOrigin = new URL(baseUrl).origin;
  const externalResources = runtimeAudit.resources.filter((resource) => {
    const url = new URL(resource, baseUrl);
    return !["blob:", "data:"].includes(url.protocol) && url.origin !== expectedOrigin;
  });
  if (runtimeAudit.violations.length || externalResources.length) {
    throw new Error(
      `Runtime policy audit failed: ${JSON.stringify({
        violations: runtimeAudit.violations,
        externalResources,
      })}`,
    );
  }

  await driver.manage().setTimeouts({ script: 30_000 });
  const pwaAudit = await driver.executeAsyncScript(`
    const done = arguments[arguments.length - 1];
    (async () => {
      if (!("serviceWorker" in navigator) || !("caches" in window)) {
        throw new Error("This browser does not expose the required PWA APIs.");
      }
      const registration = await navigator.serviceWorker.ready;
      if (!registration.active) {
        throw new Error("The production service worker did not activate.");
      }
      const workerResponse = await fetch(new URL("sw.js", registration.scope), {
        cache: "no-store",
      });
      const workerSource = await workerResponse.text();
      const manifestMatch = workerSource.match(
        /const PRECACHE = (\\[[\\s\\S]*?\\]);\\nconst PRECACHE_REVISIONS/,
      );
      if (!workerResponse.ok || !manifestMatch) {
        throw new Error("The generated worker manifest could not be inspected.");
      }
      const expectedEntries = JSON.parse(manifestMatch[1]).map(({ url }) =>
        new URL(url, registration.scope).href,
      );
      const expectedPrefix =
        "aura-preflight-static:" + registration.scope + ":";
      const scopedCacheNames = (await caches.keys()).filter((name) =>
        name.startsWith(expectedPrefix),
      );
      if (scopedCacheNames.length !== 1) {
        throw new Error("Expected exactly one scope-isolated Aura static cache.");
      }
      const cache = await caches.open(scopedCacheNames[0]);
      const cachedUrls = (await cache.keys()).map((request) => request.url);
      if (
        cachedUrls.length !== expectedEntries.length ||
        expectedEntries.some((url) => !cachedUrls.includes(url)) ||
        cachedUrls.some((url) => !expectedEntries.includes(url))
      ) {
        throw new Error("The installed cache differs from the generated manifest.");
      }
      return {
        scope: registration.scope,
        cacheName: scopedCacheNames[0],
        cachedCount: cachedUrls.length,
      };
    })().then(done, (error) => done({ error: String(error?.message ?? error) }));
  `);
  const expectedScope = new URL("./", baseUrl).href;
  if (pwaAudit.error || pwaAudit.scope !== expectedScope || pwaAudit.cachedCount < 1) {
    throw new Error(`PWA runtime audit failed: ${JSON.stringify(pwaAudit)}.`);
  }

  process.stdout.write(
    "Aura browser smoke tests passed: demo/manual receipt, personal aliases, receipt matching, zero-finding export, selective text, real local image verification, same-origin runtime, and exact PWA static cache.\n",
  );
} finally {
  await driver.quit();
}
