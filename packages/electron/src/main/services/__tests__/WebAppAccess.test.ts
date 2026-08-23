// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { normalizeWebAppAccessConfig, resolvePairingIdentity } from '../WebAppAccess';

describe('Web App access settings', () => {
  it('defaults to no authorized projects without inheriting personal-sync projects', () => {
    const personalSync = {
      enabled: true,
      enabledProjects: ['C:\\Code\\Private'],
      preventSleepMode: 'always' as const,
    };

    expect(normalizeWebAppAccessConfig(undefined)).toEqual({
      enabledProjects: [],
      preventSleepMode: 'off',
    });
    expect(normalizeWebAppAccessConfig(undefined, personalSync)).toEqual({
      enabledProjects: [],
      preventSleepMode: 'off',
    });
  });

  it('normalizes persisted projects without broadening access', () => {
    expect(normalizeWebAppAccessConfig({
      enabledProjects: ['C:\\Code\\Nimbalyst', '', 'C:\\Code\\Nimbalyst', 42] as never,
      preventSleepMode: 'pluggedIn',
    })).toEqual({
      enabledProjects: ['C:\\Code\\Nimbalyst'],
      preventSleepMode: 'pluggedIn',
    });
  });

  it('does not load an upstream identity for Web App pairing', () => {
    const loadNativeIdentity = () => {
      throw new Error('upstream identity must not be read');
    };

    expect(resolvePairingIdentity('web', loadNativeIdentity)).toEqual({});
  });
});
