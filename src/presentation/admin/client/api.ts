/** Browser-only same-origin API transport. Never accepts an upstream URL or retries writes. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ApiError';
  }
}

function errorMessage(status: number): string {
  switch (status) {
    case 400: return 'Los datos enviados no son válidos. Revisá el formulario.';
    case 401: return 'La sesión venció o las credenciales no son válidas.';
    case 403: return 'Acceso denegado: verificá permisos, origen o la sesión de seguridad. Si abriste otra pestaña, recargá esta página.';
    case 404: return 'No se encontró el registro o ya no está disponible.';
    case 409: return 'El registro entra en conflicto con otro existente o está en uso. Revisá sus referencias antes de reintentar.';
    case 429: return 'Demasiados intentos. Esperá antes de volver a intentar.';
    case 503: return 'El servicio no está disponible. Intentá más tarde.';
    default: return 'No se pudo completar la solicitud. Intentá de nuevo.';
  }
}

function paymentVerificationMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('code' in value) || value.code !== 'PAYMENT_VERIFICATION_FAILED'
    || !('writeOccurred' in value) || value.writeOccurred !== false || !('reason' in value) || typeof value.reason !== 'string'
    || !('mode' in value) || !['test', 'production'].includes(String(value.mode))) return;
  const labels: Record<string, string> = {
    configuration_incomplete: 'Revisá las credenciales y variables del entorno seleccionado.',
    seller_id_mismatch: 'El ID de vendedor no coincide con la cuenta de la credencial. Usá el ID de usuario de Mercado Pago, no el de la aplicación.',
    seller_environment_mismatch: 'La credencial pertenece a un tipo de cuenta distinto del entorno seleccionado (prueba o producción).',
    seller_country_mismatch: 'La cuenta de Mercado Pago no corresponde a Argentina.',
    seller_verification_failed: 'No se pudo validar la identidad de la cuenta de Mercado Pago.',
    provider_connection_failed: 'No se pudo conectar con Mercado Pago o venció el tiempo de espera.',
    provider_invalid_response: 'Mercado Pago devolvió una respuesta inválida.',
    provider_http_401: 'Mercado Pago rechazó la autenticación (HTTP 401). Revisá el Access Token de ese entorno.',
    provider_http_403: 'Mercado Pago rechazó el acceso a la cuenta (HTTP 403). Revisá los permisos de la credencial.',
    provider_http_404: 'Mercado Pago no encontró el recurso de la cuenta (HTTP 404).',
    provider_http_429: 'Mercado Pago limitó temporalmente las consultas (HTTP 429). Esperá antes de reintentar.',
    verification_failed: 'No se pudo completar la verificación de Mercado Pago.',
  };
  let message = Object.hasOwn(labels, value.reason) ? labels[value.reason] : /^provider_http_5\d\d$/.test(value.reason) ? 'Mercado Pago no pudo atender la consulta. Intentá más tarde.' : '';
  if (!message) return;
  if (value.reason === 'seller_id_mismatch' && 'expectedSellerId' in value && 'actualSellerId' in value
    && typeof value.expectedSellerId === 'string' && typeof value.actualSellerId === 'string'
    && /^[1-9]\d{0,15}$/.test(value.expectedSellerId) && /^[1-9]\d{0,15}$/.test(value.actualSellerId)) {
    message += ` Configurado: ${value.expectedSellerId}. Cuenta autenticada: ${value.actualSellerId}.`;
  }
  if (value.reason === 'configuration_incomplete' && 'missing' in value && Array.isArray(value.missing)) {
    const fields = value.missing.filter(field => typeof field === 'string' && /^(MERCADOPAGO_(TEST_)?(SELLER_ID|ACCESS_TOKEN|WEBHOOK_SECRET)|PUBLIC_SITE_URL \(HTTPS\)|NODE_ENV=production)$/.test(field));
    if (fields.length) message += ' Falta: ' + fields.join(', ') + '.';
  }
  return `${value.mode === 'production' ? 'Producción' : 'Pruebas'}: ${message} No se modificó la configuración de pagos.`;
}

let unauthorized: (() => void) | undefined;
let readAuthEpoch: (() => number) | undefined;
/** Register a generation reader so an old response cannot expire a newer login. */
export function onUnauthorized(handler: () => void, getEpoch?: () => number): void {
  unauthorized = handler;
  readAuthEpoch = getEpoch;
}

