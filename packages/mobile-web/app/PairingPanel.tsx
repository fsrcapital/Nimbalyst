"use client";
/* eslint-disable @next/next/no-img-element -- the deployed vinext runtime cannot safely use next/image. */

import { useEffect, useRef, useState } from "react";
import { deriveEncryptionKey } from "../lib/crypto";
import { accountFromPayload, parsePairingPayload } from "../lib/pairing";
import { checkGateway, normalizeGatewayUrl } from "../lib/gateway";
import { clearStoredPairing, saveStoredPairing, type StoredPairing } from "../lib/pairingStore";

type PairingPanelProps = {
  pairing?: StoredPairing;
  onPaired: (pairing: StoredPairing) => void;
  onExploreDemo: () => void;
  onReset: () => void;
};

export default function PairingPanel({ pairing, onPaired, onExploreDemo, onReset }: PairingPanelProps) {
  const [scanning, setScanning] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gatewayUrl, setGatewayUrl] = useState(pairing?.account.remoteGateway?.url ?? "");
  const [gatewayBusy, setGatewayBusy] = useState(false);
  const [gatewayError, setGatewayError] = useState("");
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

  const connectGateway = async () => {
    if (!pairing?.account.remoteGateway) return;
    setGatewayBusy(true);
    setGatewayError("");
    try {
      const url = normalizeGatewayUrl(gatewayUrl);
      const updated: StoredPairing = {
        ...pairing,
        account: {
          ...pairing.account,
          remoteGateway: { ...pairing.account.remoteGateway, url },
        },
      };
      await checkGateway(updated.account);
      await saveStoredPairing(updated);
      onPaired(updated);
    } catch (caught) {
      setGatewayError(caught instanceof Error ? caught.message : "Could not connect to the desktop gateway.");
    } finally {
      setGatewayBusy(false);
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
    const account = pairing.account;
    const gateway = account.remoteGateway;
    return (
      <main className="pairing-shell">
        <section className="pairing-card pairing-success-card">
          <div className="pairing-brand">
            <img src="/nimbalyst-icon.png" width={34} height={34} alt="" />
            <span>Nimbalyst</span>
          </div>
          <span className="pairing-kicker">Desktop Found</span>
          <h1>{gateway ? "Connect Through Your Private Network." : "Generate a New Desktop Code."}</h1>
          <p>
            {gateway
              ? <>The private gateway credential for <strong>{account.syncEmail ?? "your desktop"}</strong> is stored on this device. Enter the HTTPS address Tailscale gives this computer.</>
              : <>This older pairing code does not contain a desktop gateway credential. Rebuild and restart Nimbalyst, then scan a new QR code.</>}
          </p>
          <div className="pairing-security-note">
            <span aria-hidden="true">◇</span>
            <div>
              <strong>End-to-End Encryption Preserved</strong>
              <small>The credential stays on this device and the desktop remains private to your Tailscale network.</small>
            </div>
          </div>
          {gateway && (
            <form className="otp-sign-in" onSubmit={(event) => { event.preventDefault(); void connectGateway(); }}>
              <label htmlFor="gateway-url">Private Desktop Address</label>
              <input
                id="gateway-url"
                value={gatewayUrl}
                onChange={(event) => setGatewayUrl(event.target.value)}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://your-pc.your-tailnet.ts.net"
              />
              <button className="pairing-primary" type="submit" disabled={gatewayBusy || !gatewayUrl.trim()}>
                {gatewayBusy ? "Connecting…" : "Connect to Desktop"}
              </button>
            </form>
          )}
          {gatewayError && <div className="pairing-error" role="alert">{gatewayError}</div>}
          <button className="pairing-secondary" type="button" onClick={() => void clearStoredPairing().then(onReset)}>
            Scan a New Desktop Code
          </button>
          <button className="pairing-link" type="button" onClick={onExploreDemo}>Explore the Preview Instead</button>
          <p className="pairing-fine-print">No Nimbalyst account or upstream approval is required.</p>
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
        <span className="pairing-kicker">Command Center</span>
        <h1>Bring Your Desktop Sessions with You.</h1>
        <p>Open Nimbalyst on your computer, then go to <strong>Settings → Web App → Pair a Device</strong>.</p>

        {scanning ? (
          <div className="scanner-panel">
            <video ref={videoRef} muted playsInline aria-label="QR code camera preview" />
            <div className="scanner-frame" aria-hidden="true" />
            <span>Point this device at the QR code on your desktop.</span>
            <button className="pairing-secondary" type="button" onClick={() => setScanning(false)}>Cancel Camera</button>
          </div>
        ) : (
          <div className="pairing-actions">
            <button className="pairing-primary" type="button" onClick={() => { setError(""); setScanning(true); }}>
              <span aria-hidden="true">▣</span> Scan Desktop QR Code
            </button>
            <button className="pairing-secondary" type="button" onClick={() => setManualOpen((open) => !open)}>
              Paste Pairing Payload
            </button>
          </div>
        )}

        {manualOpen && !scanning && (
          <form className="manual-pairing" onSubmit={(event) => { event.preventDefault(); void acceptPayload(manualValue); }}>
            <label htmlFor="pairing-payload">Pairing Payload</label>
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
              {busy ? "Securing this device…" : "Pair This Device"}
            </button>
          </form>
        )}

        {error && <div className="pairing-error" role="alert">{error}</div>}

        <div className="pairing-divider"><span>or</span></div>
        <button className="pairing-link" type="button" onClick={onExploreDemo}>Explore with Preview Sessions</button>
        <p className="pairing-fine-print">The QR contains an encryption key and a private desktop credential. It expires after 15 minutes.</p>
      </section>
    </main>
  );
}
