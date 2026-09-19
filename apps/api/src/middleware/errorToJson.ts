import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import type { ErrorResponse } from "@teardown/core/api-contract";
import { AppError } from "../appError.js";

// Converts anything thrown in a route into the API's one error shape. AppError keeps its status
// and code; a Zod failure is a 400 with the first issue's path; anything else is a 500 and is
// logged with its stack so it can be found.
export const errorToJson: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(
      body(err.code, err.message),
      err.status as ContentfulStatusCode,
    );
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first ? first.path.join(".") : "";
    const message = first
      ? `${where ? where + ": " : ""}${first.message}`
      : "Invalid request";
    return c.json(body("invalid_request", message), 400);
  }

  console.error(err);
  return c.json(body("internal_error", "Something went wrong"), 500);
};

function body(code: string, message: string): ErrorResponse {
  return { error: { code, message } };
}
