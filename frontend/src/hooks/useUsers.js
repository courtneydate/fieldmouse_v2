/**
 * React Query hooks for tenant user management.
 *
 * All requests are scoped to the current user's tenant by the backend.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/api/v1/users/').then((r) => r.data),
  });
}

export function useInviteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/api/v1/users/invite/', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUserRole(tenantUserId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.put(`/api/v1/users/${tenantUserId}/`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useRemoveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tenantUserId) => api.delete(`/api/v1/users/${tenantUserId}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
