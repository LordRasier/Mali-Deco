export function validateDatabaseConfig(env: NodeJS.ProcessEnv) {
  function required(name: string): string {
    const value = env[name];
    if (!value) throw new Error(`${name} is required for MariaDB`);
    return value;
  }
  const port = Number(env.DB_PORT || '3306');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be a valid TCP port');
  }
  const host = required('DB_HOST');
  const emptyAllowed = env.NODE_ENV === 'development' && env.DB_ALLOW_EMPTY_PASSWORD === '1' && host === '127.0.0.1' && env.DB_PASSWORD === '';
  return {
    host, port, username: required('DB_USERNAME'),
    password: emptyAllowed ? '' : required('DB_PASSWORD'), database: required('DB_DATABASE'),
  };
}
