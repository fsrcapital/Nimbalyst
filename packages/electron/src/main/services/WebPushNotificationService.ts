import webpush from 'web-push';
import {
  getWebPushState,
  setWebPushState,
  type PersistedWebPushState,
  type PersistedWebPushSubscription,
} from '../utils/store';
import { logger } from '../utils/logger';

export type { PersistedWebPushState, PersistedWebPushSubscription };

export interface WebPushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  deviceLabel?: string;
}

interface WebPushServiceDependencies {
  loadState(): PersistedWebPushState | undefined;
  saveState(state: PersistedWebPushState): void;
  generateVapidKeys(): { publicKey: string; privateKey: string };
  sendNotification(
    subscription: webpush.PushSubscription,
    payload: string,
    options: webpush.RequestOptions,
  ): Promise<unknown>;
}

function isGone(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || statusCode === 410;
}

export function createWebPushNotificationService(deps: WebPushServiceDependencies) {
  const ensureState = (): PersistedWebPushState => {
    const existing = deps.loadState();
    if (existing?.vapidPublicKey && existing.vapidPrivateKey && Array.isArray(existing.subscriptions)) {
      return existing;
    }
    const keys = deps.generateVapidKeys();
    const created: PersistedWebPushState = {
      vapidPublicKey: keys.publicKey,
      vapidPrivateKey: keys.privateKey,
      subscriptions: [],
    };
    deps.saveState(created);
    return created;
  };

  return {
    getPublicKey(): string {
      return ensureState().vapidPublicKey;
    },

    subscribe(input: WebPushSubscriptionInput): void {
      const current = ensureState();
      const subscription: PersistedWebPushSubscription = {
        ...input,
        createdAt: Date.now(),
      };
      deps.saveState({
        ...current,
        subscriptions: [
          ...current.subscriptions.filter((item) => item.endpoint !== input.endpoint),
          subscription,
        ],
      });
    },

    unsubscribe(endpoint: string): void {
      const current = ensureState();
      deps.saveState({
        ...current,
        subscriptions: current.subscriptions.filter((item) => item.endpoint !== endpoint),
      });
    },

    async notifyWaitingForInput(input: {
      sessionId: string;
      title: string;
      workspacePath?: string;
    }): Promise<void> {
      const current = ensureState();
      const expired = new Set<string>();
      const payload = JSON.stringify({
        title: input.title,
        body: 'Waiting for your response',
        tag: `waiting-${input.sessionId}`,
        data: {
          sessionId: input.sessionId,
          workspacePath: input.workspacePath,
          url: '/',
        },
      });
      await Promise.all(current.subscriptions.map(async (subscription) => {
        try {
          await deps.sendNotification(subscription, payload, {
            TTL: 60 * 60,
            urgency: 'high',
            vapidDetails: {
              subject: 'https://nimbalyst-command-center.fsrcapital.chatgpt.site',
              publicKey: current.vapidPublicKey,
              privateKey: current.vapidPrivateKey,
            },
          });
        } catch (error) {
          if (isGone(error)) {
            expired.add(subscription.endpoint);
            return;
          }
          logger.main.warn('[WebPush] Failed to deliver a waiting-for-input alert:', error);
        }
      }));
      if (expired.size > 0) {
        deps.saveState({
          ...current,
          subscriptions: current.subscriptions.filter((item) => !expired.has(item.endpoint)),
        });
      }
    },
  };
}

const webPushService = createWebPushNotificationService({
  loadState: getWebPushState,
  saveState: setWebPushState,
  generateVapidKeys: () => webpush.generateVAPIDKeys(),
  sendNotification: (subscription, payload, options) => webpush.sendNotification(subscription, payload, options),
});

export const getWebPushPublicKey = (): string => webPushService.getPublicKey();
export const subscribeWebPush = (input: WebPushSubscriptionInput): void => webPushService.subscribe(input);
export const unsubscribeWebPush = (endpoint: string): void => webPushService.unsubscribe(endpoint);
export const notifyWebPushWaiting = (input: {
  sessionId: string;
  title: string;
  workspacePath?: string;
}): Promise<void> => webPushService.notifyWaitingForInput(input);
