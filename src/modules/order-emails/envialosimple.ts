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
      // GET diagnostics can identify a failure without implying that an email was sent.
      // Keep only allowlisted categories; fetch errors may contain credentials or URLs.
      if (!body) {
        const failure = error as { name?: string; cause?: { code?: string } } | null;
        const code = failure?.cause?.code;
        const reason = failure?.name === 'SyntaxError' ? 'provider_invalid_response'
          : failure?.name === 'TimeoutError' || failure?.name === 'AbortError' || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code ?? '') ? 'provider_timeout'
          : ['ENOTFOUND', 'EAI_AGAIN'].includes(code ?? '') ? 'provider_dns_error'
          : ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(code ?? '') ? 'provider_tls_error'
          : 'provider_network_error';
        throw new EmailSendError(reason);
      }
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
