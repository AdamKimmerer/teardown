import { useMutation, useQuery } from "@tanstack/react-query";
import { MeResponseSchema } from "@teardown/core/api-contract";
import { supabase } from "../auth/supabase.js";
import { apiRequest } from "./client.js";
import { queryClient } from "./queryClient.js";

// The signed-in user's profile, credit balance and connected services.
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiRequest("GET", "/me", undefined, MeResponseSchema),
  });
}

// Deletes the account and everything in it, then signs this browser out.
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/me", undefined, null);
      queryClient.clear();
      await supabase.auth.signOut({ scope: "local" });
    },
  });
}
