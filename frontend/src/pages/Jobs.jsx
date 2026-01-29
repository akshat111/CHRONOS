import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { 
  Plus, Search, Filter, MoreVertical, FileText, 
  XCircle, RefreshCw, Clock, Repeat, ChevronDown, Edit,
  PauseCircle, PlayCircle, Trash2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { jobsApi } from '../services/api'
import { StatusBadge, PageLoader, EmptyState, ConfirmModal } from '../components/common'

function Jobs() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [confirmState, setConfirmState] = useState({ isOpen: false, type: null, job: null })
  const [actionMenuJob, setActionMenuJob] = useState(null)

  useEffect(() => {
    fetchJobs()
  }, [statusFilter, typeFilter])

  const fetchJobs = async () => {
    try {
      setLoading(true)
      const params = {}
      if (statusFilter) params.status = statusFilter
      if (typeFilter) params.jobType = typeFilter
      
      const { data } = await jobsApi.getAll(params)
      setJobs(data.data?.jobs || [])
    } catch (error) {
      console.error('Failed to fetch jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmAction = async () => {
    if (!confirmState.job) return

    try {
      const jobId = confirmState.job.jobId
      
      if (confirmState.type === 'cancel') {
        await jobsApi.cancel(jobId)
        toast.success('Job cancelled successfully')
      } else if (confirmState.type === 'pause') {
        await jobsApi.pause(jobId)
        toast.success('Job paused successfully')
      } else if (confirmState.type === 'resume') {
        await jobsApi.resume(jobId)
        toast.success('Job presumed successfully')
      } else if (confirmState.type === 'delete') {
        await jobsApi.delete(jobId)
        toast.success('Job deleted successfully')
      }
      
      fetchJobs()
      setConfirmState({ isOpen: false, type: null, job: null })
    } catch (error) {
      // Error handled by interceptor
    }
  }

  const openConfirm = (type, job) => {
    setConfirmState({ isOpen: true, type, job })
    setActionMenuJob(null)
  }

  const filteredJobs = jobs.filter(job => 
    job.jobName?.toLowerCase().includes(search.toLowerCase()) ||
    job.jobId?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <PageLoader />

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="section-title mb-1">Jobs</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage and monitor your scheduled jobs
          </p>
        </div>
        
        <Link to="/jobs/create" className="btn-primary">
          <Plus className="w-4 h-4" />
          Create Job
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-secondary ${showFilters ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
          >
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {/* Refresh */}
          <button onClick={fetchJobs} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Filter Options */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-4 pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
                <div>
                  <label className="label">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="input w-40"
                  >
                    <option value="">All Status</option>
                    <option value="PENDING">Pending</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="RUNNING">Running</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>
                
                <div>
                  <label className="label">Type</label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="input w-40"
                  >
                    <option value="">All Types</option>
                    <option value="ONE_TIME">One-time</option>
                    <option value="RECURRING">Recurring</option>
                  </select>
                </div>

                {(statusFilter || typeFilter) && (
                  <button
                    onClick={() => { setStatusFilter(''); setTypeFilter(''); }}
                    className="btn-ghost self-end text-sm"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Jobs List */}
      {filteredJobs.length === 0 ? (
        <EmptyState
          title="No jobs found"
          description={search ? "Try adjusting your search or filters" : "Create your first job to get started"}
          actionLabel="Create Job"
          actionLink="/jobs/create"
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Job
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Schedule
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Retries
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredJobs.map((job, index) => {
                  const isNearBottom = index >= filteredJobs.length - 2; // Last 2 rows - open upward
                  return (
                  <motion.tr
                    key={job.jobId || job._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {job.jobName}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {job.taskType}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        {job.jobType === 'RECURRING' ? (
                          <>
                            <Repeat className="w-4 h-4" />
                            Recurring
                          </>
                        ) : (
                          <>
                            <Clock className="w-4 h-4" />
                            One-time
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={job.status} showDot />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {job.nextRunAt ? format(new Date(job.nextRunAt), 'MMM d, HH:mm') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {job.retryCount || 0} / {job.maxRetries || 3}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="relative inline-block">
                        <button
                          onClick={() => setActionMenuJob(actionMenuJob === job._id ? null : job._id)}
                          className="btn-icon text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>

                        {/* Action Menu */}
                        <AnimatePresence>
                          {actionMenuJob === job._id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className={`absolute right-0 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10 ${isNearBottom ? 'bottom-full mb-2' : 'top-full mt-2'}`}
                            >
                            >
                              <div className="py-1">
                                <button
                                  onClick={() => {
                                    navigate(`/jobs/${job.jobId}/logs`)
                                    setActionMenuJob(null)
                                  }}
                                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <FileText className="w-4 h-4" />
                                  View Logs
                                </button>
                                <button
                                  onClick={() => {
                                    navigate(`/jobs/edit/${job.jobId}`)
                                    setActionMenuJob(null)
                                  }}
                                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <Edit className="w-4 h-4" />
                                  Edit Job
                                </button>
                                {['PENDING', 'SCHEDULED'].includes(job.status) && (
                                  <button
                                    onClick={() => openConfirm('pause', job)}
                                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                                  >
                                    <PauseCircle className="w-4 h-4" />
                                    Pause Job
                                  </button>
                                )}

                                {job.status === 'PAUSED' && (
                                  <button
                                    onClick={() => openConfirm('resume', job)}
                                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                                  >
                                    <PlayCircle className="w-4 h-4" />
                                    Resume Job
                                  </button>
                                )}

                                <button
                                  onClick={() => openConfirm('cancel', job)}
                                  disabled={job.status === 'COMPLETED' || job.status === 'CANCELLED'}
                                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <XCircle className="w-4 h-4" />
                                  Cancel Job
                                </button>
                                <button
                                  onClick={() => openConfirm('delete', job)}
                                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-gray-100 dark:border-gray-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete Job
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </td>
                  </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ ...confirmState, isOpen: false })}
        onConfirm={handleConfirmAction}
        title={`${confirmState.type ? confirmState.type.charAt(0).toUpperCase() + confirmState.type.slice(1) : ''} Job`}
        message={`Are you sure you want to ${confirmState.type} "${confirmState.job?.jobName}"?`}
        confirmLabel={`${confirmState.type ? confirmState.type.charAt(0).toUpperCase() + confirmState.type.slice(1) : ''} Job`}
        variant={(confirmState.type === 'cancel' || confirmState.type === 'delete') ? 'danger' : confirmState.type === 'pause' ? 'warning' : 'primary'}
      />

      {/* Click outside to close action menu */}
      {actionMenuJob && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setActionMenuJob(null)}
        />
      )}
    </div>
  )
}

export default Jobs
