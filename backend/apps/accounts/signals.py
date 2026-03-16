"""Signals for the accounts app.

Auto-maintains system NotificationGroups (All Users, All Admins, All Operators)
in response to TenantUser and Tenant lifecycle events.
"""
import logging

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender='accounts.Tenant')
def create_system_groups(sender, instance, created, **kwargs):
    """Create the three system NotificationGroups when a new Tenant is created."""
    if not created:
        return
    from .models import (  # local import avoids circular deps at module load
        SYSTEM_GROUP_ALL_ADMINS,
        SYSTEM_GROUP_ALL_OPERATORS,
        SYSTEM_GROUP_ALL_USERS,
        NotificationGroup,
    )
    for name in (SYSTEM_GROUP_ALL_USERS, SYSTEM_GROUP_ALL_ADMINS, SYSTEM_GROUP_ALL_OPERATORS):
        NotificationGroup.objects.get_or_create(
            tenant=instance,
            name=name,
            defaults={'is_system': True},
        )
    logger.debug('Created system notification groups for tenant %s', instance.name)


@receiver(post_save, sender='accounts.TenantUser')
def sync_system_group_membership(sender, instance, **kwargs):
    """Keep system group membership in sync when a TenantUser is created or role changes.

    Strategy:
    1. Ensure user is in All Users.
    2. Remove from all role-specific system groups.
    3. Add to the group matching their current role.
    """
    from .models import (
        ROLE_TO_SYSTEM_GROUP,
        SYSTEM_GROUP_ALL_ADMINS,
        SYSTEM_GROUP_ALL_OPERATORS,
        SYSTEM_GROUP_ALL_USERS,
        NotificationGroup,
        NotificationGroupMember,
    )

    tenant = instance.tenant

    # Step 1 — ensure system groups exist (idempotent)
    all_users_group, _ = NotificationGroup.objects.get_or_create(
        tenant=tenant, name=SYSTEM_GROUP_ALL_USERS, defaults={'is_system': True}
    )
    NotificationGroupMember.objects.get_or_create(group=all_users_group, tenant_user=instance)

    # Step 2 — remove from all role groups
    for group_name in (SYSTEM_GROUP_ALL_ADMINS, SYSTEM_GROUP_ALL_OPERATORS):
        NotificationGroupMember.objects.filter(
            group__tenant=tenant,
            group__name=group_name,
            group__is_system=True,
            tenant_user=instance,
        ).delete()

    # Step 3 — add to the appropriate role group
    role_group_name = ROLE_TO_SYSTEM_GROUP.get(instance.role)
    if role_group_name:
        role_group, _ = NotificationGroup.objects.get_or_create(
            tenant=tenant, name=role_group_name, defaults={'is_system': True}
        )
        NotificationGroupMember.objects.get_or_create(group=role_group, tenant_user=instance)


@receiver(post_delete, sender='accounts.TenantUser')
def remove_from_all_groups(sender, instance, **kwargs):
    """Remove all group memberships when a TenantUser is deleted."""
    from .models import NotificationGroupMember
    NotificationGroupMember.objects.filter(tenant_user=instance).delete()
