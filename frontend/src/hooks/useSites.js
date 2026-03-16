/**
 * React Query hooks for site management.
 *
 * Provides: useSites, useCreateSite, useUpdateSite, useDeleteSite
 * All requests are scoped to the current user's tenant by the backend.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

const SITES_KEY = ['sites'];

export function useSites() {
  return useQuery({
    queryKey: SITES_KEY,
    queryFn: () => api.get('/api/v1/sites/').then((r) => r.data),
  });
}

export function useCreateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/api/v1/sites/', data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SITES_KEY }),
  });
}

export function useUpdateSite(siteId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.put(`/api/v1/sites/${siteId}/`, data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SITES_KEY }),
  });
}

export function useDeleteSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (siteId) => api.delete(`/api/v1/sites/${siteId}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SITES_KEY }),
  });
}
