"""Serializers for the devices app."""
from rest_framework import serializers

from .models import Site


class SiteSerializer(serializers.ModelSerializer):
    """Serializer for Site CRUD."""

    class Meta:
        model = Site
        fields = ('id', 'name', 'description', 'latitude', 'longitude', 'created_at')
        read_only_fields = ('id', 'created_at')
