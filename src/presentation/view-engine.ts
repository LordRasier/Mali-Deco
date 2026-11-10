import { createRequire } from 'node:module';

/** Minimal boundary for the untyped hbs package; the rest of the app uses plain view models. */
export interface ViewEngine {
  __express(path: string, options: Record<string, unknown>, callback: (error: Error | null, html?: string) => void): void;
  registerPartial(name: string, source: string): void;
}

interface HbsFactory {
  create(handlebars: null, options: {
    compileOptions: { noEscape: boolean };
    runtimeOptions: { allowProtoMethodsByDefault: boolean; allowProtoPropertiesByDefault: boolean };
  }): ViewEngine;
}

export function createViewEngine(partials: Readonly<Record<string, string>>): ViewEngine {
  const hbs = createRequire(__filename)('hbs') as HbsFactory;
  // hbs enables prototype access by default. Opt out explicitly and keep each app isolated.
  // Source: https://github.com/pillarjs/hbs#handlebars
  const engine = hbs.create(null, {
    compileOptions: { noEscape: false },
    runtimeOptions: { allowProtoMethodsByDefault: false, allowProtoPropertiesByDefault: false },
  });
  for (const [name, source] of Object.entries(partials)) engine.registerPartial(name, source);
  return engine;
}
