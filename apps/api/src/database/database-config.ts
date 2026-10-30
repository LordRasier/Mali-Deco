export function validateDatabaseConfig(env: NodeJS.ProcessEnv) {
  function required(name: string): string {
    const value = env[name];
    if (!value) throw new Error(`${name} is required for MySQL`);
    return value;
  }
  const port = Number(env.DB_PORT || '3306');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be a valid TCP port');
  }
  return {
    host: required('DB_HOST'), port, username: required('DB_USERNAME'),
    password: required('DB_PASSWORD'), database: required('DB_DATABASE'),
  };
}
