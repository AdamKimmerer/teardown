// The one error type route handlers throw. errorToJson turns it into a response once, so handlers
// never catch and re-wrap. (A class because Error must be subclassed to keep instanceof and stacks.)
export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}
