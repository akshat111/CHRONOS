import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { 
  ArrowLeft, CheckCircle, XCircle, Clock, 
  RefreshCw, AlertTriangle, Timer
} from 'lucide-react'
import { jobsApi } from '../services/api'
import { StatusBadge, PageLoader, EmptyState } from '../components/common'

function JobLogs() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [logs, setLogs] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchData()
  }, [id])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [logsRes, summaryRes] = await Promise.all([
        jobsApi.getLogs(id, { limit: 50 }),
        jobsApi.getLogsSummary(id)
      ])
      
      setJob(logsRes.data.data?.job)
      setLogs(logsRes.data.data?.logs || [])
      setSummary(summaryRes.data.data?.summary)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'FAILED':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'TIMEOUT':
        return <Timer className="w-5 h-5 text-amber-500" />
      case 'RUNNING':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
      default:
        return <Clock className="w-5 h-5 text-gray-400" />
    }
  }

  if (loading) return <PageLoader />

  if (error) {
    return (
      <div className="page-container">
        <EmptyState
          type="error"
          title="Failed to load logs"
          description={error}
          actionLabel="Try Again"
          onAction={fetchData}
        />
      </div>
    )
  }

  return (
    <div className="page-container">
      {/* Back Button */}
      <button
        onClick={() => navigate('/jobs')}
        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Jobs
      </button>

      {/* Job Header */}
      <div className="card p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {job?.name || job?.jobName || 'Job Logs'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {job?.taskType} • {job?.id || id}
            </p>
          </div>
          <StatusBadge status={job?.status} size="large" showDot />
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-4 text-center"
          >
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {summary.totalExecutions}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Total Runs
            </p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="card p-4 text-center"
          >
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">
              {summary.successRate}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Success Rate
            </p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card p-4 text-center"
          >
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {summary.avgDuration}ms
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Avg Duration
            </p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="card p-4 text-center"
          >
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              {summary.retryCount}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Retries
            </p>
          </motion.div>
        </div>
      )}

      {/* Execution Timeline */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Execution History
          </h2>
          <button onClick={fetchData} className="btn-secondary text-sm">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {logs.length === 0 ? (
          <EmptyState
            title="No executions yet"
            description="This job hasn't been executed yet. Check back after the scheduled time."
          />
        ) : (
          <div className="space-y-4">
            {logs.map((log, index) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="relative pl-8 pb-6 border-l-2 border-gray-200 dark:border-gray-700 last:border-transparent last:pb-0"
              >
                {/* Timeline dot */}
                <div className="absolute left-0 -translate-x-1/2 bg-white dark:bg-gray-800 p-1">
                  {getStatusIcon(log.status)}
                </div>

                {/* Log Card */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 ml-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={log.status} />
                      {log.isRetry && (
                        <span className="badge bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Retry #{log.attempt}
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {log.executedAt ? format(new Date(log.executedAt), 'MMM d, yyyy HH:mm:ss') : '-'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Duration</p>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {log.duration ? `${log.duration}ms` : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Worker</p>
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {log.workerId?.split('_').pop() || '-'}
                      </p>
                    </div>
                    {log.result && (
                      <div className="col-span-2">
                        <p className="text-gray-500 dark:text-gray-400">Result</p>
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {typeof log.result === 'object' ? JSON.stringify(log.result) : log.result}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Error Message */}
                  {log.error && (
                    <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-red-700 dark:text-red-400">
                            {log.error.code || 'Error'}
                          </p>
                          <p className="text-sm text-red-600 dark:text-red-300">
                            {log.error.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default JobLogs
