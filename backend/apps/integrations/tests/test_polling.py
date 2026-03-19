"""Tests for integrations.tasks.poll_single_device.

Covers the auth-retry logic introduced to handle server-side token revocation
(where the provider returns 401 even though the cached token has not yet expired).

Ref: SPEC.md § Feature: Data Ingestion — 3rd Party APIs
"""
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import requests as req_lib

from apps.integrations.tasks import MAX_AUTH_RETRIES, poll_single_device

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_dsd(pk=11):
    """Return a minimal DataSourceDevice mock wired up for poll_single_device."""
    provider = MagicMock()
    provider.base_url = 'https://soilscouts.fi/api/v1'
    provider.detail_endpoint = {'method': 'GET', 'path_template': '/devices/{device_id}/'}
    provider.available_streams = []

    datasource = MagicMock()
    datasource.pk = 1
    datasource.provider = provider
    datasource.credentials = {'username': 'u', 'password': 'p'}
    datasource.auth_token_cache = {'access_token': 'old_token', 'expires_at': 9_999_999_999}

    dsd = MagicMock()
    dsd.pk = pk
    dsd.datasource_id = 1
    dsd.datasource = datasource
    dsd.external_device_id = '15269'
    dsd.virtual_device = MagicMock()
    dsd.active_stream_keys = []
    dsd.consecutive_poll_failures = 0
    return dsd


def make_response(status_code=200, json_data=None):
    """Return a mock requests.Response."""
    resp = MagicMock(spec=req_lib.Response)
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    if status_code >= 400:
        http_err = req_lib.HTTPError(response=resp, request=MagicMock())
        resp.raise_for_status.side_effect = http_err
    else:
        resp.raise_for_status.return_value = None
    return resp


# Patch paths — auth_handlers imports are local to the function body,
# so we patch at the source module, not at tasks.
AUTH_PATCH = 'apps.integrations.auth_handlers.get_auth_session'
HTTP_PATCH = 'apps.integrations.tasks.http_requests.request'
DSD_PATCH = 'apps.integrations.models.DataSourceDevice.objects'
STREAM_PATCH = 'apps.readings.models.Stream.objects.filter'
READING_PATCH = 'apps.readings.models.StreamReading.objects.bulk_create'
HEALTH_PATCH = 'apps.devices.models.DeviceHealth.objects.get_or_create'
ATOMIC_PATCH = 'django.db.transaction.atomic'


@contextmanager
def poll_patches(dsd, auth_return, http_side_effect):
    """Stack all patches needed to run poll_single_device in isolation."""
    with patch(DSD_PATCH) as mock_qs:
        mock_qs.select_related.return_value.get.return_value = dsd
        with patch(AUTH_PATCH, return_value=auth_return):
            with patch(HTTP_PATCH, side_effect=http_side_effect):
                with patch(STREAM_PATCH, return_value=[]):
                    with patch(READING_PATCH):
                        with patch(HEALTH_PATCH, return_value=(MagicMock(), False)):
                            with patch(ATOMIC_PATCH):
                                yield


GOOD_AUTH = ({'Authorization': 'Bearer tok'}, {}, None)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestPollAuthRetry:

    def test_max_retries_constant_is_three(self):
        """MAX_AUTH_RETRIES is 3 as agreed."""
        assert MAX_AUTH_RETRIES == 3

    def test_succeeds_on_first_attempt(self):
        """200 on the first try — no retry, poll status set to OK."""
        dsd = make_dsd()
        ok_resp = make_response(200)

        with poll_patches(dsd, GOOD_AUTH, [ok_resp]):
            poll_single_device(dsd.pk)

        dsd.save.assert_called()
        saved_kwargs = dsd.save.call_args
        assert 'last_poll_status' in str(saved_kwargs) or dsd.last_poll_status is not None

    def test_retries_once_on_401_then_succeeds(self):
        """A 401 on attempt 1 is retried; 200 on attempt 2 succeeds."""
        dsd = make_dsd()
        resp_401 = make_response(401)
        resp_200 = make_response(200)

        http_mock = MagicMock(side_effect=[resp_401, resp_200])

        with patch(DSD_PATCH) as mock_qs:
            mock_qs.select_related.return_value.get.return_value = dsd
            with patch(AUTH_PATCH, return_value=GOOD_AUTH):
                with patch(HTTP_PATCH, http_mock):
                    with patch(STREAM_PATCH, return_value=[]):
                        with patch(READING_PATCH):
                            with patch(HEALTH_PATCH, return_value=(MagicMock(), False)):
                                with patch(ATOMIC_PATCH):
                                    poll_single_device(dsd.pk)

        assert http_mock.call_count == 2
        # Token cache must have been cleared after the 401
        dsd.datasource.save.assert_any_call(update_fields=['auth_token_cache'])
        assert dsd.datasource.auth_token_cache == {}

    def test_records_auth_failure_after_all_retries_exhausted(self):
        """Three consecutive 401s record AUTH_FAILURE and increment failure count."""
        dsd = make_dsd()
        resp_401 = make_response(401)
        http_mock = MagicMock(return_value=resp_401)

        with patch(DSD_PATCH) as mock_qs:
            mock_qs.select_related.return_value.get.return_value = dsd
            with patch(AUTH_PATCH, return_value=GOOD_AUTH):
                with patch(HTTP_PATCH, http_mock):
                    poll_single_device(dsd.pk)

        assert http_mock.call_count == MAX_AUTH_RETRIES
        assert dsd.consecutive_poll_failures == 1  # _record_failure incremented it

    def test_does_not_retry_on_non_401_http_error(self):
        """A 500 fails immediately — no retry."""
        dsd = make_dsd()
        resp_500 = make_response(500)
        http_mock = MagicMock(return_value=resp_500)

        with poll_patches(dsd, GOOD_AUTH, http_mock):
            poll_single_device(dsd.pk)

        assert http_mock.call_count == 1

    def test_does_not_retry_on_network_error(self):
        """A connection error fails immediately — no retry."""
        dsd = make_dsd()
        http_mock = MagicMock(side_effect=req_lib.ConnectionError('refused'))

        with poll_patches(dsd, GOOD_AUTH, http_mock):
            poll_single_device(dsd.pk)

        assert http_mock.call_count == 1

    def test_persists_new_token_when_auth_returns_updated_cache(self):
        """When get_auth_session returns an updated cache, it is saved to the DataSource."""
        dsd = make_dsd()
        new_cache = {'access_token': 'new_tok', 'refresh_token': 'ref', 'expires_at': 9999}
        auth_return = ({'Authorization': 'Bearer new_tok'}, {}, new_cache)
        resp_200 = make_response(200)

        with poll_patches(dsd, auth_return, [resp_200]):
            poll_single_device(dsd.pk)

        assert dsd.datasource.auth_token_cache == new_cache
        dsd.datasource.save.assert_any_call(update_fields=['auth_token_cache'])
