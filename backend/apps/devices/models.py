"""Devices app models.

Sprint 4: Site
Sprint 5: DeviceType, Device
"""
from django.db import models


class Site(models.Model):
    """A physical location belonging to a tenant.

    Devices are deployed at Sites. Tenant A's Sites are invisible to Tenant B.
    """

    tenant = models.ForeignKey(
        'accounts.Tenant',
        on_delete=models.CASCADE,
        related_name='sites',
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        help_text='WGS84 decimal degrees.',
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        help_text='WGS84 decimal degrees.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.tenant.name})'
