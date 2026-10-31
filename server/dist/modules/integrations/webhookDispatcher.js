"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchWebhook = dispatchWebhook;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = __importDefault(require("../../db"));
async function dispatchWebhook(event, payload) {
    try {
        const webhooks = await db_1.default.webhook.findMany({
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
                const signature = crypto_1.default
                    .createHmac('sha256', hook.secret)
                    .update(payloadString)
                    .digest('hex');
                // Asynchronously deliver with retry
                deliverWithRetry(hook.id, hook.url, signature, event, payloadString, 3);
            }
        }
    }
    catch (err) {
        console.error('Failed to query webhooks:', err);
    }
}
async function deliverWithRetry(webhookId, url, signature, event, payload, maxAttempts = 3) {
    let attempt = 0;
    let success = false;
    let lastStatusCode = null;
    let lastError = null;
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
            }
            else {
                lastError = `HTTP ${response.status}: ${response.statusText}`;
            }
        }
        catch (err) {
            lastError = err.message || 'Network error';
        }
        if (!success && attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt))); // Exponential backoff
        }
    }
    // Record delivery history in database
    try {
        await db_1.default.webhookDelivery.create({
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
    }
    catch (dbErr) {
        console.error('Failed to log webhook delivery:', dbErr);
    }
}
