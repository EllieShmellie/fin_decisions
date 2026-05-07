export class RetryableProcessingError extends Error {
  readonly isRetryable = true;
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = RetryableProcessingError.name;
    this.cause = cause;
  }
}

export class PermanentProcessingError extends Error {
  readonly isPermanent = true;
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = PermanentProcessingError.name;
    this.cause = cause;
  }
}

export function isPermanentProcessingError(error: unknown): boolean {
  return error instanceof PermanentProcessingError;
}