export interface RequestOptions { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; csrf?: string; expireOnUnauthorized?: boolean; ifMatch?: number; idempotencyKey?: string }
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid API path');
  const expire = unauthorized;
  const getEpoch = readAuthEpoch;
  const requestEpoch = getEpoch?.();
  const headers: Record<string, string> = {};
  const multipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
  if (options.ifMatch !== undefined) headers['If-Match'] = String(options.ifMatch);
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (options.csrf) headers['X-CSRF-Token'] = options.csrf;
  const method = options.method ?? 'GET';
  const paymentCheck = path === '/admin/settings/payments/verify' && method === 'POST';
  const readOnly = method === 'GET' || paymentCheck;
  const checkState = path.startsWith('/admin/catalog/') ? 'revisá el catálogo' : path.startsWith('/admin/orders/') ? 'revisá el pedido y sus comprobantes' : path === '/admin/settings' || path.startsWith('/admin/settings/') ? 'revisá los ajustes de la tienda' : 'revisá el estado de tu sesión';
  const writeOutcomeUnknown = `No se pudo confirmar el resultado. La operación podría haberse completado; ${checkState} antes de reintentar.`;
  const connectionError = 'No se pudo conectar con el servicio. Revisá la conexión e intentá nuevamente.';
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : multipart ? options.body as FormData : JSON.stringify(options.body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, readOnly ? connectionError : writeOutcomeUnknown);
  }
  if (!response.ok) {
    if (response.status === 401 && options.expireOnUnauthorized !== false && (!getEpoch || requestEpoch === getEpoch())) expire?.();
    const message = errorMessage(response.status);
    let code: string | undefined;
    if (response.status === 503 && (paymentCheck || path === '/admin/settings/payments' && method === 'PUT')) {
      const detail = paymentVerificationMessage(await response.json().catch(() => null));
      if (detail) throw new ApiError(503, detail, 'PAYMENT_VERIFICATION_FAILED');
    }
    if (response.status === 409 && method === 'POST' && /^\/admin\/catalog\/products\/[^/?]+\/publish$/.test(path)) {
      const reason = await response.json().catch(() => null);
      if (reason?.code === 'PUBLICATION_INCOMPLETE' && Array.isArray(reason.missing)) {
        const labels = { name: 'nombre', cover: 'foto de portada', price: 'precio de una opción vigente' };
        const missing = (Object.keys(labels) as (keyof typeof labels)[]).filter(key => reason.missing.includes(key));
        if (missing.length) throw new ApiError(409, 'Para publicar falta: ' + missing.map(key => labels[key]).join(', ') + '.', reason.code);
      }
    }
    if (method === 'POST' && /^\/admin\/catalog\/products\/[^/?]+\/images$/.test(path) && [409, 413, 503].includes(response.status)) {
      try {
        const body: unknown = await response.json();
        const candidate = typeof body === 'object' && body !== null && 'message' in body ? body.message : undefined;
        if ((response.status === 413 && candidate === 'OUTPUT_TOO_LARGE') ||
            (response.status === 409 && candidate === 'MEDIA_QUOTA_EXCEEDED') ||
            (response.status === 503 && candidate === 'MEDIA_PACKET_TOO_SMALL')) code = candidate;
      } catch { /* Unrecognized error bodies remain generic. */ }
    }
    if (path.startsWith('/admin/settings/content') && response.status === 409) throw new ApiError(409, 'El contenido cambió en otra pestaña. Se conserva tu borrador; recargá antes de volver a guardar.');
    if (path.startsWith('/admin/settings/content') && response.status === 400) {
      const body = await response.json().catch(() => null);
      if (typeof body?.message === 'string' && body.message.length < 250 && (/^Revisá el campo «[a-zA-Z0-9.-]+»\.$/.test(body.message) || /^Constructor: [^<>]+\.$/.test(body.message) || body.message === 'El contenido supera el límite de 80.000 caracteres.')) throw new ApiError(400, body.message);
    }
    throw new ApiError(response.status, !readOnly && response.status >= 500 ? `${message} ${writeOutcomeUnknown}` : message, code);
  }
  let text: string;
  try { text = await response.text(); }
  catch { throw new ApiError(0, readOnly ? connectionError : writeOutcomeUnknown); }
  // Only Nest archive endpoints are allowed to succeed without a body.
  const archive = method === 'DELETE' && /^\/admin\/catalog\/(?:products\/[^/?]+(?:\/variants\/[^/?]+)?|(?:categories|materials|colors)\/[^/?]+)$/.test(path);
  if (!text && archive && (response.status === 200 || response.status === 204)) return undefined as T;
  if (!text) throw new ApiError(502, readOnly ? 'El servicio devolvió una respuesta vacía.' : writeOutcomeUnknown);
  try { return JSON.parse(text) as T; }
  catch { throw new ApiError(502, readOnly ? 'El servicio devolvió una respuesta inválida.' : writeOutcomeUnknown); }
}
