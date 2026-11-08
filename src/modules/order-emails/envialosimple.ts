import type { EmailConfig } from './email-config';

export type EmailMessage = { from: { email: string; name: string }; to: string; reply_to?: string; subject: string; html: string; text: string;
  user_variables: { notification_id: string; order_id: string; stage: string };
  attachments?: { disposition: 'inline'; id: string; filename: string; content: string }[] };
export class EmailSendError extends Error {
  constructor(readonly code: string, readonly uncertain = false) { super(code); }
}
type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
export class EnvialoSimple {
  constructor(private readonly config: Pick<EmailConfig, 'apiKey'>, private readonly request: typeof fetch = fetch) {}
  private async call(path: string, body?: EmailMessage) {
    try {
      const response = await this.request('https://api.envialosimple.email/api/v1/' + path, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Bearer ' + this.config.apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new EmailSendError('provider_http_' + response.status, response.status >= 500 || response.status === 408);
      return object(await response.json());
    } catch (error) {
      if (error instanceof EmailSendError) throw error;
      // A timeout, broken connection or malformed success response may have happened AFTER acceptance.
      // Never automatically replay the POST: this API does not document an idempotency key.
      throw new EmailSendError('provider_response_unknown', true);
    }
  }
  async domains() {
    const result = await this.call('domains');
    if (!Array.isArray(result.payload)) throw new EmailSendError('provider_invalid_domains');
    return result.payload.map(value => { const d = object(value); return { name: String(d.name), status: String(d.status) }; });
  }
  async send(message: EmailMessage) {
    const result = await this.call('mail/send', message);
    // Single recipient only. The documented mail identifier is retained for delivery reconciliation.
    const payload = Array.isArray(result.payload) && result.payload.length === 1 ? object(result.payload[0]) : object(result.payload);
    const id = result.id ?? payload.id;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new EmailSendError('provider_receipt_unknown', true);
    return id;
  }
  async delivery(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new EmailSendError('provider_invalid_id');
    const result = await this.call('mail/' + encodeURIComponent(id));
    if (result.id !== id || !['processed', 'sent', 'rejected', 'failed', 'excluded'].includes(String(result.status))) throw new EmailSendError('provider_invalid_delivery');
    const sentEvent = Array.isArray(result.events) ? result.events.map(object).find(e => e.type === 'sent') : undefined;
    const sentDate = sentEvent && typeof sentEvent.date === 'string' ? new Date(sentEvent.date) : null;
    return { status: String(result.status), sentAt: sentDate && Number.isFinite(sentDate.getTime()) ? sentDate : null };
  }
}
