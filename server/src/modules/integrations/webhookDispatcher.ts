import crypto from 'crypto';
import prisma from '../../db';

export async function dispatchWebhook(event: string, payload: Record<string, any>) {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { isActive: true }
    });

    const payloadString = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload
    });

    for (const hook of webhooks) {
      const subscribedEvents = hook.events.split(',').map(e => e.trim());
      if (subscribedEvents.includes('*') || subscribedEvents.includes(event)) {
        // Calculate HMAC SHA256 signature
        const signature = crypto
          .createHmac('sha256', hook.secret)
          .update(payloadString)
          .digest('hex');

        // Asynchronously deliver with retry
        deliverWithRetry(hook.id, hook.url, signature, event, payloadString, 3);
      }
    }
  } catch (err) {
    console.error('Failed to query webhooks:', err);
  }
}

async function deliverWithRetry(
  webhookId: string,
  url: string,
  signature: string,
  event: string,
  payload: string,
  maxAttempts = 3
) {
  let attempt = 0;
  let success = false;
  let lastStatusCode: number | null = null;
  let lastError: string | null = null;

  while (attempt < maxAttempts && !success) {
    attempt++;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-XYZ-Signature': signature,
          'X-XYZ-Event': event
        },
        body: payload,
        signal: AbortSignal.timeout(5000)
      });

      lastStatusCode = response.status;
      if (response.ok) {
        success = true;
      } else {
        lastError = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (err: any) {
      lastError = err.message || 'Network error';
    }

    if (!success && attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt))); // Exponential backoff
    }
  }

  // Record delivery history in database
  try {
    await prisma.webhookDelivery.create({
      data: {
        webhookId,
        event,
        payload,
        status: success ? 'SUCCESS' : 'FAILED',
        statusCode: lastStatusCode,
        attempts: attempt,
        error: success ? null : lastError
      }
    });
  } catch (dbErr) {
    console.error('Failed to log webhook delivery:', dbErr);
  }
}
