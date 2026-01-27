/**
 * vm shim - Basic VM functionality using eval
 */

export class Script {
  private code: string;

  constructor(code: string, _options?: object) {
    this.code = code;
  }

  runInThisContext(_options?: object): unknown {
    return eval(this.code);
  }

  runInNewContext(contextObject?: object, _options?: object): unknown {
    const keys = contextObject ? Object.keys(contextObject) : [];
    const values = contextObject ? Object.values(contextObject) : [];
    const fn = new Function(...keys, `return eval(${JSON.stringify(this.code)})`);
    return fn(...values);
  }

  runInContext(_context: object, _options?: object): unknown {
    return this.runInNewContext(_context, _options);
  }

  createCachedData(): Buffer {
    return Buffer.from('');
  }
}

export function createContext(contextObject?: object, _options?: object): object {
  return contextObject || {};
}

export function isContext(_sandbox: object): boolean {
  return true;
}

export function runInThisContext(code: string, _options?: object): unknown {
  return eval(code);
}

export function runInNewContext(code: string, contextObject?: object, _options?: object): unknown {
  const script = new Script(code);
  return script.runInNewContext(contextObject);
}

export function runInContext(code: string, context: object, _options?: object): unknown {
  return runInNewContext(code, context);
}

export function compileFunction(code: string, params?: string[], _options?: object): Function {
  return new Function(...(params || []), code);
}

export class Module {
  constructor(_code: string, _options?: object) {}
  link(_linker: unknown): Promise<void> { return Promise.resolve(); }
  evaluate(_options?: object): Promise<unknown> { return Promise.resolve(); }
  get status(): string { return 'unlinked'; }
  get identifier(): string { return ''; }
  get context(): object { return {}; }
  get namespace(): object { return {}; }
}

export class SourceTextModule extends Module {}
export class SyntheticModule extends Module {
  setExport(_name: string, _value: unknown): void {}
}

export default {
  Script,
  createContext,
  isContext,
  runInThisContext,
  runInNewContext,
  runInContext,
  compileFunction,
  Module,
  SourceTextModule,
  SyntheticModule,
};
