/* global document, fetch, AbortSignal, URL, location, history, window, setInterval */
const root = document.querySelector('[data-tracking]');
if (root) {
  const logo = document.querySelector('.tracking-brand img');
  if (logo) { const checkLogo = () => { logo.hidden = logo.naturalWidth <= 1; }; if (logo.complete) checkLogo(); else logo.addEventListener('load', checkLogo, { once: true }); logo.addEventListener('error', () => { logo.hidden = true; }, { once: true }); }
  const node = name => root.querySelector(`[data-${name}]`);
  const element = (tag, text = '', className = '') => { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; };
  const money = (value, currency) => { const format = new Intl.NumberFormat('es-AR', { style: 'currency', currency }); return format.format(Number(value) / 10 ** format.resolvedOptions().maximumFractionDigits); };
  const date = value => new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value));
  let page = 1, authenticated = false, busy = false, generation = 0;
  function feedback(text = '', error = false) { node('feedback').textContent = text; node('feedback').hidden = !text; node('feedback').classList.toggle('error', error); }
  async function api(path, body) {
    const response = await fetch('/api/v1/order-tracking/' + path, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!response.ok) { const error = new Error('Request unavailable'); error.status = response.status; throw error; }
    return response.json();
  }
  function showAccess() { authenticated = false; page = 1; node('access').hidden = false; node('orders-panel').hidden = true; node('order-list').replaceChildren(); node('account').textContent = ''; }
  function orderCard(order) {
    const card = element('details', '', 'tracking-order'); card.dataset.order = order.id;
    const summary = element('summary'), heading = element('div', '', 'tracking-order-heading'), left = element('div'), right = element('div', '', 'tracking-order-total');
    const reference = element('p', 'Pedido #' + order.reference, 'tracking-reference');
    if (order.test) reference.append(element('span', 'PRUEBA', 'tracking-tag'));
    left.append(reference, element('p', date(order.createdAt), 'tracking-date'));
    right.append(element('div', money(order.totalMinor, order.currency)), element('span', order.status, 'tracking-state' + (order.exception ? ' exception' : '')));
    heading.append(left, right);
    const timeline = element('ol', '', 'tracking-timeline'); timeline.setAttribute('aria-label', 'Progreso del pedido');
    for (const step of order.steps) { const item = element('li', step.label, step.state); if (step.state === 'current' || step.state === 'stopped') item.setAttribute('aria-current', 'step'); timeline.append(item); }
    const toggle = element('span', '', 'tracking-disclosure'), toggleLabel = element('span', 'Ver detalle'), chevron = element('span', '', 'tracking-chevron'); chevron.setAttribute('aria-hidden', 'true'); toggle.append(toggleLabel, chevron);
    summary.append(heading, timeline, toggle);
    const details = element('div', '', 'tracking-details'), grid = element('div', '', 'tracking-detail-grid'), payment = element('section'), delivery = element('section');
    payment.append(element('h3', 'Pago y preparación'), element('p', 'Pago: ' + order.payment), element('p', 'Preparación: ' + order.fulfillment), element('p', 'Comprador: ' + order.customer), element('p', order.email));
    delivery.append(element('h3', 'Entrega'), element('p', order.delivery.carrier + ' · ' + order.delivery.service), element('p', order.shippingStatus), element('p', order.delivery.pickup || order.delivery.address), element('p', order.delivery.city));
    if (order.trackingNumber) delivery.append(element('p', 'Seguimiento: ' + order.trackingNumber));
    if (order.trackingUrl) {
      const url = new URL(order.trackingUrl);
      if (url.protocol === 'https:' && !url.username && !url.password) { const link = element('a', 'Seguir el envío ↗'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; delivery.append(link); }
    }
    grid.append(payment, delivery); details.append(grid, element('h3', 'Tus artículos'));
    for (const item of order.lines) {
      const line = element('div', '', 'tracking-line'), product = element('span', item.name);
      product.append(element('small', [item.variant, `${item.quantity} × ${money(item.unitPriceMinor, order.currency)}`].filter(Boolean).join(' · ')));
      line.append(product, element('span', money(item.lineTotalMinor, order.currency))); details.append(line);
    }
    const totals = element('div', '', 'tracking-totals');
    const subtotal = order.lines.reduce((sum, item) => sum + BigInt(item.lineTotalMinor), 0n).toString();
    for (const [label, value] of [['Artículos', subtotal], ['Envío', order.delivery.amountMinor], ['Total', order.totalMinor]]) {
      const row = element('p'); row.append(element('span', label), element('span', money(value, order.currency))); totals.append(row);
    }
    details.append(totals, element('p', 'Última actualización: ' + date(order.updatedAt), 'tracking-note'));
    card.append(summary, details); card.addEventListener('toggle', () => { toggleLabel.textContent = card.open ? 'Ocultar detalle' : 'Ver detalle'; });
    return card;
  }
  async function load(requestedPage = page, initial = false) {
    if (busy) return;
    busy = true; const epoch = generation;
    node('refresh').disabled = true;
    try {
      const result = await api('orders', { page: requestedPage }); if (epoch !== generation) return;
      const open = new Set([...root.querySelectorAll('details[open]')].map(el => el.dataset.order));
      const cards = result.items.map(order => { const card = orderCard(order); card.open = open.has(order.id); return card; });
      node('order-list').replaceChildren(...cards);
      if (!cards.length) node('order-list').append(element('p', 'Todavía no hay pedidos para mostrar con este acceso.', 'tracking-empty'));
      page = result.page; authenticated = true; node('access').hidden = true; node('orders-panel').hidden = false;
      node('account').textContent = result.email + ' · ' + result.total + (result.total === 1 ? ' pedido' : ' pedidos');
      const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
      node('pagination').hidden = pages <= 1; node('previous').disabled = page <= 1; node('next').disabled = page >= pages;
      node('page').textContent = `${page} de ${pages}`; feedback();
    } catch (error) {
      if (epoch !== generation) return;
      if (error.status === 403) { showAccess(); feedback(initial ? '' : 'Tu acceso venció. Abrí de nuevo el enlace del correo o pedí uno nuevo.', !initial); }
      else { if (initial) showAccess(); feedback('No pudimos actualizar los pedidos. Intentá nuevamente en unos momentos.', true); }
    } finally { busy = false; node('refresh').disabled = false; }
  }
  node('request-form').addEventListener('submit', async event => {
    event.preventDefault(); if (node('request-button').disabled || !event.currentTarget.reportValidity()) return;
    node('request-button').disabled = true; feedback('Estamos registrando tu solicitud…');
    try { const result = await api('request', { email: event.currentTarget.elements.email.value.trim() }); feedback(result.message); }
    catch { feedback('No pudimos confirmar la solicitud. Revisá tu correo y, si no recibís el enlace, intentá más tarde.', true); }
    finally { node('request-button').disabled = false; }
  });
  node('refresh').addEventListener('click', () => { void load(); });
  node('previous').addEventListener('click', () => { if (page > 1) void load(page - 1); });
  node('next').addEventListener('click', () => { void load(page + 1); });
  node('logout').addEventListener('click', async () => {
    node('logout').disabled = true; generation++;
    try { await api('logout', {}); showAccess(); feedback('Cerraste el acceso en este navegador. El enlace de tu correo sigue siendo válido.'); }
    catch { feedback('No pudimos cerrar el acceso. Intentá nuevamente.', true); }
    finally { node('logout').disabled = false; }
  });
  async function start() {
    const token = location.hash === '#main' ? '' : location.hash.slice(1);
    // Remove the capability before any API request; never put it in query strings, storage or analytics.
    if (location.hash) history.replaceState(null, '', location.pathname);
    if (token) {
      if (!/^[a-f0-9]{64}$/.test(token)) { showAccess(); feedback('El enlace no es válido. Pedí uno nuevo con el correo de tu compra.', true); return; }
      try { await api('access', { token }); } catch { showAccess(); feedback('No pudimos abrir este enlace. Si venció, pedí uno nuevo.', true); return; }
    }
    await load(1, true);
  }
  window.addEventListener('pageshow', event => { if (event.persisted) { generation++; showAccess(); void load(1, true); } });
  setInterval(() => { if (authenticated && !document.hidden && !node('logout').disabled) void load(); }, 60000);
  void start();
}
