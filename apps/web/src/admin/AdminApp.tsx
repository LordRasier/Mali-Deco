'use client';

import { FormEvent, useState } from 'react';
import { Catalog } from './Catalog';
import { SessionProvider, useSession, canManageCatalog } from './session';

function Login() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      setPassword('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <span className="eyebrow">Administración de la tienda</span>
        <h1>Bienvenida al taller</h1>
        <p>Ingresá con tu cuenta de administración para gestionar el catálogo.</p>
        <form onSubmit={submit} className="admin-form">
          <label>
            Correo electrónico
            <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Contraseña
            <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="notice error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
        <a href="/">← Volver a la tienda</a>
      </div>
    </main>
  );
}

function AdminContent() {
  const { status, user, error, retry, logout } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  async function signOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
    } catch (failure) {
      setLogoutError(failure instanceof Error ? failure.message : 'No se pudo cerrar la sesión.');
    } finally {
      setLoggingOut(false);
    }
  }

  if (status === 'loading') return <main className="center-state" role="status">Comprobando sesión…</main>;
  if (status === 'anonymous') return <Login />;
  if (status === 'error') {
    return (
      <main className="center-state">
        <div>
          <h1>No pudimos comprobar la sesión</h1>
          <p role="alert">{error}</p>
          <button onClick={retry}>Reintentar</button>
        </div>
      </main>
    );
  }
  if (!user) return null;

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <a className="brand" href="/">TIENDA</a><span className="header-divider">/</span><span>Administración</span>
        </div>
        <div className="header-account">
          <span>{user.email} · {user.role}</span>
          <button className="text-button" onClick={signOut} disabled={loggingOut}>
            {loggingOut ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </div>
      </header>
      {logoutError && <p className="notice error shell-notice" role="alert">{logoutError}</p>}
      {canManageCatalog(user) ? <Catalog /> : (
        <main className="admin-main">
          <span className="eyebrow">Acceso limitado</span>
          <h1>Catálogo no disponible</h1>
          <p>Tu rol no tiene permiso para gestionar artículos. El servidor controla los permisos de cada operación.</p>
        </main>
      )}
    </div>
  );
}

export function AdminApp() {
  return (
    <div className="admin-root">
      <SessionProvider><AdminContent /></SessionProvider>
    </div>
  );
}
