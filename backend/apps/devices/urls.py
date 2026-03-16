"""URL patterns for the devices app.

Sites (tenant-scoped):
    GET    /api/v1/sites/         — list sites
    POST   /api/v1/sites/         — create site
    GET    /api/v1/sites/{id}/    — retrieve site
    PUT    /api/v1/sites/{id}/    — update site
    DELETE /api/v1/sites/{id}/    — delete site
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import SiteViewSet

router = DefaultRouter()
router.register('sites', SiteViewSet, basename='site')

app_name = 'devices'

urlpatterns = [
    path('', include(router.urls)),
]
