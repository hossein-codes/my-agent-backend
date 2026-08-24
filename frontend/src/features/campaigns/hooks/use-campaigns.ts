"use client";

import { useQuery } from "@tanstack/react-query";
import { campaignsApi } from "../api/campaigns-api";

export function useActiveCampaigns(enabled = true) {
  return useQuery({
    queryKey: ["campaigns", "active"],
    queryFn: campaignsApi.active,
    enabled,
    staleTime: 60_000,
  });
}
