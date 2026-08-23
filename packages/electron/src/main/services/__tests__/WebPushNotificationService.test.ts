// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWebPushNotificationService,
  type PersistedWebPushState,
} from '../WebPushNotificationService';

describe('WebPushNotificationService', () => {
  let state: PersistedWebPushState | undefined;
  const saveState = vi.fn((next: PersistedWebPushState) => { state = next; });
  const sendNotification = vi.fn();

  beforeEach(() => {
    state = undefined;
    saveState.mockClear();
    sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
  });

  it('creates one VAPID identity and upserts browser subscriptions by endpoint', async () => {
    const service = createWebPushNotificationService({
      loadState: () => state,
      saveState,
      generateVapidKeys: () => ({ publicKey: 'public-key', privateKey: 'private-key' }),
      sendNotification,
    });

    expect(service.getPublicKey()).toBe('public-key');
    expect(service.getPublicKey()).toBe('public-key');
    service.subscribe({ endpoint: 'https://push.example/device', keys: { p256dh: 'one', auth: 'two' }, deviceLabel: 'Phone' });
    service.subscribe({ endpoint: 'https://push.example/device', keys: { p256dh: 'new', auth: 'keys' }, deviceLabel: 'Phone' });

    expect(state?.subscriptions).toEqual([
      expect.objectContaining({ endpoint: 'https://push.example/device', keys: { p256dh: 'new', auth: 'keys' } }),
    ]);
  });

  it('delivers waiting alerts and forgets expired push endpoints', async () => {
    state = {
      vapidPublicKey: 'public-key',
      vapidPrivateKey: 'private-key',
      subscriptions: [
        { endpoint: 'https://push.example/live', keys: { p256dh: 'a', auth: 'b' }, createdAt: 1 },
        { endpoint: 'https://push.example/gone', keys: { p256dh: 'c', auth: 'd' }, createdAt: 2 },
      ],
    };
    sendNotification
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    const service = createWebPushNotificationService({
      loadState: () => state,
      saveState,
      generateVapidKeys: () => ({ publicKey: 'unused', privateKey: 'unused' }),
      sendNotification,
    });

    await service.notifyWaitingForInput({ sessionId: 'session-1', title: 'Review importer', workspacePath: 'C:\\Code\\Nimbalyst' });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toMatchObject({
      title: 'Review importer',
      body: 'Waiting for your response',
      data: { sessionId: 'session-1', workspacePath: 'C:\\Code\\Nimbalyst' },
    });
    expect(state?.subscriptions.map((item) => item.endpoint)).toEqual(['https://push.example/live']);
  });
});
