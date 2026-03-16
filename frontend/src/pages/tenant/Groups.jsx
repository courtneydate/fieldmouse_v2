/**
 * Groups — notification group management page.
 *
 * Lists all groups with member counts. Tenant Admins can create, rename,
 * delete custom groups and manage membership. System groups are read-only.
 * Ref: SPEC.md § Feature: Notification Groups
 */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../../context/AuthContext';
import {
  useGroups,
  useGroup,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useAddGroupMember,
  useRemoveGroupMember,
} from '../../hooks/useGroups';
import { useUsers } from '../../hooks/useUsers';
import styles from '../admin/AdminPage.module.css';

/** Expanded member panel for a single group. */
function GroupMembersPanel({ groupId, isAdmin, isSystem }) {
  const { data: group, isLoading, isError } = useGroup(groupId);
  const { data: users = [] } = useUsers();
  const addMember = useAddGroupMember(groupId);
  const removeMember = useRemoveGroupMember(groupId);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [addError, setAddError] = useState('');

  const members = group?.members ?? [];

  // Build a set of already-member tenant_user ids for filtering the dropdown
  const memberIds = new Set(members.map((m) => String(m.tenant_user_id ?? m.id)));
  const availableUsers = users.filter((u) => !memberIds.has(String(u.id)));

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddError('');
    if (!selectedUserId) { setAddError('Select a user to add.'); return; }
    try {
      await addMember.mutateAsync({ tenant_user_id: Number(selectedUserId) });
      setSelectedUserId('');
    } catch (err) {
      setAddError(err.response?.data?.error?.message || 'Failed to add member.');
    }
  };

  const handleRemove = async (tenantUserId, label) => {
    if (!window.confirm(`Remove ${label} from this group?`)) return;
    try {
      await removeMember.mutateAsync(tenantUserId);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to remove member.');
    }
  };

  if (isLoading) return <p className={styles.loading}>Loading members…</p>;
  if (isError) return <p className={styles.error}>Failed to load members.</p>;

  return (
    <div style={{ marginTop: '1rem' }}>
      {members.length === 0 ? (
        <p className={styles.empty}>No members yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              {isAdmin && !isSystem && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const fullName =
                [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || '—';
              return (
                <tr key={m.tenant_user_id ?? m.id}>
                  <td>{fullName}</td>
                  <td>{m.email || '—'}</td>
                  {isAdmin && !isSystem && (
                    <td>
                      <button
                        className={styles.dangerButton}
                        onClick={() =>
                          handleRemove(m.tenant_user_id ?? m.id, m.email || fullName)
                        }
                        disabled={removeMember.isPending}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {isAdmin && !isSystem && (
        <form onSubmit={handleAdd} className={styles.form} noValidate style={{ marginTop: '1rem' }}>
          <div className={styles.inlineFields}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`add-member-${groupId}`}>
                Add member
              </label>
              <select
                id={`add-member-${groupId}`}
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className={styles.input}
                disabled={addMember.isPending}
              >
                <option value="">— Select a user —</option>
                {availableUsers.map((u) => {
                  const name =
                    [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
                  return (
                    <option key={u.id} value={u.id}>
                      {name} ({u.email})
                    </option>
                  );
                })}
              </select>
            </div>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={addMember.isPending}
              style={{ alignSelf: 'flex-end' }}
            >
              {addMember.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
          {addError && <p className={styles.error}>{addError}</p>}
        </form>
      )}
    </div>
  );
}

GroupMembersPanel.propTypes = {
  groupId: PropTypes.number.isRequired,
  isAdmin: PropTypes.bool.isRequired,
  isSystem: PropTypes.bool.isRequired,
};

/** Single group row with expand/collapse and inline rename. */
function GroupRow({ group, isAdmin }) {
  const updateGroup = useUpdateGroup(group.id);
  const deleteGroup = useDeleteGroup();

  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(group.name);
  const [renameError, setRenameError] = useState('');

  const isSystem = !!group.is_system;

  const handleRename = async (e) => {
    e.preventDefault();
    setRenameError('');
    if (!newName.trim()) { setRenameError('Name is required.'); return; }
    try {
      await updateGroup.mutateAsync({ name: newName.trim() });
      setRenaming(false);
    } catch (err) {
      setRenameError(err.response?.data?.error?.message || 'Failed to rename group.');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete group "${group.name}"? This cannot be undone.`)) return;
    try {
      await deleteGroup.mutateAsync(group.id);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete group.');
    }
  };

  const memberCount = group.member_count ?? group.members?.length ?? 0;

  return (
    <>
      <tr>
        <td>
          {renaming ? (
            <form onSubmit={handleRename} className={styles.form} noValidate style={{ maxWidth: '320px' }}>
              <div className={styles.inlineFields}>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={styles.input}
                  disabled={updateGroup.isPending}
                  autoFocus
                />
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={updateGroup.isPending}
                >
                  {updateGroup.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => { setRenaming(false); setNewName(group.name); }}
                >
                  Cancel
                </button>
              </div>
              {renameError && <p className={styles.error}>{renameError}</p>}
            </form>
          ) : (
            group.name
          )}
        </td>
        <td>{memberCount}</td>
        <td>
          {isSystem ? (
            <span className={styles.badgeActive}>System</span>
          ) : (
            <span className={styles.badgeInactive}>Custom</span>
          )}
        </td>
        <td>
          <div className={styles.actions} style={{ marginTop: 0 }}>
            <button
              className={styles.secondaryButton}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Hide members' : 'Members'}
            </button>
            {isAdmin && !isSystem && !renaming && (
              <>
                <button
                  className={styles.secondaryButton}
                  onClick={() => setRenaming(true)}
                >
                  Rename
                </button>
                <button
                  className={styles.dangerButton}
                  onClick={handleDelete}
                  disabled={deleteGroup.isPending}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} style={{ paddingTop: '0.5rem', paddingBottom: '1rem' }}>
            <GroupMembersPanel
              groupId={group.id}
              isAdmin={isAdmin}
              isSystem={isSystem}
            />
          </td>
        </tr>
      )}
    </>
  );
}

GroupRow.propTypes = {
  group: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    is_system: PropTypes.bool,
    member_count: PropTypes.number,
    members: PropTypes.array,
  }).isRequired,
  isAdmin: PropTypes.bool.isRequired,
};

function Groups() {
  const { user } = useAuth();
  const isAdmin = user?.tenant_role === 'admin';

  const { data: groups = [], isLoading, isError } = useGroups();
  const createGroup = useCreateGroup();

  const [groupName, setGroupName] = useState('');
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');
    if (!groupName.trim()) { setCreateError('Group name is required.'); return; }
    try {
      await createGroup.mutateAsync({ name: groupName.trim() });
      setCreateSuccess(`Group "${groupName.trim()}" created.`);
      setGroupName('');
    } catch (err) {
      setCreateError(err.response?.data?.error?.message || 'Failed to create group.');
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1>Notification Groups</h1>
      </div>

      {isAdmin && (
        <section className={styles.section}>
          <h2>Create group</h2>
          <form onSubmit={handleCreate} className={styles.form} noValidate>
            <div className={styles.inlineFields}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="new-group-name">Group name</label>
                <input
                  id="new-group-name"
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className={styles.input}
                  placeholder="e.g. On-call team"
                  disabled={createGroup.isPending}
                />
              </div>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={createGroup.isPending}
                style={{ alignSelf: 'flex-end' }}
              >
                {createGroup.isPending ? 'Creating…' : 'Create'}
              </button>
            </div>
            {createError && <p className={styles.error}>{createError}</p>}
            {createSuccess && <p className={styles.success}>{createSuccess}</p>}
          </form>
        </section>
      )}

      <section className={styles.section}>
        {isLoading && <p className={styles.loading}>Loading…</p>}
        {isError && <p className={styles.error}>Failed to load groups.</p>}
        {!isLoading && !isError && groups.length === 0 && (
          <p className={styles.empty}>No groups yet.</p>
        )}
        {!isLoading && !isError && groups.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Members</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <GroupRow key={group.id} group={group} isAdmin={isAdmin} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default Groups;
