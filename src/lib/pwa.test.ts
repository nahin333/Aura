import { describe, expect, it, vi } from "vitest";
import {
  createInstallPromptController,
  isStandaloneDisplay,
  resolvePwaUrls,
} from "./pwa";

class FakeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;

  promptCalls = 0;
  shouldFail = false;

  constructor(outcome: "accepted" | "dismissed" = "accepted") {
    super("beforeinstallprompt", { cancelable: true });
    this.userChoice = Promise.resolve({ outcome, platform: "web" });
  }

  async prompt() {
    this.promptCalls += 1;
    if (this.shouldFail) {
      throw new Error("prompt failed");
    }
  }
}

function fakeWindow(options: {
  displayStandalone?: boolean;
  navigatorStandalone?: boolean;
} = {}): Window {
  const target = new EventTarget();
  Object.defineProperties(target, {
    matchMedia: {
      value: () => ({ matches: options.displayStandalone === true }),
    },
    navigator: {
      value: { standalone: options.navigatorStandalone === true },
    },
  });
  return target as unknown as Window;
}

describe("PWA URL resolution", () => {
  it("keeps the worker and scope within a repository subpath", () => {
    expect(resolvePwaUrls("https://example.test/Aura/index.html")).toEqual({
      scopeUrl: "https://example.test/Aura/",
      serviceWorkerUrl: "https://example.test/Aura/sw.js",
    });
  });
});

describe("standalone detection", () => {
  it("recognizes display-mode and iOS standalone signals", () => {
    expect(isStandaloneDisplay(fakeWindow({ displayStandalone: true }))).toBe(true);
    expect(isStandaloneDisplay(fakeWindow({ navigatorStandalone: true }))).toBe(true);
    expect(isStandaloneDisplay(fakeWindow())).toBe(false);
    expect(isStandaloneDisplay(null)).toBe(false);
  });
});

describe("install prompt controller", () => {
  it("captures a browser install event and consumes it once", async () => {
    const target = fakeWindow();
    const availability = vi.fn();
    const controller = createInstallPromptController(availability, target);
    const event = new FakeInstallPromptEvent("accepted");

    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(controller.available).toBe(true);
    expect(availability).toHaveBeenCalledWith(true);
    await expect(controller.prompt()).resolves.toBe("accepted");
    expect(event.promptCalls).toBe(1);
    expect(controller.available).toBe(false);
    expect(availability).toHaveBeenLastCalledWith(false);
    await expect(controller.prompt()).resolves.toBe("unavailable");
  });

  it("clears a pending prompt when installation completes", () => {
    const target = fakeWindow();
    const availability = vi.fn();
    const controller = createInstallPromptController(availability, target);
    target.dispatchEvent(new FakeInstallPromptEvent());

    target.dispatchEvent(new Event("appinstalled"));

    expect(controller.available).toBe(false);
    expect(availability).toHaveBeenLastCalledWith(false);
  });

  it("does not capture prompts when already running standalone", () => {
    const target = fakeWindow({ displayStandalone: true });
    const availability = vi.fn();
    const controller = createInstallPromptController(availability, target);
    const event = new FakeInstallPromptEvent();

    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(controller.available).toBe(false);
    expect(availability).not.toHaveBeenCalled();
  });

  it("reports browser prompt failures without retaining the event", async () => {
    const target = fakeWindow();
    const controller = createInstallPromptController(() => undefined, target);
    const event = new FakeInstallPromptEvent();
    event.shouldFail = true;
    target.dispatchEvent(event);

    await expect(controller.prompt()).resolves.toBe("error");
    expect(controller.available).toBe(false);
  });

  it("removes listeners when disposed", () => {
    const target = fakeWindow();
    const availability = vi.fn();
    const controller = createInstallPromptController(availability, target);

    controller.dispose();
    target.dispatchEvent(new FakeInstallPromptEvent());

    expect(controller.available).toBe(false);
    expect(availability).not.toHaveBeenCalled();
  });
});
