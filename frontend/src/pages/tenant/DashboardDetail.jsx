/**
 * DashboardDetail — canvas page for a single dashboard.
 *
 * Renders widgets in a fixed grid (1/2/3 columns) ordered by position.order.
 * Supports value_card, line_chart, gauge, status_indicator, and health_uptime_chart widget types.
 * Auto-refreshes widget data every 30 seconds via React Query refetchInterval.
 * Supports drag-to-reorder via the HTML5 native drag-and-drop API.
 * Supports edit mode: clicking the pencil icon on any widget re-opens the builder modal
 * pre-populated with the widget's current config.
 */
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  useDashboard,
  useUpdateDashboard,
  useCreateWidget,
  useUpdateWidget,
  useDeleteWidget,
} from '../../hooks/useDashboards';
import GaugeWidget from '../../components/GaugeWidget';
import HealthUptimeChartWidget from '../../components/HealthUptimeChartWidget';
import LineChartWidget from '../../components/LineChartWidget';
import StatusIndicatorWidget from '../../components/StatusIndicatorWidget';
import ValueCard from '../../components/ValueCard';
import WidgetBuilderModal from '../../components/WidgetBuilderModal';
import styles from './DashboardDetail.module.css';
import pageStyles from '../admin/AdminPage.module.css';

const REFETCH_INTERVAL = 30000;
const COLUMN_OPTIONS = [1, 2, 3];

/** Sort widgets by position.order ascending (falling back to stable order). */
function sortWidgets(widgets) {
  return [...widgets].sort((a, b) => {
    const oa = a.position?.order ?? Infinity;
    const ob = b.position?.order ?? Infinity;
    return oa - ob;
  });
}

function DashboardDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const canEdit = user?.tenant_role === 'admin' || user?.tenant_role === 'operator';

  const { data: dashboard, isLoading, error } = useDashboard(Number(id));
  const updateDashboard = useUpdateDashboard(Number(id));
  const createWidget = useCreateWidget(Number(id));
  const updateWidget = useUpdateWidget(Number(id));
  const deleteWidget = useDeleteWidget(Number(id));

  /** null = closed, 'add' = adding a new widget, object = editing that widget. */
  const [activeModal, setActiveModal] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [columnsInput, setColumnsInput] = useState(2);

  /** Drag-and-drop state */
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // -------------------------------------------------------------------------
  // Dashboard name / columns edit
  // -------------------------------------------------------------------------

  const handleEditStart = () => {
    setNameInput(dashboard.name);
    setColumnsInput(dashboard.columns);
    setEditingName(true);
  };

  const handleEditSave = async () => {
    try {
      await updateDashboard.mutateAsync({ name: nameInput.trim(), columns: columnsInput });
      setEditingName(false);
    } catch {
      // leave form open on error
    }
  };

  // -------------------------------------------------------------------------
  // Widget add / edit / remove
  // -------------------------------------------------------------------------

  const handleAddWidget = async (payload) => {
    try {
      await createWidget.mutateAsync(payload);
      setActiveModal(null);
    } catch {
      // leave modal open
    }
  };

  const handleEditWidget = (widget) => setActiveModal(widget);

  const handleUpdateWidget = async (payload) => {
    try {
      await updateWidget.mutateAsync({ widgetId: activeModal.id, data: payload });
      setActiveModal(null);
    } catch {
      // leave modal open
    }
  };

  const handleRemoveWidget = async (widgetId) => {
    if (!window.confirm('Remove this widget?')) return;
    await deleteWidget.mutateAsync(widgetId);
  };

  // -------------------------------------------------------------------------
  // Drag-to-reorder
  // -------------------------------------------------------------------------

  const handleDragStart = (widgetId) => setDragId(widgetId);

  const handleDragOver = (e, widgetId) => {
    e.preventDefault();
    if (widgetId !== dragOverId) setDragOverId(widgetId);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  const handleDrop = async (e, targetWidgetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetWidgetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }

    const sorted = sortWidgets(dashboard.widgets || []);
    const fromIndex = sorted.findIndex((w) => w.id === dragId);
    const toIndex = sorted.findIndex((w) => w.id === targetWidgetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...sorted];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setDragId(null);
    setDragOverId(null);

    // Only persist widgets whose order actually changed
    const updates = reordered
      .map((w, i) => ({ widget: w, order: i }))
      .filter(({ widget, order }) => (widget.position?.order ?? Infinity) !== order);

    await Promise.all(
      updates.map(({ widget, order }) =>
        updateWidget.mutateAsync({
          widgetId: widget.id,
          data: {
            widget_type: widget.widget_type,
            config: widget.config,
            position: { ...widget.position, order },
            stream_ids: widget.stream_ids || [],
          },
        }),
      ),
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (isLoading) return <p className={pageStyles.loading}>Loading dashboard…</p>;
  if (error) return <p className={pageStyles.error}>Dashboard not found.</p>;

  const widgets = sortWidgets(dashboard.widgets || []);
  const nextOrder = widgets.length;
  const isEditMode = activeModal && typeof activeModal === 'object';

  return (
    <div>
      {/* Header */}
      <div className={pageStyles.pageHeader}>
        <Link to="/app/dashboards" className={pageStyles.link}>← Dashboards</Link>
        {editingName ? (
          <div className={styles.inlineEdit}>
            <input
              className={pageStyles.input}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              autoFocus
            />
            <select
              className={pageStyles.input}
              value={columnsInput}
              onChange={(e) => setColumnsInput(Number(e.target.value))}
            >
              {COLUMN_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} col{n !== 1 ? 's' : ''}</option>
              ))}
            </select>
            <button className={pageStyles.primaryButton} onClick={handleEditSave}>Save</button>
            <button className={pageStyles.secondaryButton} onClick={() => setEditingName(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <>
            <h1 className={pageStyles.pageTitle}>{dashboard.name}</h1>
            {canEdit && (
              <div className={styles.headerActions}>
                <button className={pageStyles.secondaryButton} onClick={handleEditStart}>
                  Edit
                </button>
                <button
                  className={pageStyles.primaryButton}
                  onClick={() => setActiveModal('add')}
                >
                  + Add Widget
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Canvas */}
      {widgets.length === 0 ? (
        <p className={pageStyles.empty}>
          No widgets yet.{canEdit ? ' Click "+ Add Widget" to add one.' : ''}
        </p>
      ) : (
        <div
          className={styles.grid}
          style={{ '--columns': dashboard.columns }}
        >
          {widgets.map((widget) => {
            const sharedProps = {
              config: widget.config,
              refetchInterval: REFETCH_INTERVAL,
              canEdit,
              onRemove: () => handleRemoveWidget(widget.id),
              onEdit: canEdit ? () => handleEditWidget(widget) : undefined,
            };
            const isDragging = dragId === widget.id;
            const isDragOver = dragOverId === widget.id && dragId !== widget.id;

            let widgetEl;
            if (widget.widget_type === 'value_card') {
              widgetEl = (
                <ValueCard
                  streamId={widget.stream_ids?.[0]}
                  config={widget.config}
                  refetchInterval={REFETCH_INTERVAL}
                  canEdit={canEdit}
                  onRemove={() => handleRemoveWidget(widget.id)}
                  onEdit={canEdit ? () => handleEditWidget(widget) : undefined}
                />
              );
            } else if (widget.widget_type === 'line_chart') {
              widgetEl = <LineChartWidget {...sharedProps} />;
            } else if (widget.widget_type === 'gauge') {
              widgetEl = <GaugeWidget {...sharedProps} />;
            } else if (widget.widget_type === 'status_indicator') {
              widgetEl = <StatusIndicatorWidget {...sharedProps} />;
            } else if (widget.widget_type === 'health_uptime_chart') {
              widgetEl = <HealthUptimeChartWidget {...sharedProps} />;
            } else {
              widgetEl = null;
            }

            if (!widgetEl) return null;

            return (
              <div
                key={widget.id}
                className={[
                  styles.widgetWrapper,
                  isDragging ? styles.dragging : '',
                  isDragOver ? styles.dragOver : '',
                ].join(' ')}
                draggable={canEdit}
                onDragStart={() => handleDragStart(widget.id)}
                onDragOver={(e) => handleDragOver(e, widget.id)}
                onDrop={(e) => handleDrop(e, widget.id)}
                onDragEnd={handleDragEnd}
              >
                {widgetEl}
              </div>
            );
          })}
        </div>
      )}

      {/* Widget builder / editor modal */}
      {activeModal && (
        <WidgetBuilderModal
          dashboardId={Number(id)}
          nextOrder={nextOrder}
          editingWidget={isEditMode ? activeModal : null}
          onSubmit={isEditMode ? handleUpdateWidget : handleAddWidget}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}

export default DashboardDetail;
