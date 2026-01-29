import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { 
  Clock, CheckCircle, XCircle, Play, TrendingUp, 
  Activity, Zap, Calendar
} from 'lucide-react'
import { systemApi } from '../services/api'
import { StatCard, PageLoader, EmptyState } from '../components/common'

const COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#6366f1']

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('24h')

  useEffect(() => {
    fetchStats()
  }, [period])

  const fetchStats = async () => {
    try {
      setLoading(true)
      const { data } = await systemApi.getStats(period)
      setStats(data.data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <PageLoader />
  
  if (error) {
    return (
      <EmptyState 
        type="error"
        title="Failed to load statistics"
        description={error}
        actionLabel="Try Again"
        onAction={fetchStats}
      />
    )
  }

  // Prepare chart data
  const statusData = stats ? [
    { name: 'Completed', value: stats.jobs?.completed || 0 },
    { name: 'Failed', value: stats.jobs?.failed || 0 },
    { name: 'Running', value: stats.jobs?.byStatus?.RUNNING || 0 },
    { name: 'Scheduled', value: stats.jobs?.byStatus?.SCHEDULED || 0 },
  ] : []

  const hourlyData = stats?.hourlyTrend || []

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title mb-1">Dashboard Overview</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Monitor your job scheduling system performance
          </p>
        </div>
        
        {/* Period Selector */}
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
          {['1h', '6h', '24h', '7d'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Jobs"
          value={stats?.jobs?.total || 0}
          subtitle={`${stats?.jobs?.byType?.RECURRING || 0} recurring`}
          icon={Clock}
          color="primary"
        />
        <StatCard
          title="Running"
          value={stats?.jobs?.byStatus?.RUNNING || 0}
          subtitle="Active right now"
          icon={Play}
          color="warning"
        />
        <StatCard
          title="Completed"
          value={stats?.jobs?.completed || 0}
          subtitle={stats?.executions?.successRate || '0%'}
          icon={CheckCircle}
          color="success"
        />
        <StatCard
          title="Failed"
          value={stats?.jobs?.failed || 0}
          subtitle={`${stats?.executions?.retries || 0} retried`}
          icon={XCircle}
          color="danger"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Hourly Trend Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Execution Trend
            </h3>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-gray-600 dark:text-gray-400">Success</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-gray-600 dark:text-gray-400">Failed</span>
              </div>
            </div>
          </div>
          
          {hourlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis 
                  dataKey="_id" 
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  tickFormatter={(value) => value?.split(' ')[1] || value}
                />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    color: '#111827'
                  }}
                  cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
                />
                <Bar dataKey="success" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
              No data available for this period
            </div>
          )}
        </motion.div>

        {/* Status Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Job Status
          </h3>
          
          {statusData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusData.filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    color: '#111827'
                  }}
                  cursor="pointer"
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value) => (
                    <span className="text-gray-600 dark:text-gray-400">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
              No jobs to display
            </div>
          )}
        </motion.div>
      </div>

      {/* Execution Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="card p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
          Execution Metrics
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
            <Activity className="w-8 h-8 text-primary-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.executions?.total || 0}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Total Executions
            </p>
          </div>
          
          <div className="text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
            <TrendingUp className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.executions?.successRate || '0%'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Success Rate
            </p>
          </div>
          
          <div className="text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
            <Zap className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.executions?.avgDuration || 0}ms
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Avg Duration
            </p>
          </div>
          
          <div className="text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
            <Calendar className="w-8 h-8 text-purple-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.jobs?.byStatus?.SCHEDULED || 0}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Scheduled
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Dashboard
