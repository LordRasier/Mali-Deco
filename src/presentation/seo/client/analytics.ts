import { analyticsConsent, type Consent } from './consent';
import { measurementLocation } from './measurement-location';

type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; [key: `ga-disable-${string}`]: boolean };
export function mountAnalytics() {
  const script = document.querySelector<HTMLScriptElement>('script[data-site-analytics]');
  if (!script || document.querySelector('[data-analytics-preferences]')) return;
  const mode = script.dataset.siteAnalytics, id = script.dataset.measurementId || '';
  if ((mode !== 'ga4' && mode !== 'gtm') || !(mode === 'ga4' ? /^G-[A-Z0-9]{6,20}$/ : /^GTM-[A-Z0-9]{4,20}$/).test(id)) return;
  if (/^\/(admin|api|carrito|checkout)(\/|$)/.test(location.pathname)) return;
  const w = window as unknown as AnalyticsWindow;
  const storage = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) };
  const consent = analyticsConsent(storage, `mali-analytics-v1:${mode}:${id}`);
  let choice = consent.read(), loaded = false;
  const pageLocation = measurementLocation(location.href);
  const referrer = (() => { try { return new URL(document.referrer).origin + '/'; } catch { return ''; } })();
  const emit = (event: string, data: Record<string, unknown>) => {
    if (choice !== 'accepted' || !loaded) return;
    if (mode === 'ga4') w.gtag?.('event', event, data);
    else w.dataLayer?.push({ event, ...data });
  };
  function load() {
    if (loaded || choice !== 'accepted') return;
    loaded = true; w.dataLayer = w.dataLayer || [];
    // Google consumes an Arguments object, not a rest-parameter array.
    // eslint-disable-next-line prefer-rest-params
    w.gtag = function () { w.dataLayer!.push(arguments); };
    w.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    w.gtag('set', { page_location: pageLocation, page_referrer: referrer, allow_google_signals: false, allow_ad_personalization_signals: false });
    const external = document.createElement('script'); external.async = true; external.nonce = script!.nonce;
    if (mode === 'ga4') {
      w.gtag('js', new Date()); w.gtag('config', id, { send_page_view: true, page_location: pageLocation, page_referrer: referrer, allow_google_signals: false, allow_ad_personalization_signals: false });
      external.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    } else {
      w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js', page_location: pageLocation, page_referrer: referrer });
      external.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
    }
    document.head.append(external);
  }
  const panel = document.createElement('section'); panel.className = 'analytics-consent'; panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'analytics-choice-title'); panel.setAttribute('data-analytics-preferences', '');
  const title = document.createElement('h2'); title.id = 'analytics-choice-title'; title.textContent = 'Preferencias de medición';
  const text = document.createElement('p'); text.textContent = 'Con tu permiso usamos Google Analytics para entender cómo se visita la tienda. Podés comprar y navegar sin aceptar, y cambiar tu elección cuando quieras.';
  const privacy = document.createElement('a'); privacy.href = '/politica-de-privacidad'; privacy.textContent = 'Política de privacidad';
  const controls = document.createElement('div'); controls.className = 'analytics-consent-actions';
  const reject = document.createElement('button'); reject.type = 'button'; reject.textContent = 'Rechazar';
  const accept = document.createElement('button'); accept.type = 'button'; accept.textContent = 'Aceptar medición';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Cerrar'; close.hidden = !choice;
  controls.append(reject, accept, close); panel.append(title, text, privacy, controls); document.body.append(panel);
  const preferences = document.createElement('button'); preferences.type = 'button'; preferences.className = 'analytics-preferences-link'; preferences.textContent = 'Preferencias de medición';
  (document.querySelector('.site-footer-bottom') || document.body).append(preferences);
  preferences.addEventListener('click', () => { panel.hidden = false; close.hidden = !choice; reject.focus(); });
  close.addEventListener('click', () => { panel.hidden = true; preferences.focus(); });
  function choose(next: Consent) {
    consent.save(next); choice = next; panel.hidden = true; preferences.focus();
    if (next === 'accepted') { load(); return; }
    if (loaded) {
      w.gtag?.('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      if (mode === 'ga4') w[`ga-disable-${id}`] = true;
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.trim().split('=')[0]; if (!/^_ga(?:_|$)/.test(name)) continue;
        document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
        const parts = location.hostname.split('.');
        for (let i = 0; i < parts.length - 1; i++) document.cookie = `${name}=; Max-Age=0; path=/; domain=${parts.slice(i).join('.')}; SameSite=Lax`;
      }
      location.reload();
    }
  }
  reject.addEventListener('click', () => choose('rejected')); accept.addEventListener('click', () => choose('accepted'));
  document.addEventListener('click', event => {
    const link = (event.target as Element | null)?.closest?.('a[href]'); if (!link) return;
    const href = link.getAttribute('href') || '';
    const channel = /^https:\/\/wa\.me\//.test(href) ? 'whatsapp' : /^https:\/\/(www\.)?instagram\.com\//.test(href) ? 'instagram' : /^mailto:/.test(href) ? 'email' : '';
    if (channel) emit('contact_click', { contact_channel: channel, page_path: location.pathname });
  });
  window.addEventListener('storage', event => { if ((event.key === null || event.key === `mali-analytics-v1:${mode}:${id}`) && consent.read() !== choice) location.reload(); });
  window.addEventListener('pageshow', event => { if (event.persisted && consent.read() !== choice) location.reload(); });
  if (choice === 'accepted') load(); else if (!choice) panel.hidden = false;
}

if (typeof document !== 'undefined') mountAnalytics();
