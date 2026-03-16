"""Views for the devices app."""
import logging

from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsTenantAdmin, IsViewOnly

from .models import Site
from .serializers import SiteSerializer

logger = logging.getLogger(__name__)


class SiteViewSet(viewsets.GenericViewSet):
    """Tenant-scoped Site CRUD.

    All queries are filtered to the requesting user's tenant.
    List/retrieve available to all tenant users; create/update/delete require Tenant Admin.
    Ref: SPEC.md § Feature: Site Management
    """

    serializer_class = SiteSerializer

    def get_permissions(self):
        """Restrict write actions to Tenant Admins."""
        if self.action in ('create', 'update', 'destroy'):
            return [IsAuthenticated(), IsTenantAdmin()]
        return [IsAuthenticated(), IsViewOnly()]

    def get_queryset(self):
        """Return Sites scoped to the requesting user's tenant."""
        return Site.objects.filter(tenant=self.request.user.tenantuser.tenant)

    def list(self, request):
        """GET /api/v1/sites/ — list all sites in the current tenant."""
        serializer = SiteSerializer(self.get_queryset(), many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        """GET /api/v1/sites/:id/ — retrieve a site."""
        site = get_object_or_404(self.get_queryset(), pk=pk)
        return Response(SiteSerializer(site).data)

    def create(self, request):
        """POST /api/v1/sites/ — create a site. Tenant Admin only."""
        serializer = SiteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(tenant=request.user.tenantuser.tenant)
        logger.info('Site "%s" created by %s', serializer.instance.name, request.user.email)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        """PUT /api/v1/sites/:id/ — update a site. Tenant Admin only."""
        site = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = SiteSerializer(site, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def destroy(self, request, pk=None):
        """DELETE /api/v1/sites/:id/ — delete a site. Tenant Admin only."""
        site = get_object_or_404(self.get_queryset(), pk=pk)
        site.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
