/** Pure safety policy; importing this module never connects to a database. */
export function checkoutHarnessPolicy(env: NodeJS.ProcessEnv) {
  if (env.CHECKOUT_BROWSER_E2E !== '1') throw new Error('CHECKOUT_BROWSER_E2E=1 required');
  if (env.NODE_ENV !== 'development' || env.LOCAL_TEST_CHECKOUT_ENABLED !== 'true') throw new Error('Explicit local checkout test mode required');
  if (env.DB_HOST !== '127.0.0.1' || env.DB_DATABASE !== 'store_integration_test') throw new Error('Requires 127.0.0.1/store_integration_test');
  if (env.DB_PORT !== '3306' || env.DB_USERNAME !== 'root' || env.DB_PASSWORD !== '' || env.DB_ALLOW_EMPTY_PASSWORD !== '1') throw new Error('Requires the authorized local test account');
  if (env.ZIPNOVA_ENABLED !== undefined && env.ZIPNOVA_ENABLED !== 'false') throw new Error('ZIPNOVA_ENABLED must be absent or false');
  if (Object.keys(env).some(key => /^ZIPNOVA_/i.test(key) && key !== 'ZIPNOVA_OPERATOR_ORIGIN' && key !== 'ZIPNOVA_ENABLED')) throw new Error('Remove inherited ZIPNOVA variables');
  const parsePort = (raw: string | undefined, label: string) => {
    if (!raw || !/^[1-9]\d*$/.test(raw) || Number(raw) > 65535) throw new Error(`${label} must be a TCP port`);
    return Number(raw);
  };
  const port = parsePort(env.PORT, 'PORT');
  if (env.DB_PORT) parsePort(env.DB_PORT, 'DB_PORT');
  let origin: URL;
  try { origin = new URL(env.ZIPNOVA_OPERATOR_ORIGIN ?? ''); } catch { throw new Error('Local operator origin required'); }
  if (env.ZIPNOVA_OPERATOR_ORIGIN !== origin.origin || origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Operator origin must be http://127.0.0.1:<port>');
  parsePort(origin.port, 'operator port');
  if (Number(origin.port) === port) throw new Error('API and operator ports must differ');
  return { port, origin: origin.origin };
}
