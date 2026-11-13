/** Read-only CLI diagnostics. Never retain credentials or arbitrary provider messages. */
export type PaymentProbe = { endpoint: 'GET https://api.mercadopago.com/users/me'; status: number; codes: string[]; requestId?: string; body: 'json' | 'non_json' | 'not_read' };
const endpoint = 'https://api.mercadopago.com/users/me';
const allowedCodes = new Set(['PA_UNAUTHORIZED_RESULT_FROM_POLICIES', 'forbidden', 'unauthorized', 'invalid_token',
  'invalid_access_token', 'invalid_credentials', 'invalid_scope', 'unauthorized_client', 'access_denied', 'insufficient_scope']);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function paymentProbe(fetcher: typeof fetch = fetch) {
  const responses: PaymentProbe[] = [];
  const request: typeof fetch = async (input, init) => {
    // This diagnostic wrapper may only issue the identity read, never a payment request.
    if (String(input) !== endpoint || init?.method !== 'GET' || init.body !== undefined) throw Error('Invalid payment probe');
    const response = await fetcher(input, init);
    const result: PaymentProbe = { endpoint: 'GET https://api.mercadopago.com/users/me', status: response.status, codes: [], body: 'not_read' };
    const requestId = response.headers.get('x-request-id');
    if (requestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) result.requestId = requestId;
    if (!response.ok) {
      try {
        const data: unknown = await response.clone().json(); result.body = 'json';
        if (record(data)) {
          const causes = Array.isArray(data.cause) ? data.cause.filter(record).slice(0, 10) : [];
          const codes = [data.code, data.error, data.message, ...causes.map(cause => cause.code)];
          result.codes = [...new Set(codes.filter((code): code is string => typeof code === 'string' && allowedCodes.has(code)))];
        }
      } catch { result.body = 'non_json'; }
    }
    responses.push(result);
    return response;
  };
  return { request, responses };
}
