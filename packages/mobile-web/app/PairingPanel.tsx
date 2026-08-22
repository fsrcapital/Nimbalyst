"use client";
/* eslint-disable @next/next/no-img-element -- the deployed vinext runtime cannot safely use next/image. */

import { useEffect, useRef, useState } from "react";
import { beginGoogleSignIn } from "../lib/auth";
import { deriveEncryptionKey } from "../lib/crypto";
import { accountFromPayload, parsePairingPayload, type PairingAccount } from "../lib/pairing";
import { saveStoredPairing, type StoredPairing } from "../lib/pairingStore";

type PairingPanelProps = {
  pairing?: StoredPairing;
  onPaired: (pairing: StoredPairing) => void;
  onExploreDemo: () => void;
};

export default function PairingPanel({ pairing, onPaired, onExploreDemo }: PairingPanelProps) {
  const [scanning, setScanning] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  const acceptPayload = async (value: string) => {
    setBusy(true);
    setError("");
    try {
      const payload = parsePairingPayload(value);
      const account = accountFromPayload(payload);
      const encryptionKey = await deriveEncryptionKey(payload.encryptionKeySeed, account.keySalt);
      const stored = { account, encryptionKey };
      await saveStoredPairing(stored);
      setScanning(false);
      onPaired(stored);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pairing failed. Generate a new desktop code and try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let stopped = false;
    let stop: (() => void) | undefined;

    void import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        if (stopped || !videoRef.current) return;
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (!result || stopped) return;
          controls.stop();
          void acceptPayload(result.getText());
        });
        stop = () => controls.stop();
      })
      .catch((caught: unknown) => {
        setScanning(false);
        setError(
          caught instanceof DOMException && caught.name === "NotAllowedError"
            ? "Camera access was declined. You can paste the pairing payload instead."
            : "The camera could not start. You can paste the pairing payload instead.",
        );
      });

    return () => {
      stopped = true;
      stop?.();
    };
  // acceptPayload is intentionally invoked only from the active scanner instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  if (pairing) {
    const account: PairingAccount = pairing.account;
    return (
      <main className="pairing-shell">
        <section className="pairing-card pairing-success-card">
          <div className="pairing-brand">
            <img src="/nimbalyst-icon.png" width={34} height={34} alt="" />
            <span>Nimbalyst</span>
          </div>
          <span className="pairing-kicker">DESKTOP FOUND</span>
          <h1>One secure sign-in away.</h1>
          <p>
            The encryption key for <strong>{account.syncEmail ?? "your personal workspace"}</strong> is stored on this device.
            Sign in with the same Nimbalyst account to load its sessions.
          </p>
          <div className="pairing-security-note">
            <span aria-hidden="true">◇</span>
            <div>
              <strong>End-to-end encryption preserved</strong>
              <small>The raw desktop key was discarded and never sent to this website.</small>
            </div>
          </div>
          <button className="pairing-primary" type="button" onClick={() => beginGoogleSignIn(account)}>
            Continue with Google
          </button>
          <button className="pairing-link" type="button" onClick={onExploreDemo}>Explore the preview instead</button>
          <p className="pairing-fine-print">Sign-in opens Nimbalyst&apos;s existing secure account service.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="pairing-shell">
      <section className="pairing-card">
        <div className="pairing-brand">
          <img src="/nimbalyst-icon.png" width={34} height={34} alt="" />
          <span>Nimbalyst</span>
        </div>
        <span className="pairing-kicker">COMMAND CENTER</span>
        <h1>Bring your desktop sessions with you.</h1>
        <p>Open Nimbalyst on your computer, then go to <strong>Settings → Mobile App → Pair a device</strong>.</p>

        {scanning ? (
          <div className="scanner-panel">
            <video ref={videoRef} muted playsInline aria-label="QR code camera preview" />
            <div className="scanner-frame" aria-hidden="true" />
            <span>Point this device at the QR code on your desktop.</span>
            <button className="pairing-secondary" type="button" onClick={() => setScanning(false)}>Cancel camera</button>
          </div>
        ) : (
          <div className="pairing-actions">
            <button className="pairing-primary" type="button" onClick={() => { setError(""); setScanning(true); }}>
              <span aria-hidden="true">▣</span> Scan desktop QR code
            </button>
            <button className="pairing-secondary" type="button" onClick={() => setManualOpen((open) => !open)}>
              Paste pairing payload
            </button>
          </div>
        )}

        {manualOpen && !scanning && (
          <form className="manual-pairing" onSubmit={(event) => { event.preventDefault(); void acceptPayload(manualValue); }}>
            <label htmlFor="pairing-payload">Pairing payload</label>
            <textarea
              id="pairing-payload"
              rows={5}
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              placeholder="Paste the copied JSON or nimbalyst:// pairing link"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button className="pairing-primary" type="submit" disabled={busy || !manualValue.trim()}>
              {busy ? "Securing this device…" : "Pair this device"}
            </button>
          </form>
        )}

        {error && <div className="pairing-error" role="alert">{error}</div>}

        <div className="pairing-divider"><span>or</span></div>
        <button className="pairing-link" type="button" onClick={onExploreDemo}>Explore with preview sessions</button>
        <p className="pairing-fine-print">The QR contains an encryption key, never your login token. It expires after 15 minutes.</p>
      </section>
    </main>
  );
}
