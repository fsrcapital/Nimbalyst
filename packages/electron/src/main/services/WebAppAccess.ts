export type WebAppPreventSleepMode = 'off' | 'always' | 'pluggedIn';

export interface WebAppAccessConfig {
  enabledProjects: string[];
  preventSleepMode: WebAppPreventSleepMode;
}

export interface NativePairingIdentity {
  syncEmail?: string;
  personalOrgId?: string;
  personalUserId?: string;
}

const DEFAULT_WEB_APP_ACCESS: WebAppAccessConfig = {
  enabledProjects: [],
  preventSleepMode: 'off',
};

/**
 * Normalize the independently persisted Web App permission boundary.
 *
 * Deliberately do not migrate from personal-sync settings: an old mobile
 * selection is not evidence that the user intended to expose that workspace
 * through the direct desktop gateway.
 */
export function normalizeWebAppAccessConfig(
  value: unknown,
  _personalSyncConfig?: unknown,
): WebAppAccessConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_WEB_APP_ACCESS };
  }

  const raw = value as Record<string, unknown>;
  const enabledProjects = Array.isArray(raw.enabledProjects)
    ? Array.from(new Set(raw.enabledProjects.filter(
      (project): project is string => typeof project === 'string' && project.trim().length > 0,
    )))
    : [];
  const preventSleepMode = raw.preventSleepMode === 'always' || raw.preventSleepMode === 'pluggedIn'
    ? raw.preventSleepMode
    : 'off';

  return { enabledProjects, preventSleepMode };
}

/** Web pairing must not initialize or persist an upstream personal-sync identity. */
export function resolvePairingIdentity(
  target: 'ios' | 'web',
  loadNativeIdentity: () => NativePairingIdentity,
): NativePairingIdentity {
  return target === 'ios' ? loadNativeIdentity() : {};
}
