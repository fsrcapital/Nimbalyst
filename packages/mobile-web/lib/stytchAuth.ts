import type { PairingAccount } from "./pairing";
import type { AuthSession } from "./pairingStore";

// Stytch public tokens are browser identifiers, not secrets. This is the same
// live token embedded in Nimbalyst's desktop runtime.
const publicToken = "public-token-live-db5dfb0e-6423-4166-8366-164f4138e0ff";

type AuthExchange = {
  member_authenticated: boolean;
  session_token?: string;
  session_jwt?: string;
  member_id?: string;
  member?: { member_id?: string; email_address?: string };
  organization?: { organization_id?: string };
  member_session?: { expires_at?: string } | null;
};

let clientPromise: Promise<ReturnType<typeof import("@stytch/vanilla-js/b2b")["createStytchB2BClient"]>> | undefined;

function getClient() {
  if (typeof window === "undefined") throw new Error("Sign-in is only available in the browser.");
  clientPromise ??= import("@stytch/vanilla-js/b2b").then(({ createStytchB2BClient }) =>
    createStytchB2BClient(publicToken),
  );
  return clientPromise;
}

function requiredAccountDetails(account: PairingAccount): { email: string; orgId: string } {
  if (!account.syncEmail || !account.personalOrgId) {
    throw new Error("This desktop pairing code is missing account details. Update Nimbalyst and generate a new code.");
  }
  return { email: account.syncEmail, orgId: account.personalOrgId };
}

export function authSessionFromExchange(account: PairingAccount, exchange: AuthExchange): AuthSession {
  const { email, orgId } = requiredAccountDetails(account);
  if (!exchange.member_authenticated) {
    throw new Error("This account requires an additional verification step that the browser app does not support yet.");
  }

  const returnedOrgId = exchange.organization?.organization_id;
  const returnedUserId = exchange.member_id ?? exchange.member?.member_id;
  if (returnedOrgId !== orgId) {
    throw new Error("The sign-in code belongs to a different Nimbalyst workspace.");
  }
  if (account.personalUserId && returnedUserId !== account.personalUserId) {
    throw new Error("The sign-in code belongs to a different Nimbalyst account.");
  }
  if (!exchange.session_token || !exchange.session_jwt || !returnedUserId) {
    throw new Error("Nimbalyst did not return a complete browser session. Please try again.");
  }

  return {
    sessionToken: exchange.session_token,
    sessionJwt: exchange.session_jwt,
    userId: returnedUserId,
    orgId: returnedOrgId,
    email: exchange.member?.email_address ?? email,
    expiresAt: exchange.member_session?.expires_at,
  };
}

export async function sendPairingCode(account: PairingAccount): Promise<void> {
  const { email } = requiredAccountDetails(account);
  const client = await getClient();
  await client.otps.email.discovery.send({ email_address: email });
}

export async function completePairingWithCode(account: PairingAccount, code: string): Promise<AuthSession> {
  const { email, orgId } = requiredAccountDetails(account);
  const client = await getClient();
  const discovery = await client.otps.email.discovery.authenticate({
    email_address: email,
    code: code.trim(),
  });

  const matched = discovery.discovered_organizations.some(
    ({ organization }) => organization.organization_id === orgId,
  );
  if (!matched) throw new Error("That account does not have access to the paired Nimbalyst workspace.");

  const exchange = await client.discovery.intermediateSessions.exchange({
    organization_id: orgId,
    session_duration_minutes: 10_080,
  });
  return authSessionFromExchange(account, exchange);
}

export function signInErrorMessage(caught: unknown): string {
  if (caught instanceof Error) {
    const errorType = "error_type" in caught ? String(caught.error_type) : "";
    if (errorType.includes("bad_domain") || /domain.+stytch|unauthorized domain/i.test(caught.message)) {
      return "This PWA address still needs to be approved in Nimbalyst's sign-in settings.";
    }
    if (/invalid.*code|otp.*invalid|code.*expired/i.test(`${errorType} ${caught.message}`)) {
      return "That code is invalid or expired. Request a new code and try again.";
    }
    return caught.message;
  }
  return "Sign-in failed. Please request a new code and try again.";
}
