import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client.js";

// Server state lives here and nowhere else (build plan convention 8). Client errors (4xx) are
// answers, not glitches, so only network and server errors are retried.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      staleTime: 10_000,
    },
  },
});
