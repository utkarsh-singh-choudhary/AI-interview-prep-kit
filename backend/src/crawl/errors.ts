export type FetchErrorCode =
  | "INVALID_URL" | "BLOCKED_URL" | "BLOCKED_BY_ROBOTS" | "TIMEOUT" | "NETWORK"
  | "HTTP_ERROR" | "TOO_LARGE" | "UNSUPPORTED_CONTENT_TYPE" | "TOO_MANY_REDIRECTS";

export class FetchError extends Error {
  constructor(public code: FetchErrorCode, message: string, public status?: number) {
    super(message);
    this.name = "FetchError";
  }
  /** Only transient failures are worth retrying. */
  get retryable(): boolean {
    return this.code === "TIMEOUT" || this.code === "NETWORK" ||
      (this.code === "HTTP_ERROR" && (this.status === 429 || (this.status ?? 0) >= 500));
  }
}
