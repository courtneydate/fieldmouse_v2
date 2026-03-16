/**
 * React Query hooks for tenant settings.
 *
 * Provides: useSettings (GET /api/v1/settings/),
 *           useUpdateSettings (PATCH /api/v1/settings/)
 * All requests are scoped to the current user's tenant by the backend.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

const SETTINGS_KEY = ['settings'];

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api.get('/api/v1/settings/').then((r) => r.data),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.patch('/api/v1/settings/', data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}
