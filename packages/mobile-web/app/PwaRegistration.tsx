"use client";

import { useEffect } from "react";

export default function PwaRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // The app remains fully usable online if service worker registration fails.
      });
    }
  }, []);

  return null;
}
