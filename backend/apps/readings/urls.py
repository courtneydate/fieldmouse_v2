"""URL patterns for the readings app.

Ref: SPEC.md § API Routes
"""
from django.urls import path

from .views import StreamViewSet

app_name = 'readings'

stream_detail = StreamViewSet.as_view({'get': 'retrieve', 'put': 'update'})

urlpatterns = [
    path('streams/<int:pk>/', stream_detail, name='stream-detail'),
]
