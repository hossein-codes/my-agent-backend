"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth";
import { profileApi, type UpdateProfilePayload } from "../api/profile-api";

export function useUpdateProfile() {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => profileApi.update(payload),
    onSuccess: async () => {
      // Refresh the authoritative profile.
      const me = await profileApi.get();
      setUser(me);
      qc.setQueryData(["auth", "me"], me);
    },
  });
}
