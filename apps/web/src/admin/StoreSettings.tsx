'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiRequest } from './api';
import { useSession } from './session';

type Settings = { name: string | null };
function validResponse(value: unknown): value is Settings {
  return !!value && typeof value === 'object' && 'name' in value && (typeof value.name === 'string' || value.name === null);
}

export function StoreSettings() {
  const { csrf } = useSession();
  const [name, setName] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true); setError(''); setLoaded(false);
    apiRequest<unknown>('/admin/settings').then(value => {
      if (!validResponse(value)) throw new Error('El servicio devolvió ajustes inválidos.');
      if (current) { setName(value.name ?? ''); setLoaded(true); }
    }).catch(failure => { if (current) setError(failure instanceof Error ? failure.message : 'No se pudieron cargar los ajustes.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [revision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !csrf || !loaded) return;
    const value = name.trim();
    if (!value || Array.from(value).length > 255 || /[\p{Cc}\uD800-\uDFFF]/u.test(name)) {
      setError('Ingresá un nombre de entre 1 y 255 caracteres, sin controles.'); return;
    }
    setBusy(true); setError(''); setSaved(false);
    try {
      const response = await apiRequest<unknown>('/admin/settings', { method: 'PUT', body: { name: value }, csrf });
      if (!validResponse(response) || response.name !== value) throw new Error('No se pudo confirmar el nombre guardado. Recargá los ajustes antes de reintentar.');
      setName(response.name); setSaved(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudieron guardar los ajustes.'); }
    finally { setBusy(false); }
  }

  return <section className="panel settings-panel" aria-labelledby="settings-title">
    <div className="section-heading"><div><span className="eyebrow">Configuración inicial</span><h2 id="settings-title">Nombre de la tienda</h2><p>Elegí el nombre que verán tus visitantes. Podés cambiarlo después.</p></div></div>
    {loading && <p role="status">Cargando ajustes…</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {!loading && !loaded && <button type="button" onClick={() => setRevision(value => value + 1)}>Reintentar</button>}
    {!loading && loaded && error && <button type="button" disabled={busy} onClick={() => setRevision(value => value + 1)}>Recargar ajustes</button>}
    {loaded && <form className="admin-form" onSubmit={save}>
      <label>Nombre visible<input value={name} maxLength={510} onChange={event => { setName(event.target.value); setSaved(false); }} required /></label>
      <div><button className="primary" type="submit" disabled={busy || !csrf}>{busy ? 'Guardando…' : 'Guardar nombre'}</button></div>
      {saved && <p role="status">Nombre guardado.</p>}
    </form>}
  </section>;
}
