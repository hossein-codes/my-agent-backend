import { apiClient } from "@/lib/api";
import type { ActiveCampaign } from "@/types/domain";
import { mockApi } from "@/mocks/server-data";

export const campaignsApi = {
  async active(): Promise<ActiveCampaign[]> {
    if (mockApi.isEnabled()) {
      const mocked = mockApi.campaigns();
      if (mocked) return mocked;
    }
    return apiClient.get<ActiveCampaign[]>("/campaigns/active");
  },
};
