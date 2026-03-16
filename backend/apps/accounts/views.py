"""Views for the accounts app.

Auth endpoints (login, refresh, logout, me, accept-invite) and management
endpoints for Fieldmouse Admin (tenants) and Tenant Admin (users).
"""
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.core.mail import send_mail
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenBlacklistView, TokenObtainPairView, TokenRefreshView

from .models import Tenant, TenantUser
from .permissions import IsFieldmouseAdmin, IsTenantAdmin, IsViewOnly
from .serializers import (
    AcceptInviteSerializer,
    InviteSerializer,
    TenantSerializer,
    TenantUserSerializer,
    UserRoleUpdateSerializer,
    UserSerializer,
)

logger = logging.getLogger(__name__)
User = get_user_model()


# ---------------------------------------------------------------------------
# Auth views
# ---------------------------------------------------------------------------

class FieldmouseTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Extends the default serializer to block login for deactivated tenant users."""

    def validate(self, attrs):
        """Validate credentials and check tenant active status."""
        data = super().validate(attrs)
        user = self.user
        tenant_user = getattr(user, 'tenantuser', None)
        if tenant_user is not None and not tenant_user.tenant.is_active:
            raise AuthenticationFailed(
                'Your organisation account has been deactivated. Contact Fieldmouse support.'
            )
        return data


class LoginView(TokenObtainPairView):
    """POST /api/v1/auth/login/ — obtain JWT token pair."""

    serializer_class = FieldmouseTokenObtainPairSerializer


RefreshView = TokenRefreshView
LogoutView = TokenBlacklistView


class MeView(APIView):
    """GET /api/v1/auth/me/ — return the current authenticated user's profile."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return the authenticated user's profile data."""
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class AcceptInviteView(APIView):
    """POST /api/v1/auth/accept-invite/ — accept an invite and create account.

    Public endpoint. Validates the signed token, creates the User and
    TenantUser, and returns a JWT token pair so the user is logged in
    immediately after accepting.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        """Accept invite: create user, return tokens."""
        serializer = AcceptInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        logger.info('Invite accepted: new user %s created', user.email)
        return Response(
            {'access': str(refresh.access_token), 'refresh': str(refresh)},
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Tenant management (Fieldmouse Admin only)
# ---------------------------------------------------------------------------

class TenantCursorPagination(CursorPagination):
    """Cursor pagination for Tenant list, ordered by creation time."""

    ordering = 'created_at'


class TenantViewSet(viewsets.ModelViewSet):
    """CRUD for Tenant records.

    All actions restricted to Fieldmouse Admin users.
    Supports: list, create, retrieve, partial_update, and a custom invite action.
    Destroy is intentionally disabled — tenants are deactivated, not deleted.
    """

    queryset = Tenant.objects.all().order_by('created_at')
    serializer_class = TenantSerializer
    permission_classes = [IsAuthenticated, IsFieldmouseAdmin]
    pagination_class = TenantCursorPagination
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    @action(detail=True, methods=['post'], url_path='invite')
    def invite(self, request, pk=None):
        """POST /api/v1/tenants/{id}/invite/ — send an invite email to a new Tenant Admin.

        Generates a signed invite token containing email, tenant_id, and role.
        The accept flow validates the token and creates the User.
        """
        tenant = self.get_object()
        serializer = InviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        role = serializer.validated_data['role']

        token = signing.dumps(
            {'email': email, 'tenant_id': tenant.id, 'role': role},
            salt='fieldmouse-invite',
        )

        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
        invite_url = f'{frontend_url}/accept-invite/{token}/'

        send_mail(
            subject=f'You have been invited to {tenant.name} on Fieldmouse',
            message=(
                f'Hello,\n\n'
                f'You have been invited to join {tenant.name} on Fieldmouse as {role}.\n\n'
                f'Click the link below to set your password and activate your account:\n'
                f'{invite_url}\n\n'
                f'This invite link expires in 7 days.\n\n'
                f'— The Fieldmouse Team'
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )

        logger.info('Invite sent to %s for tenant %s (role: %s)', email, tenant.name, role)
        return Response({'detail': f'Invite sent to {email}.'}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# User management (Tenant Admin / tenant-scoped)
# ---------------------------------------------------------------------------

class UserViewSet(viewsets.GenericViewSet):
    """Tenant-scoped user management.

    All queries are filtered to the requesting user's tenant.
    List is available to all tenant users; invite/update/remove require Tenant Admin.
    """

    serializer_class = TenantUserSerializer

    def get_permissions(self):
        """Restrict write actions to Tenant Admins."""
        if self.action in ('update', 'destroy', 'invite'):
            return [IsAuthenticated(), IsTenantAdmin()]
        return [IsAuthenticated(), IsViewOnly()]

    def get_queryset(self):
        """Return TenantUsers scoped to the requesting user's tenant."""
        return (
            TenantUser.objects.filter(tenant=self.request.user.tenantuser.tenant)
            .select_related('user')
            .order_by('joined_at')
        )

    def list(self, request):
        """GET /api/v1/users/ — list all users in the current tenant."""
        serializer = TenantUserSerializer(self.get_queryset(), many=True)
        return Response(serializer.data)

    def update(self, request, pk=None):
        """PUT /api/v1/users/:id/ — update a user's role. Tenant Admin only.

        Cannot change own role. Cannot demote the last admin.
        """
        tenant_user = get_object_or_404(self.get_queryset(), pk=pk)
        my_tenant_user = request.user.tenantuser

        if tenant_user == my_tenant_user:
            return Response(
                {'error': {'code': 'self_update', 'message': 'You cannot change your own role.'}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = UserRoleUpdateSerializer(tenant_user, data=request.data)
        serializer.is_valid(raise_exception=True)

        new_role = serializer.validated_data.get('role')
        if tenant_user.role == TenantUser.Role.ADMIN and new_role != TenantUser.Role.ADMIN:
            admin_count = TenantUser.objects.filter(
                tenant=my_tenant_user.tenant,
                role=TenantUser.Role.ADMIN,
            ).count()
            if admin_count <= 1:
                return Response(
                    {'error': {'code': 'last_admin', 'message': 'Cannot demote the last admin.'}},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer.save()
        return Response(TenantUserSerializer(tenant_user).data)

    def destroy(self, request, pk=None):
        """DELETE /api/v1/users/:id/ — remove a user from the tenant. Tenant Admin only.

        Deletes the TenantUser record and deactivates the User account so
        existing JWT tokens are immediately rejected by the auth backend.
        """
        tenant_user = get_object_or_404(self.get_queryset(), pk=pk)

        if tenant_user == request.user.tenantuser:
            return Response(
                {'error': {'code': 'self_remove', 'message': 'You cannot remove yourself.'}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = tenant_user.user
        tenant_user.delete()
        user.is_active = False
        user.save(update_fields=['is_active'])
        logger.info('User %s removed from tenant by %s', user.email, request.user.email)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['post'], url_path='invite')
    def invite(self, request):
        """POST /api/v1/users/invite/ — send invite email. Tenant Admin only."""
        tenant = request.user.tenantuser.tenant
        serializer = InviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        role = serializer.validated_data['role']

        token = signing.dumps(
            {'email': email, 'tenant_id': tenant.id, 'role': role},
            salt='fieldmouse-invite',
        )

        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
        invite_url = f'{frontend_url}/accept-invite/{token}/'

        send_mail(
            subject=f'You have been invited to {tenant.name} on Fieldmouse',
            message=(
                f'Hello,\n\n'
                f'You have been invited to join {tenant.name} on Fieldmouse as {role}.\n\n'
                f'Click the link below to set your password and activate your account:\n'
                f'{invite_url}\n\n'
                f'This invite link expires in 7 days.\n\n'
                f'— The Fieldmouse Team'
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )

        logger.info('Tenant invite sent to %s for %s (role: %s)', email, tenant.name, role)
        return Response({'detail': f'Invite sent to {email}.'}, status=status.HTTP_200_OK)
