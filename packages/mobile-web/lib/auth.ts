import type { PairingAccount } from "./pairing";
import { syncHttpOrigin } from "./pairing";
import type { AuthSession } from "./pairingStore";

const authStateKey = "nimbalyst-pwa-auth-state";

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function beginGoogleSignIn(account: PairingAccount): void {
  const state = randomState();
  sessionStorage.setItem(authStateKey, state);
  const callback = `${window.location.origin}/pair/callback`;
  const login = new URL(`${syncHttpOrigin(account.serverUrl)}/auth/login/google`);
  login.searchParams.set("client_redirect", callback);
  login.searchParams.set("state", state);
  window.location.assign(login.toString());
}

export function consumeAuthCallback(search: string): AuthSession {
  const params = new URLSearchParams(search);
  const expectedState = sessionStorage.getItem(authStateKey);
  sessionStorage.removeItem(authStateKey);
  if (!expectedState || params.get("state") !== expectedState) {
    throw new Error("The sign-in response could not be verified. Start pairing again.");
  }
  const serverError = params.get("error") ?? params.get("error_description");
  if (serverError) throw new Error(serverError);

  const required = (name: string, label: string) => {
    const value = params.get(name);
    if (!value) throw new Error(`${label} is missing from the sign-in response.`);
    return value;
  };
  return {
    sessionToken: required("session_token", "Session token"),
    sessionJwt: required("session_jwt", "Session credential"),
    userId: required("user_id", "User identity"),
    orgId: required("org_id", "Organization identity"),
    email: params.get("email") ?? undefined,
    expiresAt: params.get("expires_at") ?? undefined,
  };
}
