/**
 * Node.js assert module shim
 * Provides assertion testing utilities
 */

/**
 * AssertionError class - thrown when an assertion fails
 */
export class AssertionError extends Error {
  actual: unknown;
  expected: unknown;
  operator: string;
  generatedMessage: boolean;
  code: string = 'ERR_ASSERTION';

  constructor(options: {
    message?: string;
    actual?: unknown;
    expected?: unknown;
    operator?: string;
    stackStartFn?: Function;
  }) {
    const message = options.message ||
      `${JSON.stringify(options.actual)} ${options.operator || '=='} ${JSON.stringify(options.expected)}`;
    super(message);
    this.name = 'AssertionError';
    this.actual = options.actual;
    this.expected = options.expected;
    this.operator = options.operator || '';
    this.generatedMessage = !options.message;

    // Capture stack trace, excluding the constructor
    if (Error.captureStackTrace && options.stackStartFn) {
      Error.captureStackTrace(this, options.stackStartFn);
    }
  }
}

/**
 * Deep equality check
 */
function isDeepStrictEqual(actual: unknown, expected: unknown): boolean {
  // Same reference or primitive equality
  if (actual === expected) {
    return true;
  }

  // Handle null/undefined
  if (actual === null || expected === null || actual === undefined || expected === undefined) {
    return actual === expected;
  }

  // Type check
  if (typeof actual !== typeof expected) {
    return false;
  }

  // NaN check
  if (typeof actual === 'number' && Number.isNaN(actual) && Number.isNaN(expected as number)) {
    return true;
  }

  // Date comparison
  if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();
  }

  // RegExp comparison
  if (actual instanceof RegExp && expected instanceof RegExp) {
    return actual.source === expected.source && actual.flags === expected.flags;
  }

  // Array comparison
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      return false;
    }
    for (let i = 0; i < actual.length; i++) {
      if (!isDeepStrictEqual(actual[i], expected[i])) {
        return false;
      }
    }
    return true;
  }

  // Buffer/Uint8Array comparison
  if (actual instanceof Uint8Array && expected instanceof Uint8Array) {
    if (actual.length !== expected.length) {
      return false;
    }
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) {
        return false;
      }
    }
    return true;
  }

  // Map comparison
  if (actual instanceof Map && expected instanceof Map) {
    if (actual.size !== expected.size) {
      return false;
    }
    const actualEntries = Array.from(actual.entries());
    for (let i = 0; i < actualEntries.length; i++) {
      const [key, value] = actualEntries[i];
      if (!expected.has(key) || !isDeepStrictEqual(value, expected.get(key))) {
        return false;
      }
    }
    return true;
  }

  // Set comparison
  if (actual instanceof Set && expected instanceof Set) {
    if (actual.size !== expected.size) {
      return false;
    }
    const actualValues = Array.from(actual.values());
    const expectedValues = Array.from(expected.values());
    for (let i = 0; i < actualValues.length; i++) {
      const value = actualValues[i];
      if (!expected.has(value)) {
        // For objects, need deep comparison
        let found = false;
        for (let j = 0; j < expectedValues.length; j++) {
          if (isDeepStrictEqual(value, expectedValues[j])) {
            found = true;
            break;
          }
        }
        if (!found) return false;
      }
    }
    return true;
  }

  // Object comparison
  if (typeof actual === 'object' && typeof expected === 'object') {
    const actualKeys = Object.keys(actual as object);
    const expectedKeys = Object.keys(expected as object);

    if (actualKeys.length !== expectedKeys.length) {
      return false;
    }

    for (const key of actualKeys) {
      if (!Object.prototype.hasOwnProperty.call(expected, key)) {
        return false;
      }
      if (!isDeepStrictEqual(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key]
      )) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * Main assert function - tests if value is truthy
 */
function assert(value: unknown, message?: string | Error): asserts value {
  if (!value) {
    if (message instanceof Error) {
      throw message;
    }
    throw new AssertionError({
      message: message || 'The expression evaluated to a falsy value',
      actual: value,
      expected: true,
      operator: '==',
      stackStartFn: assert,
    });
  }
}

/**
 * Alias for assert()
 */
assert.ok = function ok(value: unknown, message?: string | Error): asserts value {
  if (!value) {
    if (message instanceof Error) {
      throw message;
    }
    throw new AssertionError({
      message: message || 'The expression evaluated to a falsy value',
      actual: value,
      expected: true,
      operator: '==',
      stackStartFn: ok,
    });
  }
};

/**
 * Tests strict equality (===)
 */
assert.strictEqual = function strictEqual(
  actual: unknown,
  expected: unknown,
  message?: string | Error
): void {
  if (actual !== expected) {
    if (message instanceof Error) {
      throw message;
    }
    throw new AssertionError({
      message,
      actual,
      expected,
      operator: '===',
      stackStartFn: strictEqual,
    });
  }
};

/**
 * Tests strict inequality (!==)
 */
assert.notStrictEqual = function notStrictEqual(
  actual: unknown,
  expected: unknown,
  message?: string | Error
): void {
  if (actual === expected) {
    if (message instanceof Error) {
      throw message;
    }
    throw new AssertionError({
      message,
      actual,
      expected,
      operator: '!==',
      stackStartFn: notStrictEqual,
    });
  }
};

/**
 * Tests deep strict equality
 */
assert.deepStrictEqual = function deepStrictEqual<T>(
  actual: T,
  expected: T,
  message?: string | Error
): void {
  if (!isDeepStrictEqual(actual, expected)) {
    if (message instanceof Error) {
      throw message;
    }
    throw new AssertionError({
      message,
      actual,
      expected,
      operator: 'deepStrictEqual',
      stackStartFn: deepStrictEqual,
    });
  }
};

/**
 * Tests deep strict inequality
 */
assert.notDeepStrictEqual = function notDeepStrictEqual<T>(
  actual: T,
  expected: T,
  message?: string | Error
): void {
  if (isDeepStrictEqual(actual, expected)) {
    if (message instanceof Error) {
      throw message;
    }
    throw new AssertionError({
      message,
      actual,
      expected,
      operator: 'notDeepStrictEqual',
      stackStartFn: notDeepStrictEqual,
    });
  }
};

/**
 * Expects function to throw an error
 */
assert.throws = function throws(
  fn: () => unknown,
  errorOrMessage?: RegExp | Function | Error | { message?: RegExp | string; code?: string } | string,
  message?: string
): void {
  let threw = false;
  let thrownError: unknown;

  try {
    fn();
  } catch (err) {
    threw = true;
    thrownError = err;
  }

  if (!threw) {
    throw new AssertionError({
      message: typeof errorOrMessage === 'string' ? errorOrMessage : (message || 'Expected function to throw'),
      actual: undefined,
      expected: errorOrMessage,
      operator: 'throws',
      stackStartFn: throws,
    });
  }

  // Validate the thrown error if a validator was provided
  if (errorOrMessage !== undefined && typeof errorOrMessage !== 'string') {
    if (errorOrMessage instanceof RegExp) {
      const errMessage = thrownError instanceof Error ? thrownError.message : String(thrownError);
      if (!errorOrMessage.test(errMessage)) {
        throw new AssertionError({
          message: message || `The error message did not match the regular expression`,
          actual: thrownError,
          expected: errorOrMessage,
          operator: 'throws',
          stackStartFn: throws,
        });
      }
    } else if (typeof errorOrMessage === 'function') {
      if (!(thrownError instanceof (errorOrMessage as new (...args: unknown[]) => Error))) {
        throw new AssertionError({
          message: message || `The error is not an instance of the expected type`,
          actual: thrownError,
          expected: errorOrMessage,
          operator: 'throws',
          stackStartFn: throws,
        });
      }
    } else if (typeof errorOrMessage === 'object') {
      const expected = errorOrMessage as { message?: RegExp | string; code?: string };
      const err = thrownError as Error & { code?: string };

      if (expected.message !== undefined) {
        const errMsg = err.message || String(thrownError);
        if (expected.message instanceof RegExp) {
          if (!expected.message.test(errMsg)) {
            throw new AssertionError({
              message: message || `The error message did not match`,
              actual: errMsg,
              expected: expected.message,
              operator: 'throws',
              stackStartFn: throws,
            });
          }
        } else if (errMsg !== expected.message) {
          throw new AssertionError({
            message: message || `The error message did not match`,
            actual: errMsg,
            expected: expected.message,
            operator: 'throws',
            stackStartFn: throws,
          });
        }
      }

      if (expected.code !== undefined && err.code !== expected.code) {
        throw new AssertionError({
          message: message || `The error code did not match`,
          actual: err.code,
          expected: expected.code,
          operator: 'throws',
          stackStartFn: throws,
        });
      }
    }
  }
};

/**
 * Expects function to not throw an error
 */
assert.doesNotThrow = function doesNotThrow(
  fn: () => unknown,
  errorOrMessage?: RegExp | Function | string,
  message?: string
): void {
  try {
    fn();
  } catch (err) {
    // If no validator provided, any throw is a failure
    if (errorOrMessage === undefined || typeof errorOrMessage === 'string') {
      throw new AssertionError({
        message: typeof errorOrMessage === 'string' ? errorOrMessage : (message || 'Expected function not to throw'),
        actual: err,
        expected: undefined,
        operator: 'doesNotThrow',
        stackStartFn: doesNotThrow,
      });
    }

    // If validator provided, only matching errors are failures
    if (errorOrMessage instanceof RegExp) {
      const errMessage = err instanceof Error ? err.message : String(err);
      if (errorOrMessage.test(errMessage)) {
        throw new AssertionError({
          message: message || 'Expected function not to throw matching error',
          actual: err,
          expected: errorOrMessage,
          operator: 'doesNotThrow',
          stackStartFn: doesNotThrow,
        });
      }
    } else if (typeof errorOrMessage === 'function') {
      if (err instanceof (errorOrMessage as new (...args: unknown[]) => Error)) {
        throw new AssertionError({
          message: message || 'Expected function not to throw error of this type',
          actual: err,
          expected: errorOrMessage,
          operator: 'doesNotThrow',
          stackStartFn: doesNotThrow,
        });
      }
    }
  }
};

/**
 * Expects promise to reject
 */
assert.rejects = async function rejects(
  asyncFn: Promise<unknown> | (() => Promise<unknown>),
  errorOrMessage?: RegExp | Function | Error | { message?: RegExp | string; code?: string } | string,
  message?: string
): Promise<void> {
  const promise = typeof asyncFn === 'function' ? asyncFn() : asyncFn;

  let rejected = false;
  let rejectionReason: unknown;

  try {
    await promise;
  } catch (err) {
    rejected = true;
    rejectionReason = err;
  }

  if (!rejected) {
    throw new AssertionError({
      message: typeof errorOrMessage === 'string' ? errorOrMessage : (message || 'Expected promise to reject'),
      actual: undefined,
      expected: errorOrMessage,
      operator: 'rejects',
      stackStartFn: rejects,
    });
  }

  // Validate the rejection reason if a validator was provided
  if (errorOrMessage !== undefined && typeof errorOrMessage !== 'string') {
    if (errorOrMessage instanceof RegExp) {
      const errMessage = rejectionReason instanceof Error ? rejectionReason.message : String(rejectionReason);
      if (!errorOrMessage.test(errMessage)) {
        throw new AssertionError({
          message: message || 'The rejection message did not match the regular expression',
          actual: rejectionReason,
          expected: errorOrMessage,
          operator: 'rejects',
          stackStartFn: rejects,
        });
      }
    } else if (typeof errorOrMessage === 'function') {
      if (!(rejectionReason instanceof (errorOrMessage as new (...args: unknown[]) => Error))) {
        throw new AssertionError({
          message: message || 'The rejection is not an instance of the expected type',
          actual: rejectionReason,
          expected: errorOrMessage,
          operator: 'rejects',
          stackStartFn: rejects,
        });
      }
    } else if (typeof errorOrMessage === 'object') {
      const expected = errorOrMessage as { message?: RegExp | string; code?: string };
      const err = rejectionReason as Error & { code?: string };

      if (expected.message !== undefined) {
        const errMsg = err.message || String(rejectionReason);
        if (expected.message instanceof RegExp) {
          if (!expected.message.test(errMsg)) {
            throw new AssertionError({
              message: message || 'The rejection message did not match',
              actual: errMsg,
              expected: expected.message,
              operator: 'rejects',
              stackStartFn: rejects,
            });
          }
        } else if (errMsg !== expected.message) {
          throw new AssertionError({
            message: message || 'The rejection message did not match',
            actual: errMsg,
            expected: expected.message,
            operator: 'rejects',
            stackStartFn: rejects,
          });
        }
      }

      if (expected.code !== undefined && err.code !== expected.code) {
        throw new AssertionError({
          message: message || 'The rejection code did not match',
          actual: err.code,
          expected: expected.code,
          operator: 'rejects',
          stackStartFn: rejects,
        });
      }
    }
  }
};

/**
 * Expects promise to not reject
 */
assert.doesNotReject = async function doesNotReject(
  asyncFn: Promise<unknown> | (() => Promise<unknown>),
  errorOrMessage?: RegExp | Function | string,
  message?: string
): Promise<void> {
  const promise = typeof asyncFn === 'function' ? asyncFn() : asyncFn;

  try {
    await promise;
  } catch (err) {
    // If no validator provided, any rejection is a failure
    if (errorOrMessage === undefined || typeof errorOrMessage === 'string') {
      throw new AssertionError({
        message: typeof errorOrMessage === 'string' ? errorOrMessage : (message || 'Expected promise not to reject'),
        actual: err,
        expected: undefined,
        operator: 'doesNotReject',
        stackStartFn: doesNotReject,
      });
    }

    // If validator provided, only matching rejections are failures
    if (errorOrMessage instanceof RegExp) {
      const errMessage = err instanceof Error ? err.message : String(err);
      if (errorOrMessage.test(errMessage)) {
        throw new AssertionError({
          message: message || 'Expected promise not to reject with matching error',
          actual: err,
          expected: errorOrMessage,
          operator: 'doesNotReject',
          stackStartFn: doesNotReject,
        });
      }
    } else if (typeof errorOrMessage === 'function') {
      if (err instanceof (errorOrMessage as new (...args: unknown[]) => Error)) {
        throw new AssertionError({
          message: message || 'Expected promise not to reject with error of this type',
          actual: err,
          expected: errorOrMessage,
          operator: 'doesNotReject',
          stackStartFn: doesNotReject,
        });
      }
    }
  }
};

/**
 * Throws an AssertionError
 */
assert.fail = function fail(
  messageOrActual?: string | unknown,
  expected?: unknown,
  message?: string,
  operator?: string
): never {
  if (arguments.length === 0 || arguments.length === 1) {
    throw new AssertionError({
      message: typeof messageOrActual === 'string' ? messageOrActual : 'Failed',
      stackStartFn: fail,
    });
  }

  throw new AssertionError({
    message,
    actual: messageOrActual,
    expected,
    operator: operator || 'fail',
    stackStartFn: fail,
  });
};

/**
 * Tests if string matches regular expression
 */
assert.match = function match(
  string: string,
  regexp: RegExp,
  message?: string | Error
): void {
  if (!regexp.test(string)) {
    if (message instanceof Error) {
      throw message;
    }
    throw new AssertionError({
      message: message || `The input did not match the regular expression`,
      actual: string,
      expected: regexp,
      operator: 'match',
      stackStartFn: match,
    });
  }
};

/**
 * Tests if string does not match regular expression
 */
assert.doesNotMatch = function doesNotMatch(
  string: string,
  regexp: RegExp,
  message?: string | Error
): void {
  if (regexp.test(string)) {
    if (message instanceof Error) {
      throw message;
    }
    throw new AssertionError({
      message: message || `The input was expected not to match the regular expression`,
      actual: string,
      expected: regexp,
      operator: 'doesNotMatch',
      stackStartFn: doesNotMatch,
    });
  }
};

/**
 * Throws if value is truthy (used for error-first callback patterns)
 */
assert.ifError = function ifError(value: unknown): void {
  if (value !== null && value !== undefined) {
    if (value instanceof Error) {
      throw value;
    }
    throw new AssertionError({
      message: `ifError got unwanted exception: ${value}`,
      actual: value,
      expected: null,
      operator: 'ifError',
      stackStartFn: ifError,
    });
  }
};

// Export the AssertionError class on the assert function
assert.AssertionError = AssertionError;

// Strict mode (same behavior for this implementation)
assert.strict = assert;

export default assert;
export { assert };
