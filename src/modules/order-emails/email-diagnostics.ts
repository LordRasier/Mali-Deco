import { emailReadiness, type EmailConfig } from './email-config';
import { EmailSendError, EnvialoSimple } from './envialosimple';

const explanations: Record<string, string> = {
  provider_http_401: 'EnvíaloSimple rechazó la autenticación (HTTP 401). Revisá la clave API transaccional cargada en este proceso.',
  provider_http_403: 'EnvíaloSimple denegó el acceso (HTTP 403). Revisá los permisos y la cuenta asociados a la clave API.',
  provider_http_429: 'EnvíaloSimple limitó las consultas (HTTP 429). Esperá antes de volver a verificar.',
  provider_dns_error: 'El servidor no pudo resolver api.envialosimple.email. Revisá su conexión y DNS.',
  provider_tls_error: 'Falló la validación del certificado HTTPS. Revisá la fecha del servidor y los certificados de confianza.',
  provider_timeout: 'EnvíaloSimple no respondió dentro del tiempo límite.',
  provider_network_error: 'No se pudo completar la conexión HTTPS con EnvíaloSimple.',
  provider_invalid_response: 'La API devolvió una respuesta que no se pudo interpretar.',
  provider_invalid_domains: 'La API devolvió un listado de dominios con un formato inesperado.',
  provider_domain_missing: 'El dominio del remitente no aparece entre los dominios consultados con esta clave API.',
  provider_domain_unverified: 'El dominio del remitente no está verificado y habilitado en EnvíaloSimple.',
};

/** Never display provider bodies, fetch messages, credentials or filesystem paths. */
export function emailProviderExplanation(code: string): string {
  return explanations[code] || (/^provider_http_[1-5]\d{2}$/.test(code)
    ? `EnvíaloSimple respondió HTTP ${code.slice(-3)}. Revisá el servicio y la configuración de la cuenta.`
    : 'No se pudo validar la conexión con EnvíaloSimple.');
}

export async function verifyEmailSender(config: EmailConfig, provider: Pick<EnvialoSimple, 'domains'> = new EnvialoSimple(config)) {
  const unavailable = emailReadiness(config);
  if (unavailable) return { ok: false, code: 'configuration_incomplete', message: unavailable + '.' };
  try {
    const name = config.from.split('@')[1].toLowerCase();
    const domain = (await provider.domains()).find(d => d.name.toLowerCase() === name);
    if (domain?.status === 'verified') return { ok: true, code: 'verified', message: 'Clave aceptada y dominio del remitente verificado. No se envió ningún correo.' };
    const code = domain ? 'provider_domain_unverified' : 'provider_domain_missing';
    return { ok: false, code, message: emailProviderExplanation(code) };
  } catch (error) {
    const candidate = error instanceof EmailSendError ? error.code : '';
    const code = Object.hasOwn(explanations, candidate) || /^provider_http_[1-5]\d{2}$/.test(candidate) ? candidate : 'provider_unavailable';
    return { ok: false, code, message: emailProviderExplanation(code) };
  }
}
