/** Browser-only same-origin API transport. Never accepts an upstream URL or retries writes. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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

let unauthorized: (() => void) | undefined;
let readAuthEpoch: (() => number) | undefined;
/** Register a generation reader so an old response cannot expire a newer login. */
export function onUnauthorized(handler: () => void, getEpoch?: () => number): void {
  unauthorized = handler;
  readAuthEpoch = getEpoch;
}

export interface RequestOptions { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; csrf?: string; expireOnUnauthorized?: boolean }
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid API path');
  const expire = unauthorized;
  const getEpoch = readAuthEpoch;
  const requestEpoch = getEpoch?.();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.csrf) headers['X-CSRF-Token'] = options.csrf;
  const method = options.method ?? 'GET';
  const checkState = path.startsWith('/admin/catalog/') ? 'revisá el catálogo' : 'revisá el estado de tu sesión';
  const writeOutcomeUnknown = `No se pudo confirmar el resultado. La operación podría haberse completado; ${checkState} antes de reintentar.`;
  const connectionError = 'No se pudo conectar con el servicio. Revisá la conexión e intentá nuevamente.';
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, method === 'GET' ? connectionError : writeOutcomeUnknown);
  }
  if (!response.ok) {
    if (response.status === 401 && options.expireOnUnauthorized !== false && (!getEpoch || requestEpoch === getEpoch())) expire?.();
    const message = errorMessage(response.status);
    throw new ApiError(response.status, method !== 'GET' && response.status >= 500 ? `${message} ${writeOutcomeUnknown}` : message);
  }
  let text: string;
  try { text = await response.text(); }
  catch { throw new ApiError(0, method === 'GET' ? connectionError : writeOutcomeUnknown); }
  // Only Nest archive endpoints are allowed to succeed without a body.
  const archive = method === 'DELETE' && /^\/admin\/catalog\/(?:products\/[^/?]+(?:\/variants\/[^/?]+)?|(?:categories|materials|colors)\/[^/?]+)$/.test(path);
  if (!text && archive && (response.status === 200 || response.status === 204)) return undefined as T;
  if (!text) throw new ApiError(502, method === 'GET' ? 'El servicio devolvió una respuesta vacía.' : writeOutcomeUnknown);
  try { return JSON.parse(text) as T; }
  catch { throw new ApiError(502, method === 'GET' ? 'El servicio devolvió una respuesta inválida.' : writeOutcomeUnknown); }
}
