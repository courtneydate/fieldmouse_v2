"""Celery tasks for the ingestion pipeline.

Sprint 6: Route the topic, look up the device, validate status,
          update topic_format, and discard unknown/unapproved messages.
Sprint 7: Parse the payload and create StreamReadings.

Ref: SPEC.md § Feature: MQTT Ingestion Pipeline
"""
import logging

from celery import shared_task

from apps.devices.models import Device

from .router import router

logger = logging.getLogger(__name__)


@shared_task(name='ingestion.process_mqtt_message')
def process_mqtt_message(topic: str, payload: str) -> None:
    """Process a single inbound MQTT message.

    Called by the MQTT subscriber for every message that arrives on a
    subscribed topic. Payload is passed as a UTF-8 string; binary payloads
    are base64-encoded by the subscriber before dispatch.

    Args:
        topic:   The full MQTT topic string, e.g. ``fm/mm/UNIT1/telemetry``.
        payload: The message payload as a UTF-8 string.
    """
    parsed = router.route(topic)

    if parsed is None:
        logger.debug('No pattern matched topic "%s" — discarding', topic)
        return

    logger.debug(
        'Routed topic "%s" → pattern=%s device_serial=%s format=%s',
        topic,
        parsed.pattern_name,
        parsed.device_serial,
        parsed.topic_format,
    )

    # -----------------------------------------------------------------------
    # Device lookup
    # -----------------------------------------------------------------------
    try:
        device = Device.objects.select_related('tenant').get(
            serial_number=parsed.device_serial
        )
    except Device.DoesNotExist:
        logger.warning(
            'Inbound message on topic "%s" references unknown serial "%s" — discarding',
            topic,
            parsed.device_serial,
        )
        return

    # -----------------------------------------------------------------------
    # Approval gate — only active devices may submit data
    # -----------------------------------------------------------------------
    if device.status != Device.Status.ACTIVE:
        logger.warning(
            'Device "%s" (serial=%s, status=%s) is not active — discarding message on topic "%s"',
            device.name,
            device.serial_number,
            device.status,
            topic,
        )
        return

    # -----------------------------------------------------------------------
    # Auto-detect and persist topic_format if it has changed
    # -----------------------------------------------------------------------
    if device.topic_format != parsed.topic_format:
        Device.objects.filter(pk=device.pk).update(topic_format=parsed.topic_format)
        logger.info(
            'Device "%s" topic_format updated: %s → %s',
            device.serial_number,
            device.topic_format,
            parsed.topic_format,
        )

    # -----------------------------------------------------------------------
    # Sprint 7: dispatch payload processing here
    # -----------------------------------------------------------------------
    logger.debug(
        'Device "%s" message accepted (type=%s, tenant=%s) — payload processing in Sprint 7',
        device.serial_number,
        parsed.message_type,
        device.tenant.name,
    )
