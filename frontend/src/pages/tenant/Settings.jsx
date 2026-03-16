/**
 * Settings — tenant timezone configuration page.
 *
 * Tenant Admins can update the timezone via a select dropdown.
 * Non-admins see the current timezone as read-only text.
 * Ref: SPEC.md § Tenant Settings
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSettings, useUpdateSettings } from '../../hooks/useSettings';
import styles from '../admin/AdminPage.module.css';

const TIMEZONE_OPTIONS = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Australia/Darwin',
  'Australia/Hobart',
  'Pacific/Auckland',
  'Pacific/Fiji',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'UTC',
];

function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.tenant_role === 'admin';

  const { data: settings, isLoading, isError } = useSettings();
  const updateSettings = useUpdateSettings();

  const [timezone, setTimezone] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  // Populate form when settings load
  useEffect(() => {
    if (settings?.timezone) {
      setTimezone(settings.timezone);
    }
  }, [settings]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSaveSuccess('');
    try {
      await updateSettings.mutateAsync({ timezone });
      setSaveSuccess('Settings saved.');
    } catch (err) {
      setSaveError(
        err.response?.data?.error?.message || 'Failed to save settings.'
      );
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1>Settings</h1>
      </div>

      <section className={styles.section}>
        <h2>Tenant timezone</h2>

        {isLoading && <p className={styles.loading}>Loading…</p>}
        {isError && <p className={styles.error}>Failed to load settings.</p>}

        {!isLoading && !isError && settings && (
          isAdmin ? (
            <form onSubmit={handleSave} className={styles.form} noValidate>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="timezone-select">
                  Timezone
                </label>
                <select
                  id="timezone-select"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className={styles.input}
                  disabled={updateSettings.isPending}
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <div className={styles.actions}>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
              {saveError && <p className={styles.error}>{saveError}</p>}
              {saveSuccess && <p className={styles.success}>{saveSuccess}</p>}
            </form>
          ) : (
            <p>
              <span className={styles.label}>Current timezone: </span>
              {settings.timezone || 'Not set'}
            </p>
          )
        )}
      </section>
    </div>
  );
}

export default Settings;
