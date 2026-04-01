/**
 * Device detail page — Info, Health, and Streams tabs.
 *
 * Accessible to all tenant roles. Stream label/unit/display editing
 * is available to Tenant Admins only.
 * Ref: SPEC.md § Feature: Device Health Monitoring
 * Ref: SPEC.md § Feature: Stream Discovery & Configuration
 */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useDeviceHealth, useDevices, useUpdateDevice } from '../../hooks/useDevices';
import { useDeviceStreams, useUpdateStream } from '../../hooks/useStreams';
import styles from '../admin/AdminPage.module.css';
import detailStyles from './DeviceDetail.module.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTIVITY_COLORS = {
  normal: '#22C55E',
  degraded: '#F59E0B',
  critical: '#EF4444',
};

function ActivityBadge({ level }) {
  const color = ACTIVITY_COLORS[level] || '#9CA3AF';
  const label = level ? level.charAt(0).toUpperCase() + level.slice(1) : 'Unknown';
  return <span style={{ color, fontWeight: 600 }}>{label}</span>;
}

ActivityBadge.propTypes = { level: PropTypes.string };

function OnlineBadge({ isOnline }) {
  return (
    <span style={{ color: isOnline ? '#22C55E' : '#6B7280', fontWeight: 600 }}>
      {isOnline ? 'Online' : 'Offline'}
    </span>
  );
}

