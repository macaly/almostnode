/**
 * Node.js querystring module shim
 * Uses browser's URLSearchParams
 */

export type ParsedUrlQuery = Record<string, string | string[]>;

export function parse(
  str: string,
  sep: string = '&',
  eq: string = '=',
  options?: { maxKeys?: number }
): ParsedUrlQuery {
  const result: ParsedUrlQuery = {};

  if (!str || typeof str !== 'string') {
    return result;
  }

  const maxKeys = options?.maxKeys || 1000;
  const pairs = str.split(sep).slice(0, maxKeys > 0 ? maxKeys : undefined);

  for (const pair of pairs) {
    const idx = pair.indexOf(eq);
    let key: string;
    let value: string;

    if (idx >= 0) {
      key = decodeURIComponent(pair.slice(0, idx).replace(/\+/g, ' '));
      value = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, ' '));
    } else {
      key = decodeURIComponent(pair.replace(/\+/g, ' '));
      value = '';
    }

    if (key in result) {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

export function stringify(
  obj: Record<string, string | string[] | number | boolean | undefined>,
  sep: string = '&',
  eq: string = '='
): string {
  if (!obj || typeof obj !== 'object') {
    return '';
  }

  const pairs: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    const encodedKey = encodeURIComponent(key);

    if (Array.isArray(value)) {
      for (const v of value) {
        pairs.push(`${encodedKey}${eq}${encodeURIComponent(String(v))}`);
      }
    } else {
      pairs.push(`${encodedKey}${eq}${encodeURIComponent(String(value))}`);
    }
  }

  return pairs.join(sep);
}

export function escape(str: string): string {
  return encodeURIComponent(str);
}

export function unescape(str: string): string {
  return decodeURIComponent(str.replace(/\+/g, ' '));
}

export const encode = stringify;
export const decode = parse;

export default {
  parse,
  stringify,
  escape,
  unescape,
  encode,
  decode,
};
