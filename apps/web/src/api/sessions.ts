import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ListSessionsResponseSchema,
  SessionDetailResponseSchema,
  SessionResponseSchema,
} from "@teardown/core/api-contract";
import type { SessionStatus } from "@teardown/core/schemas/session";
import { apiRequest } from "./client.js";
import { queryClient } from "./queryClient.js";

// While a session is being generated its page polls, so the step label and then the document
// appear without a reload.
const WORKING: SessionStatus[] = ["syncing", "processing"];
const POLL_MS = 3_000;

// The library: every session, newest first.
export function useSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: () =>
      apiRequest("GET", "/sessions", undefined, ListSessionsResponseSchema),
  });
}

// One session with its captures and document id; polls while generation is running.
export function useSession(id: string) {
  return useQuery({
    queryKey: ["session", id],
    queryFn: () =>
      apiRequest(
        "GET",
        `/sessions/${id}`,
        undefined,
        SessionDetailResponseSchema,
      ),
    refetchInterval: (query) =>
      WORKING.includes(query.state.data?.session.status ?? "ready")
        ? POLL_MS
        : false,
  });
}

// Deletes a session and everything in it (spine §14: delete means delete).
export function useDeleteSession() {
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/sessions/${id}`, undefined, null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

// Starts generation (or retries a failed one). 402 when out of credits.
export function useGenerate(id: string) {
  return useMutation({
    mutationFn: () =>
      apiRequest(
        "POST",
        `/sessions/${id}/generate`,
        undefined,
        SessionResponseSchema,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["session", id] });
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
