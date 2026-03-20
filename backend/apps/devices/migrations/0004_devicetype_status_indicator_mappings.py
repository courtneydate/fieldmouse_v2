"""Migration: add status_indicator_mappings to DeviceType.

Sprint 13 — required for the Status Indicator dashboard widget.
Ref: SPEC.md § Feature: Dashboards & Visualisation — Status Indicator widget
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('devices', '0003_devicehealth'),
    ]

    operations = [
        migrations.AddField(
            model_name='devicetype',
            name='status_indicator_mappings',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text=(
                    'Per-stream status indicator mappings for the Status Indicator dashboard widget. '
                    'Keyed by stream key; each value is a list of {value, color, label} entries.'
                ),
            ),
        ),
    ]
