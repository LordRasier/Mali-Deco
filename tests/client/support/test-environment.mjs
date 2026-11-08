/** Node otherwise treats nested --test processes as recursive runners and silently skips them. */
export function childEnvironment(parent = globalThis.process.env) {
  const env = { ...parent };
  delete env.NODE_TEST_CONTEXT;
  return env;
}