OnlineBadge.propTypes = { isOnline: PropTypes.bool };

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatValue(value, dataType) {
  if (value === null || value === undefined) return '—';
  if (dataType === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

function TabBar({ active, onChange }) {
  const tabs = ['Info', 'Health', 'Streams'];
  return (
    <div className={detailStyles.tabBar}>
      {tabs.map((tab) => (
        <button
          key={tab}
          className={`${detailStyles.tab} ${active === tab ? detailStyles.tabActive : ''}`}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

TabBar.propTypes = {
  active: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

// ---------------------------------------------------------------------------
// Info tab
// ---------------------------------------------------------------------------

function InfoTab({ device, canEdit }) {
  const updateDevice = useUpdateDevice();
  const [name, setName] = useState(device.name);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Name cannot be blank.'); return; }
    setSaving(true);
    setError('');
    try {
      await updateDevice.mutateAsync({ deviceId: device.id, data: { name: trimmed } });
      setEditing(false);
    } catch {
      setError('Failed to save name.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setName(device.name);
    setEditing(false);
    setError('');
  };

  return (
    <div className={detailStyles.infoGrid}>
      <div className={detailStyles.infoItem}>
        <span className={detailStyles.infoLabel}>Device name</span>
        {canEdit && editing ? (
          <span className={detailStyles.infoValue} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={styles.input}
              style={{ padding: '0.2rem 0.4rem', fontSize: '0.9rem', width: '16rem' }}
              disabled={saving}
              autoFocus
            />
            <button className={styles.primaryButton} onClick={handleSave} disabled={saving}
              style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className={styles.secondaryButton} onClick={handleCancel} disabled={saving}
              style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}>
              Cancel
            </button>
            {error && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</span>}
          </span>
        ) : (
          <span className={detailStyles.infoValue} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {device.name}
            {canEdit && (
              <button className={styles.secondaryButton} onClick={() => setEditing(true)}
                style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                Rename
              </button>
            )}
          </span>
        )}
      </div>
      <div className={detailStyles.infoItem}>
        <span className={detailStyles.infoLabel}>Serial number</span>
        <span className={`${detailStyles.infoValue} ${styles.mono}`}>{device.serial_number}</span>
      </div>
      <div className={detailStyles.infoItem}>
        <span className={detailStyles.infoLabel}>Device type</span>
        <span className={detailStyles.infoValue}>{device.device_type_name || '—'}</span>
      </div>
      <div className={detailStyles.infoItem}>
        <span className={detailStyles.infoLabel}>Site</span>
        <span className={detailStyles.infoValue}>{device.site_name || '—'}</span>
      </div>
      <div className={detailStyles.infoItem}>
        <span className={detailStyles.infoLabel}>Approval status</span>
        <span className={detailStyles.infoValue}>{device.status}</span>
      </div>
      <div className={detailStyles.infoItem}>
        <span className={detailStyles.infoLabel}>Topic format</span>
        <span className={`${detailStyles.infoValue} ${styles.mono}`}>{device.topic_format}</span>
      </div>
    </div>
  );
}

InfoTab.propTypes = {
  device: PropTypes.object.isRequired,
  canEdit: PropTypes.bool.isRequired,
};

// ---------------------------------------------------------------------------
// Health tab
// ---------------------------------------------------------------------------

function HealthTab({ deviceId }) {
  const { data: health, isLoading, isError } = useDeviceHealth(deviceId);

  if (isLoading) return <p className={styles.loading}>Loading health data…</p>;
  if (isError) return (
    <p className={styles.empty}>No health data received yet — this device has not sent any telemetry.</p>
  );

  return (
    <div className={detailStyles.healthGrid}>
      <div className={detailStyles.healthItem}>
        <span className={detailStyles.healthLabel}>Status</span>
        <span className={detailStyles.healthValue}><OnlineBadge isOnline={health.is_online} /></span>
      </div>
      <div className={detailStyles.healthItem}>
        <span className={detailStyles.healthLabel}>Activity level</span>
        <span className={detailStyles.healthValue}><ActivityBadge level={health.activity_level} /></span>
      </div>
      <div className={detailStyles.healthItem}>
        <span className={detailStyles.healthLabel}>Last seen</span>
        <span className={detailStyles.healthValue}>{formatDateTime(health.last_seen_at)}</span>
      </div>
      <div className={detailStyles.healthItem}>
        <span className={detailStyles.healthLabel}>First active</span>
        <span className={detailStyles.healthValue}>{formatDateTime(health.first_active_at)}</span>
      </div>
      <div className={detailStyles.healthItem}>
        <span className={detailStyles.healthLabel}>Signal strength</span>
        <span className={detailStyles.healthValue}>
          {health.signal_strength != null ? `${health.signal_strength} dBm` : '—'}
        </span>
      </div>
      <div className={detailStyles.healthItem}>
        <span className={detailStyles.healthLabel}>Battery level</span>
        <span className={detailStyles.healthValue}>
          {health.battery_level != null ? `${health.battery_level}%` : '—'}
        </span>
      </div>
      <div className={detailStyles.healthItem}>
        <span className={detailStyles.healthLabel}>Updated</span>
        <span className={detailStyles.healthValue}>{formatDateTime(health.updated_at)}</span>
      </div>
    </div>
  );
}

HealthTab.propTypes = { deviceId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired };

// ---------------------------------------------------------------------------
// Stream row — inline editing
// ---------------------------------------------------------------------------

function StreamRow({ stream, canEdit, deviceId }) {
  const updateStream = useUpdateStream(deviceId);
  const [label, setLabel] = useState(stream.label);
  const [unit, setUnit] = useState(stream.unit);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleLabelChange = (e) => { setLabel(e.target.value); setDirty(true); };
  const handleUnitChange = (e) => { setUnit(e.target.value); setDirty(true); };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await updateStream.mutateAsync({
        streamId: stream.id,
        data: { label, unit, display_enabled: stream.display_enabled },
      });
      setDirty(false);
    } catch {
      setError('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDisplay = async () => {
    setSaving(true);
    setError('');
    try {
      await updateStream.mutateAsync({
        streamId: stream.id,
        data: { label, unit, display_enabled: !stream.display_enabled },
      });
    } catch {
      setError('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className={!stream.display_enabled ? detailStyles.rowDisabled : ''}>
      <td className={styles.mono}>{stream.key}</td>
      <td>
        {canEdit ? (
          <input
            type="text"
            value={label}
            onChange={handleLabelChange}
            className={detailStyles.inlineInput}
            disabled={saving}
          />
        ) : (
          stream.label || <span style={{ color: '#9CA3AF' }}>—</span>
        )}
      </td>
      <td>
        {canEdit ? (
          <input
            type="text"
            value={unit}
            onChange={handleUnitChange}
            className={`${detailStyles.inlineInput} ${detailStyles.unitInput}`}
            placeholder="e.g. °C"
            disabled={saving}
          />
        ) : (
          stream.unit || <span style={{ color: '#9CA3AF' }}>—</span>
        )}
      </td>
      <td>{stream.data_type}</td>
      <td className={styles.mono}>
        {formatValue(stream.latest_value, stream.data_type)}
        {stream.latest_timestamp && (
          <span className={detailStyles.latestTs}>
            {' '}@ {formatDateTime(stream.latest_timestamp)}
          </span>
        )}
      </td>
      <td>
        {canEdit ? (
          <button
            onClick={handleToggleDisplay}
            className={stream.display_enabled ? detailStyles.toggleOn : detailStyles.toggleOff}
            disabled={saving}
            title={stream.display_enabled ? 'Shown on dashboards' : 'Hidden from dashboards'}
          >
            {stream.display_enabled ? 'Enabled' : 'Disabled'}
          </button>
        ) : (
          <span style={{ color: stream.display_enabled ? '#22C55E' : '#6B7280' }}>
            {stream.display_enabled ? 'Enabled' : 'Disabled'}
          </span>
        )}
      </td>
      {canEdit && (
        <td>
          {dirty && (
            <button
              onClick={handleSave}
              className={styles.primaryButton}
              disabled={saving}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          {error && <span className={styles.error}>{error}</span>}
        </td>
      )}
    </tr>
  );
}

StreamRow.propTypes = {
  stream: PropTypes.object.isRequired,
  canEdit: PropTypes.bool.isRequired,
  deviceId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

// ---------------------------------------------------------------------------
// Streams tab
// ---------------------------------------------------------------------------

function StreamsTab({ deviceId, canEdit }) {
  const { data: streams = [], isLoading, isError } = useDeviceStreams(deviceId);

  if (isLoading) return <p className={styles.loading}>Loading streams…</p>;
  if (isError) return <p className={styles.error}>Failed to load streams.</p>;
  if (streams.length === 0) return (
    <p className={styles.empty}>No streams discovered yet — send telemetry to auto-discover streams.</p>
  );

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Key</th>
          <th>Label</th>
          <th>Unit</th>
          <th>Type</th>
          <th>Latest value</th>
          <th>Dashboard</th>
          {canEdit && <th></th>}
        </tr>
      </thead>
      <tbody>
        {streams.map((stream) => (
          <StreamRow
            key={stream.id}
            stream={stream}
            canEdit={canEdit}
            deviceId={deviceId}
          />
        ))}
      </tbody>
    </table>
  );
}

StreamsTab.propTypes = {
  deviceId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  canEdit: PropTypes.bool.isRequired,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function DeviceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.tenant_role === 'admin';

  const { data: devices = [], isLoading: devicesLoading } = useDevices();
  const device = devices.find((d) => String(d.id) === String(id));

  const [activeTab, setActiveTab] = useState('Info');

  return (
    <div>
      <div className={styles.pageHeader}>
        <Link to="/app/devices" className={styles.link}>← Devices</Link>
        <h1 style={{ margin: '0 0 0 1rem', fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
          {devicesLoading ? 'Loading…' : (device?.name || `Device #${id}`)}
        </h1>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} />

      <section className={styles.section}>
        {activeTab === 'Info' && device && <InfoTab device={device} canEdit={isAdmin} />}
        {activeTab === 'Info' && !device && !devicesLoading && (
          <p className={styles.empty}>Device not found.</p>
        )}
        {activeTab === 'Health' && <HealthTab deviceId={id} />}
        {activeTab === 'Streams' && <StreamsTab deviceId={id} canEdit={isAdmin} />}
      </section>
    </div>
  );
}

export default DeviceDetail;
