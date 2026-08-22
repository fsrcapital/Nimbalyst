"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { consumeAuthCallback } from "../../../lib/auth";
import { getStoredPairing, saveAuthSession } from "../../../lib/pairingStore";

export default function PairingCallbackPage() {
  const [message, setMessage] = useState("Finishing secure sign-in…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const finish = async () => {
      try {
        const auth = consumeAuthCallback(window.location.hash.slice(1));
        const pairing = await getStoredPairing();
        if (!pairing) throw new Error("Pairing information was lost. Scan the desktop QR again.");
        if (pairing.account.personalOrgId && pairing.account.personalOrgId !== auth.orgId) {
          throw new Error("This is not the account used by the paired desktop.");
        }
        if (pairing.account.personalUserId && pairing.account.personalUserId !== auth.userId) {
          throw new Error("This is not the account used by the paired desktop.");
        }
        await saveAuthSession(auth);
        window.history.replaceState({}, "", "/pair/callback");
        window.location.replace("/");
      } catch (caught) {
        window.history.replaceState({}, "", "/pair/callback");
        setFailed(true);
        setMessage(caught instanceof Error ? caught.message : "Secure sign-in could not be completed.");
      }
    };
    void finish();
  }, []);

  return (
    <main className="pairing-shell">
      <section className="pairing-card callback-card">
        <span className={failed ? "callback-mark callback-failed" : "callback-mark"} aria-hidden="true">
          {failed ? "!" : "…"}
        </span>
        <h1>{failed ? "Sign-in needs another try" : "Connecting Nimbalyst"}</h1>
        <p role={failed ? "alert" : undefined}>{message}</p>
        {failed && <Link className="pairing-primary callback-link" href="/">Return to pairing</Link>}
      </section>
    </main>
  );
}
