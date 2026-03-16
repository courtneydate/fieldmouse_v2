"""AppConfig for the accounts app."""
from django.apps import AppConfig


class AccountsConfig(AppConfig):
    """Configuration for the accounts application."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.accounts'
    label = 'accounts'

    def ready(self):
        """Connect signal handlers for system notification group maintenance."""
        import apps.accounts.signals  # noqa: F401
