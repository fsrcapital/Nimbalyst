// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWebAppAccessConfig: vi.fn(),
}));

vi.mock('../../utils/store', () => ({
  getWebAppAccessConfig: mocks.getWebAppAccessConfig,
}));

import { listRemoteGatewayWorkspaces } from '../remoteGatewayWorkspaceAccess';

describe('remote gateway workspace authorization', () => {
  beforeEach(() => {
    mocks.getWebAppAccessConfig.mockReset();
  });

  it('lists only independently authorized Web App projects', () => {
    mocks.getWebAppAccessConfig.mockReturnValue({
      enabledProjects: ['C:\\Code\\Nimbalyst', 'C:\\Code\\Nimbalyst'],
      preventSleepMode: 'off',
    });

    expect(listRemoteGatewayWorkspaces()).toEqual([
      { path: 'C:\\Code\\Nimbalyst', name: 'Nimbalyst' },
    ]);
    expect(mocks.getWebAppAccessConfig).toHaveBeenCalledOnce();
  });
});
