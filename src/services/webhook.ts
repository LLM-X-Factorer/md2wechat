import axios from 'axios';
import type { WebhookPayload } from '../types/index.js';
import { updatePublishRecord } from './publishRecord.js';

const RETRY_DELAYS = [5_000, 15_000, 30_000];

export async function sendWebhook(
  url: string,
  payload: WebhookPayload,
  publishId: string,
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
): Promise<void> {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10_000,
      });

      await updatePublishRecord(publishId, { webhook_status: 'sent' });
      logger.info(`Webhook sent successfully for ${publishId}`);
      return;
    } catch (err) {
      if (attempt < RETRY_DELAYS.length) {
        logger.warn(`Webhook attempt ${attempt + 1} failed, retrying in ${RETRY_DELAYS[attempt]! / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
      }
    }
  }

  // All retries failed
  await updatePublishRecord(publishId, { webhook_status: 'failed' });
  logger.warn(`Webhook failed after all retries for ${publishId}`);
}

export function triggerWebhook(
  webhookUrl: string | undefined,
  globalWebhookUrl: string | undefined,
  payload: WebhookPayload,
  publishId: string,
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
): void {
  const url = webhookUrl || globalWebhookUrl;
  if (!url) return;

  // Fire and forget (async)
  sendWebhook(url, payload, publishId, logger).catch((err) => {
    logger.warn(`Webhook error: ${err}`);
  });
}
