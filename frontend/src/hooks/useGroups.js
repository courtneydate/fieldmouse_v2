/**
 * React Query hooks for notification group management.
 *
 * Provides: useGroups, useGroup, useCreateGroup, useUpdateGroup, useDeleteGroup,
 *           useAddGroupMember, useRemoveGroupMember
 * All requests are scoped to the current user's tenant by the backend.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

const GROUPS_KEY = ['groups'];

export function useGroups() {
  return useQuery({
    queryKey: GROUPS_KEY,
    queryFn: () => api.get('/api/v1/groups/').then((r) => r.data),
  });
}

export function useGroup(id) {
  return useQuery({
    queryKey: [...GROUPS_KEY, id],
    queryFn: () => api.get(`/api/v1/groups/${id}/`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/api/v1/groups/', data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

export function useUpdateGroup(groupId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.put(`/api/v1/groups/${groupId}/`, data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId) => api.delete(`/api/v1/groups/${groupId}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

export function useAddGroupMember(groupId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(`/api/v1/groups/${groupId}/members/`, data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

export function useRemoveGroupMember(groupId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tenantUserId) =>
      api.delete(`/api/v1/groups/${groupId}/members/${tenantUserId}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}
