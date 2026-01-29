const statusConfig = {
  PENDING: {
    label: 'Pending',
    className: 'badge-pending',
    dotClassName: 'status-dot-pending',
  },
  SCHEDULED: {
    label: 'Scheduled',
    className: 'badge-scheduled',
    dotClassName: 'status-dot-scheduled',
  },
  QUEUED: {
    label: 'Queued',
    className: 'badge-scheduled',
    dotClassName: 'status-dot-scheduled',
  },
  RUNNING: {
    label: 'Running',
    className: 'badge-running',
    dotClassName: 'status-dot-running',
  },
  COMPLETED: {
    label: 'Completed',
    className: 'badge-completed',
    dotClassName: 'status-dot-completed',
  },
  SUCCESS: {
    label: 'Success',
    className: 'badge-completed',
    dotClassName: 'status-dot-completed',
  },
  FAILED: {
    label: 'Failed',
    className: 'badge-failed',
    dotClassName: 'status-dot-failed',
  },
  TIMEOUT: {
    label: 'Timeout',
    className: 'badge-failed',
    dotClassName: 'status-dot-failed',
  },
  PAUSED: {
    label: 'Paused',
    className: 'badge-pending',
    dotClassName: 'status-dot-pending',
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'badge-pending',
    dotClassName: 'status-dot-pending',
  },
  WAITING: {
    label: 'Waiting',
    className: 'badge-pending',
    dotClassName: 'status-dot-pending',
  },
  BLOCKED: {
    label: 'Blocked',
    className: 'badge-failed',
    dotClassName: 'status-dot-failed',
  },
}

function StatusBadge({ status, showDot = false, size = 'default' }) {
  const config = statusConfig[status] || statusConfig.PENDING

  const sizeClasses = {
    small: 'text-xs px-2 py-0.5',
    default: '',
    large: 'text-sm px-3 py-1.5',
  }

  return (
    <span className={`${config.className} ${sizeClasses[size]}`}>
      {showDot && <span className={`status-dot ${config.dotClassName} mr-1.5`} />}
      {config.label}
    </span>
  )
}

export default StatusBadge
