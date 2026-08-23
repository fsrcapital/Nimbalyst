// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { shouldPreventSleep } from '../PowerSaveService';

describe('Web App sleep prevention', () => {
  it('keeps direct Web App access independent from sync connectivity', () => {
    expect(shouldPreventSleep({
      syncConnected: false,
      syncMode: 'off',
      webAppEnabled: true,
      webAppMode: 'always',
      onBattery: true,
    })).toBe(true);

    expect(shouldPreventSleep({
      syncConnected: false,
      syncMode: 'off',
      webAppEnabled: true,
      webAppMode: 'pluggedIn',
      onBattery: true,
    })).toBe(false);
  });
});
