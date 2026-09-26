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

export type RefineInput = {
  prompt: string;
  fromVersionId: string;
  allowWebSearch?: boolean;
};

// Applies an edit request to one version. Resolves with the model's answer: a new version, or a
// reply (declined, nothing changed, or asking to search the web). A 422 means the edit broke the
// output contract and nothing was saved.
export function useRefine(id: string) {
  return useMutation({
    mutationFn: (input: RefineInput) =>
      apiRequest(
        "POST",
        `/documents/${id}/refine`,
        input,
        RefineResponseSchema,
      ),
    onSuccess: (answer) => {
      if (answer.outcome === "edited")
        void queryClient.invalidateQueries({ queryKey: ["document", id] });
    },
  });
}

// Makes the version the user is looking at current (it opens next time; exports use it).
export function useSetCurrentVersion(id: string) {
  return useMutation({
    mutationFn: (versionId: string) =>
      apiRequest("POST", `/documents/${id}/current`, { versionId }, null),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["document", id] }),
  });
}
