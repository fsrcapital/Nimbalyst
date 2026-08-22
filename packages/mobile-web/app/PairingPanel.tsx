"use client";
/* eslint-disable @next/next/no-img-element -- the deployed vinext runtime cannot safely use next/image. */

import { useEffect, useRef, useState } from "react";
import { deriveEncryptionKey } from "../lib/crypto";
import { accountFromPayload, parsePairingPayload, type PairingAccount } from "../lib/pairing";
import { saveAuthSession, saveStoredPairing, type StoredPairing } from "../lib/pairingStore";
import { completePairingWithCode, sendPairingCode, signInErrorMessage } from "../lib/stytchAuth";

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
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
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

  const requestCode = async (account: PairingAccount) => {
    setAuthBusy(true);
    setAuthError("");
    try {
      await sendPairingCode(account);
      setOtpSent(true);
    } catch (caught) {
      setAuthError(signInErrorMessage(caught));
    } finally {
      setAuthBusy(false);
    }
  };

  const verifyCode = async (account: PairingAccount) => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const auth = await completePairingWithCode(account, otpCode);
      const updated = await saveAuthSession(auth);
      onPaired(updated);
    } catch (caught) {
      setAuthError(signInErrorMessage(caught));
    } finally {
      setAuthBusy(false);
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
          {otpSent ? (
            <form className="otp-sign-in" onSubmit={(event) => { event.preventDefault(); void verifyCode(account); }}>
              <label htmlFor="sign-in-code">Enter the 6-digit code sent to {account.syncEmail}</label>
              <input
                id="sign-in-code"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
              />
              <button className="pairing-primary" type="submit" disabled={authBusy || otpCode.length !== 6}>
                {authBusy ? "Connecting…" : "Verify and connect"}
              </button>
              <button className="pairing-link" type="button" disabled={authBusy} onClick={() => void requestCode(account)}>
                Send a new code
              </button>
            </form>
          ) : (
            <button className="pairing-primary" type="button" disabled={authBusy} onClick={() => void requestCode(account)}>
              {authBusy ? "Sending code…" : "Email me a sign-in code"}
            </button>
          )}
          {authError && <div className="pairing-error" role="alert">{authError}</div>}
          <button className="pairing-link" type="button" onClick={onExploreDemo}>Explore the preview instead</button>
          <p className="pairing-fine-print">No redirect. The one-time code expires after 10 minutes.</p>
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
