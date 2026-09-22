export type LlmErrorCode = "RATE_LIMITED" | "TIMEOUT" | "NETWORK" | "HTTP_ERROR" | "INVALID_JSON" | "SCHEMA_INVALID";
export class LlmError extends Error {
  constructor(public code: LlmErrorCode, message: string, public status?: number) {
    super(message);
    this.name = "LlmError";
  }
  get retryable(): boolean {
    return this.code === "RATE_LIMITED" || this.code === "TIMEOUT" || this.code === "NETWORK" ||
      (this.code === "HTTP_ERROR" && (this.status ?? 0) >= 500);
  }
}
