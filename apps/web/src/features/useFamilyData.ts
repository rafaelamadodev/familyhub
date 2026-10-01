import { useQuery, useQueryClient } from "@tanstack/react-query";
import { domainApi } from "../api/domain";
export function useFamilyData<T>(resource: string, familyId: string, query = "") {
  return useQuery({
    queryKey: [resource, familyId, query],
    queryFn: () => domainApi.list<T>(resource, familyId, query),
    refetchInterval: 5000,
    retry: false,
  });
}
export function useRefresh() {
  const client = useQueryClient();
  return async () => {
    await client.invalidateQueries();
  };
}
