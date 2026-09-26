import { useMutation, useQuery } from "@tanstack/react-query";
import {
  DocumentResponseSchema,
  DocumentVersionResponseSchema,
  RefineResponseSchema,
} from "@teardown/core/api-contract";
import { apiRequest } from "./client.js";
import { queryClient } from "./queryClient.js";

// Image links in a document response are valid for an hour; refetch well before then.
const DOCUMENT_STALE_MS = 30 * 60_000;

// The current version, the version list, and signed links for every [IMAGE_n].
export function useDocument(id: string) {
  return useQuery({
    queryKey: ["document", id],
    queryFn: () =>
      apiRequest("GET", `/documents/${id}`, undefined, DocumentResponseSchema),
    staleTime: DOCUMENT_STALE_MS,
    refetchInterval: DOCUMENT_STALE_MS,
  });
}

// An earlier version for the version switcher; versions never change, so never refetched.
export function useDocumentVersion(id: string, versionNo: number | null) {
  return useQuery({
    queryKey: ["document", id, "version", versionNo],
    queryFn: () =>
      apiRequest(
        "GET",
        `/documents/${id}/versions/${versionNo}`,
        undefined,
        DocumentVersionResponseSchema,
      ),
    enabled: versionNo !== null,
    staleTime: Infinity,
  });
}

// Applies an edit request. A 422 means nothing was saved: the model declined (its reason is the
// error message), the edit changed nothing, or it broke the output contract.
export function useRefine(id: string) {
  return useMutation({
    mutationFn: (prompt: string) =>
      apiRequest(
        "POST",
        `/documents/${id}/refine`,
        { prompt },
        RefineResponseSchema,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["document", id] }),
  });
}
