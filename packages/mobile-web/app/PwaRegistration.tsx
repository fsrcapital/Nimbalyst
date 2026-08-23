"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaDiagnostics {
  secureContext: boolean;
  manifest: string;
  serviceWorker: string;
  controlled: boolean;
  installPrompt: boolean;
  standalone: boolean;
}

const initialDiagnostics: PwaDiagnostics = {
  secureContext: false,
  manifest: "checking",
  serviceWorker: "checking",
  controlled: false,
  installPrompt: false,
  standalone: false,
};

export default function PwaRegistration() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent>();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PwaDiagnostics>(initialDiagnostics);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const debug = new URLSearchParams(window.location.search).get("pwa-debug") === "1";
    const initialStateTimer = window.setTimeout(() => {
      setShowDiagnostics(debug);
      setDiagnostics((current) => ({
        ...current,
        secureContext: window.isSecureContext,
        controlled: Boolean(navigator.serviceWorker?.controller),
        standalone,
      }));
    }, 0);
    cleanups.push(() => window.clearTimeout(initialStateTimer));

    void fetch("/manifest.webmanifest", { cache: "no-store" })
      .then(async (response) => {
        const manifest = (await response.json()) as { display?: string; icons?: unknown[] };
        const valid = response.ok && manifest.display === "standalone" && (manifest.icons?.length ?? 0) >= 2;
        setDiagnostics((current) => ({
          ...current,
          manifest: valid ? "ready" : `invalid (${response.status})`,
        }));
      })
      .catch((error: unknown) => {
        setDiagnostics((current) => ({
          ...current,
          manifest: `failed: ${error instanceof Error ? error.message : "unknown error"}`,
        }));
      });

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => {
          const state = registration.active?.state ?? registration.waiting?.state ?? registration.installing?.state;
          setDiagnostics((current) => ({
            ...current,
            serviceWorker: state ?? "registered",
            controlled: Boolean(navigator.serviceWorker.controller),
          }));
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "unknown error";
          console.error("Nimbalyst service worker registration failed", error);
          setDiagnostics((current) => ({ ...current, serviceWorker: `failed: ${message}` }));
        });

      const onControllerChange = () => {
        setDiagnostics((current) => ({ ...current, controlled: Boolean(navigator.serviceWorker.controller) }));
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      cleanups.push(() => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange));
    }

    if (!standalone) {
      const onInstallPrompt = (event: Event) => {
        event.preventDefault();
        setInstallPrompt(event as BeforeInstallPromptEvent);
        setDiagnostics((current) => ({ ...current, installPrompt: true }));
      };
      const onInstalled = () => {
        setInstallPrompt(undefined);
        setDiagnostics((current) => ({ ...current, installPrompt: false, standalone: true }));
      };
      window.addEventListener("beforeinstallprompt", onInstallPrompt);
      window.addEventListener("appinstalled", onInstalled);
      cleanups.push(() => window.removeEventListener("beforeinstallprompt", onInstallPrompt));
      cleanups.push(() => window.removeEventListener("appinstalled", onInstalled));
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return (
    <>
      {installPrompt ? (
        <button
          className="pwa-install-button"
          type="button"
          onClick={() => {
            void installPrompt.prompt().then(() => installPrompt.userChoice).then(() => setInstallPrompt(undefined));
          }}
        >
          Install Nimbalyst
        </button>
      ) : null}
      {showDiagnostics ? (
        <aside className="pwa-diagnostics" aria-label="PWA diagnostics">
          <div className="pwa-diagnostics-heading">
            <strong>PWA Status</strong>
            <button type="button" onClick={() => setShowDiagnostics(false)} aria-label="Close PWA diagnostics">
              Close
            </button>
          </div>
          <dl>
            <div><dt>Secure Context</dt><dd>{diagnostics.secureContext ? "yes" : "no"}</dd></div>
            <div><dt>Manifest</dt><dd>{diagnostics.manifest}</dd></div>
            <div><dt>Service Worker</dt><dd>{diagnostics.serviceWorker}</dd></div>
            <div><dt>Page Controlled</dt><dd>{diagnostics.controlled ? "yes" : "no"}</dd></div>
            <div><dt>Install Prompt</dt><dd>{diagnostics.installPrompt ? "available" : "not offered"}</dd></div>
            <div><dt>Standalone Mode</dt><dd>{diagnostics.standalone ? "yes" : "no"}</dd></div>
          </dl>
          <p>Leave this panel open and send a screenshot. It contains no credentials.</p>
        </aside>
      ) : null}
    </>
  );
}
