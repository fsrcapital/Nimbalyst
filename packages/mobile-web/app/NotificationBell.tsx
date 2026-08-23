"use client";

import { useEffect, useRef, useState } from "react";
import type { PairingAccount } from "../lib/pairing";
import {
  getGatewayWebPushPublicKey,
  subscribeGatewayWebPush,
  unsubscribeGatewayWebPush,
} from "../lib/gateway";
import {
  isIosDevice,
  isStandalonePwa,
  serializePushSubscription,
  urlBase64ToUint8Array,
} from "../lib/webPush";

type NotificationState = "checking" | "off" | "enabling" | "on" | "denied" | "unsupported" | "install-required" | "error";

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </svg>
  );
}

export default function NotificationBell({ account }: { account: PairingAccount }) {
  const [state, setState] = useState<NotificationState>("checking");
  const [message, setMessage] = useState("");
  const permissionRequest = useRef<Promise<NotificationPermission> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const inspect = async () => {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (isIosDevice() && !isStandalonePwa()) {
        if (!cancelled) setState("install-required");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!cancelled) setState(subscription ? "on" : "off");
    };
    void inspect().catch(() => {
      if (!cancelled) setState("error");
    });
    return () => { cancelled = true; };
  }, []);

  const primePermission = () => {
    if (state !== "off" || Notification.permission !== "default") return;
    permissionRequest.current = Notification.requestPermission();
  };

  const toggle = async () => {
    setMessage("");
    if (state === "install-required") {
      setMessage("On iPhone or iPad, add Nimbalyst to the Home Screen and open that installed app before enabling alerts.");
      return;
    }
    if (state === "denied") {
      setMessage(
        isIosDevice() && isStandalonePwa()
          ? "Notifications are disabled for Nimbalyst. Open Settings > Notifications > Nimbalyst, then enable Allow Notifications. If Nimbalyst is not listed, reinstall the Home Screen web app from Safari, reconnect it to your desktop, then enable alerts."
          : "Notifications are blocked in this device's browser settings.",
      );
      return;
    }
    if (state === "unsupported" || state === "checking" || state === "enabling") return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (state === "on" && existing) {
        await unsubscribeGatewayWebPush(account, existing.endpoint);
        await existing.unsubscribe();
        setState("off");
        setMessage("Waiting-for-input alerts are off on this device.");
        return;
      }

      setState("enabling");
      const permission = permissionRequest.current
        ? await permissionRequest.current
        : await Notification.requestPermission();
      permissionRequest.current = null;
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        setMessage("Notification permission was not granted.");
        return;
      }
      const publicKey = await getGatewayWebPushPublicKey(account);
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await subscribeGatewayWebPush(account, serializePushSubscription(subscription));
      setState("on");
      setMessage("Alerts are on. Nimbalyst will notify this device when a session needs your input.");
    } catch (caught) {
      setState("error");
      setMessage(caught instanceof Error ? caught.message : "Could not enable notifications.");
    }
  };

  const label = state === "on"
    ? "Turn Off Waiting-for-Input Alerts"
    : state === "enabling"
      ? "Enabling Alerts"
      : "Enable Waiting-for-Input Alerts";

  return (
    <div className="notification-control">
      <button
        className={`notification-bell notification-${state}`}
        type="button"
        aria-label={label}
        title={label}
        aria-pressed={state === "on"}
        disabled={state === "checking" || state === "enabling" || state === "unsupported"}
        onPointerDown={primePermission}
        onClick={() => void toggle()}
      >
        <BellIcon />
        {state === "on" ? <span className="notification-enabled-dot" /> : null}
      </button>
      {message ? <p className="notification-message" role="status">{message}</p> : null}
    </div>
  );
}
