export type PairingPayload = {
  version: number;
  serverUrl: string;
  encryptionKeySeed: string;
  expiresAt?: number;
  analyticsId?: string;
  syncEmail?: string;
  userId: string;
  personalOrgId?: string;
  personalUserId?: string;
  remoteGateway?: RemoteGatewayPairing;
};

export type RemoteGatewayPairing = {
  port: number;
  token: string;
  pwaUrl: string;
  workspaces: Array<{ path: string; name: string }>;
  url?: string;
};

export type PairingAccount = Omit<PairingPayload, "encryptionKeySeed"> & {
  keySalt: string;
  pairedAt: number;
};

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is missing from this pairing code.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseRemoteGateway(value: unknown): RemoteGatewayPairing | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The desktop gateway details are invalid.");
  }
  const raw = value as Record<string, unknown>;
  const port = raw.port;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("The desktop gateway port is invalid.");
  }
  const token = requiredString(raw.token, "Desktop gateway credential");
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    throw new Error("The desktop gateway credential is invalid.");
  }
  const pwaUrl = requiredString(raw.pwaUrl, "Command Center address");
  let parsedPwaUrl: URL;
  try {
    parsedPwaUrl = new URL(pwaUrl);
  } catch {
    throw new Error("The Command Center address is invalid.");
  }
  if (parsedPwaUrl.protocol !== "https:" && parsedPwaUrl.hostname !== "localhost") {
    throw new Error("The Command Center address must be encrypted.");
  }
  const workspaces = Array.isArray(raw.workspaces)
    ? raw.workspaces.flatMap((workspace) => {
        if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) return [];
        const entry = workspace as Record<string, unknown>;
        const path = optionalString(entry.path);
        const name = optionalString(entry.name);
        return path && name ? [{ path, name }] : [];
      })
    : [];
  return {
    port,
    token: token.toLowerCase(),
    pwaUrl: parsedPwaUrl.toString().replace(/\/$/, ""),
    workspaces,
    url: optionalString(raw.url),
  };
}

function decodeBase64(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error("The pairing link contains invalid data.");
  }
}

function extractJson(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("{")) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Paste the complete QR value or scan the code again.");
  }
  if (url.protocol !== "nimbalyst:" || url.hostname !== "pair") {
    throw new Error("This is not a Nimbalyst pairing code.");
  }
  const encoded = url.searchParams.get("data");
  if (!encoded) throw new Error("The pairing link has no data.");
  return decodeBase64(encoded);
}

export function parsePairingPayload(input: string, now = Date.now()): PairingPayload {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(extractJson(input)) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.includes("pairing")) throw error;
    throw new Error("The pairing code is not valid JSON.");
  }

  const serverUrl = requiredString(raw.serverUrl, "Sync server");
  let parsedServer: URL;
  try {
    parsedServer = new URL(serverUrl);
  } catch {
    throw new Error("The pairing code has an invalid sync server.");
  }
  if (!["https:", "wss:", "http:", "ws:"].includes(parsedServer.protocol)) {
    throw new Error("The pairing code uses an unsupported sync server.");
  }
  if (["http:", "ws:"].includes(parsedServer.protocol) && !["localhost", "127.0.0.1"].includes(parsedServer.hostname)) {
    throw new Error("Remote pairing requires an encrypted sync server.");
  }

  const encryptionKeySeed = requiredString(
    raw.encryptionKeySeed ?? raw.seed,
    "Encryption key",
  );
  const syncEmail = optionalString(raw.syncEmail);
  const analyticsId = optionalString(raw.analyticsId);
  const legacyUserId = optionalString(raw.userId);
  const userId = syncEmail ?? legacyUserId ?? analyticsId;
  if (!userId) throw new Error("User identity is missing from this pairing code.");

  const expiresAt = typeof raw.expiresAt === "number" ? raw.expiresAt : undefined;
  if (expiresAt !== undefined && expiresAt <= now) {
    throw new Error("This pairing code has expired. Generate a new one on the desktop.");
  }

  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    serverUrl: parsedServer.toString().replace(/\/$/, ""),
    encryptionKeySeed,
    expiresAt,
    analyticsId,
    syncEmail,
    userId,
    personalOrgId: optionalString(raw.personalOrgId),
    personalUserId: optionalString(raw.personalUserId),
    remoteGateway: parseRemoteGateway(raw.remoteGateway),
  };
}

export function accountFromPayload(payload: PairingPayload, pairedAt = Date.now()): PairingAccount {
  return {
    version: payload.version,
    serverUrl: payload.serverUrl,
    expiresAt: payload.expiresAt,
    analyticsId: payload.analyticsId,
    syncEmail: payload.syncEmail,
    userId: payload.userId,
    personalOrgId: payload.personalOrgId,
    personalUserId: payload.personalUserId,
    remoteGateway: payload.remoteGateway,
    keySalt: payload.personalUserId ?? payload.userId,
    pairedAt,
  };
}

export function syncHttpOrigin(serverUrl: string): string {
  const url = new URL(serverUrl);
  if (url.protocol === "wss:") url.protocol = "https:";
  if (url.protocol === "ws:") url.protocol = "http:";
  return url.toString().replace(/\/$/, "");
}
