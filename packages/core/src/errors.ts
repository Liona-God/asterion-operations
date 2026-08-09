export type DomainErrorCode =
  | "validation"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid_state";

export class DomainError extends Error {
  public constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
