export type InstallPromptOutcome =
  | "accepted"
  | "dismissed"
  | "unavailable"
  | "error";

interface BeforeInstallPromptChoice {
  outcome: "accepted" | "dismissed";
  platform: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<BeforeInstallPromptChoice>;
}

export interface InstallPromptController {
  readonly available: boolean;
  prompt(): Promise<InstallPromptOutcome>;
  dispose(): void;
}

export interface PwaUrls {
  scopeUrl: string;
  serviceWorkerUrl: string;
}

function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  const candidate = event as Partial<BeforeInstallPromptEvent>;
  return typeof candidate.prompt === "function"
    && typeof candidate.userChoice?.then === "function";
}

export function resolvePwaUrls(baseUri: string): PwaUrls {
  const scopeUrl = new URL("./", baseUri).href;
  return {
    scopeUrl,
    serviceWorkerUrl: new URL("sw.js", scopeUrl).href,
  };
}

export function isStandaloneDisplay(
  target: Window | null = typeof window === "undefined" ? null : window,
): boolean {
  if (!target) {
    return false;
  }

  const displayModeMatches = typeof target.matchMedia === "function"
    && target.matchMedia("(display-mode: standalone)").matches;
  const navigatorWithStandalone = target.navigator as Navigator & {
    standalone?: boolean;
  };
  return displayModeMatches || navigatorWithStandalone?.standalone === true;
}

export function createInstallPromptController(
  onAvailabilityChange: (available: boolean) => void,
  target: Window | null = typeof window === "undefined" ? null : window,
): InstallPromptController {
  let pendingPrompt: BeforeInstallPromptEvent | null = null;
  let disposed = false;

  const notifyIfChanged = (nextPrompt: BeforeInstallPromptEvent | null) => {
    const wasAvailable = pendingPrompt !== null;
    pendingPrompt = nextPrompt;
    if (wasAvailable !== (pendingPrompt !== null)) {
      onAvailabilityChange(pendingPrompt !== null);
    }
  };

  const handleBeforeInstallPrompt = (event: Event) => {
    if (disposed || !isBeforeInstallPromptEvent(event) || isStandaloneDisplay(target)) {
      return;
    }
    event.preventDefault();
    notifyIfChanged(event);
  };

  const handleInstalled = () => {
    if (!disposed) {
      notifyIfChanged(null);
    }
  };

  if (target && !isStandaloneDisplay(target)) {
    target.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    target.addEventListener("appinstalled", handleInstalled);
  }

  return {
    get available() {
      return !disposed && pendingPrompt !== null;
    },

    async prompt() {
      if (disposed || !pendingPrompt) {
        return "unavailable";
      }

      const promptEvent = pendingPrompt;
      notifyIfChanged(null);
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        return choice.outcome === "accepted" ? "accepted" : "dismissed";
      } catch {
        return "error";
      }
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      pendingPrompt = null;
      target?.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt as EventListener,
      );
      target?.removeEventListener("appinstalled", handleInstalled);
    },
  };
}

export async function registerAuraServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!import.meta.env.PROD
      || typeof window === "undefined"
      || typeof navigator === "undefined"
      || typeof document === "undefined"
      || !window.isSecureContext
      || !("serviceWorker" in navigator)) {
    return null;
  }

  const { scopeUrl, serviceWorkerUrl } = resolvePwaUrls(document.baseURI);
  try {
    return await navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: scopeUrl,
      updateViaCache: "none",
    });
  } catch {
    return null;
  }
}
