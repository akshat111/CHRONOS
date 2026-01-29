import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clock, Repeat, AlertCircle, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { jobsApi } from '../services/api'

const taskTypes = [
  { value: 'sendEmail', label: 'Send Email' },
  { value: 'generateReport', label: 'Generate Report' },
  { value: 'cleanup', label: 'Cleanup' },
  { value: 'healthCheck', label: 'Health Check' },
  { value: 'dataSync', label: 'Data Sync' },
  { value: 'backup', label: 'Backup' },
  { value: 'notification', label: 'Notification' },
]

const getPayloadTemplate = (type) => {
  switch(type) {
    case 'sendEmail': 
      return '{\n  "to": "user@example.com",\n  "subject": "Test Job",\n  "body": "This is a test email from Chronos"\n}';
    case 'generateReport': 
      return '{\n  "reportType": "summary",\n  "format": "pdf",\n  "dateRange": "last_24h"\n}';
    case 'cleanup': 
      return '{\n  "target": "temp_files",\n  "ageHours": 24\n}';
    case 'healthCheck': 
      return '{\n  "services": ["api", "database", "cache"]\n}';
    case 'dataSync': 
      return '{\n  "source": "db_primary",\n  "destination": "db_replica"\n}';
    case 'notification': 
      return '{\n  "userId": "user_123",\n  "title": "System Update",\n  "message": "Maintenance scheduled"\n}';
    case 'backup': 
      return '{\n  "type": "full",\n  "compression": true\n}';
    default: 
      return '{}';
  }
}

function CreateJob() {
  const navigate = useNavigate()
  const { jobId } = useParams()
  const isEditing = !!jobId
  const [loading, setLoading] = useState(false)
  const [jobType, setJobType] = useState('ONE_TIME')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState({})
  
  // Dependency Search State
  const [parentSearch, setParentSearch] = useState('')
  const [parentJobs, setParentJobs] = useState([])
  const [showParentDropdown, setShowParentDropdown] = useState(false)

  const [formData, setFormData] = useState({
    jobName: '',
    taskType: 'sendEmail',
    dependsOnJobId: '', // Added field
    scheduleTime: '',
    interval: '',
    cronExpression: '',
    maxRetries: 3,
    retryDelay: 60,
    priority: 5,
    payload: getPayloadTemplate('sendEmail'),
  })

  // Update payload template when task type changes (only in Create mode)
  useEffect(() => {
    if (!isEditing) {
      setFormData(prev => ({
        ...prev,
        payload: getPayloadTemplate(prev.taskType)
      }));
    }
  }, [formData.taskType, isEditing]);

  // Fetch job details for editing
  useEffect(() => {
    if (isEditing) {
      fetchJobDetails()
    }
  }, [jobId])

  const fetchJobDetails = async () => {
    try {
      setLoading(true)
      const { data } = await jobsApi.getById(jobId)
      const job = data.data.job
      
      setJobType(job.jobType)
      
      setFormData({
        jobName: job.jobName,
        taskType: job.taskType,
        dependsOnJobId: job.dependsOnJobId?.jobId || job.dependsOnJobId || '',
        scheduleTime: job.scheduleTime ? formatDateTimeLocal(job.scheduleTime) : '',
        interval: job.interval ? Math.floor(job.interval / 60000) : '', // ms to min
        cronExpression: job.cronExpression || '',
        maxRetries: job.maxRetries || 3,
        retryDelay: job.retryDelay ? Math.floor(job.retryDelay / 1000) : 60, // ms to sec
        priority: job.priority || 5,
        payload: JSON.stringify(job.payload || {}, null, 2),
      })
    } catch (error) {
      console.error('Failed to fetch job:', error)
      toast.error('Failed to load job details')
      navigate('/jobs')
    } finally {
      setLoading(false)
    }

  }

  // Search Parent Jobs
  useEffect(() => {
    const searchParents = async () => {
        if (!parentSearch.trim()) {
            setParentJobs([]);
            return;
        }
        try {
            const { data } = await jobsApi.getAll({ search: parentSearch, limit: 5 });
            setParentJobs(data.data?.jobs || []);
        } catch (e) {
            console.error(e);
        }
    };
    
    const timeoutId = setTimeout(searchParents, 300);
    return () => clearTimeout(timeoutId);
  }, [parentSearch]);

  const selectParent = (job) => {
      setFormData(prev => ({ ...prev, dependsOnJobId: job.jobId }));
      setParentSearch('');
      setShowParentDropdown(false);
  };


  // Helper to format date for datetime-local input
  const formatDateTimeLocal = (isoString) => {
    const date = new Date(isoString);
    const offset = date.getTimezoneOffset() * 60000; // offset in milliseconds
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().slice(0, 16);
  }


  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    // Clear error when user types
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }))
    }
  }

  const validate = () => {
    const newErrors = {}
    
    if (!formData.jobName.trim()) {
      newErrors.jobName = 'Job name is required'
    }
    
    if (jobType === 'ONE_TIME' && !formData.scheduleTime) {
      newErrors.scheduleTime = 'Schedule time is required'
    }
    
    if (jobType === 'RECURRING') {
      if (!formData.interval && !formData.cronExpression) {
        newErrors.interval = 'Either interval or cron expression is required'
      }
    }

    try {
      JSON.parse(formData.payload || '{}')
    } catch {
      newErrors.payload = 'Invalid JSON format'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validate()) return

    setIsSubmitting(true)
    
    try {
      const data = {
        jobName: formData.jobName,
        taskType: formData.taskType,
        jobType,
        maxRetries: parseInt(formData.maxRetries),
        retryDelay: parseInt(formData.retryDelay) * 1000, // Convert to ms
        priority: parseInt(formData.priority),

        payload: JSON.parse(formData.payload || '{}'),
      }
      
      if (formData.dependsOnJobId) {
          data.dependsOnJobId = formData.dependsOnJobId;
      }

      if (jobType === 'ONE_TIME') {
        data.scheduleTime = new Date(formData.scheduleTime).toISOString()
      } else {
        if (formData.interval) {
          data.interval = parseInt(formData.interval) * 60000 // Convert minutes to ms
        }
        if (formData.cronExpression) {
          data.cronExpression = formData.cronExpression
        }
      }

      if (isEditing) {
        await jobsApi.update(jobId, data)
        toast.success('Job updated successfully!')
      } else {
        await jobsApi.create(data)
        toast.success('Job created successfully!')
      }
      navigate('/jobs')
    } catch (error) {
      // Error handled by interceptor
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="page-container max-w-3xl">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Jobs
      </button>

      <div className="card p-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {isEditing ? 'Edit Job' : 'Create New Job'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          {isEditing ? 'Update job details and schedule' : 'Schedule a new job for execution'}
        </p>

        {/* Job Type Selector */}
        <div className="flex gap-4 mb-8">
          <button
            type="button"
            onClick={() => setJobType('ONE_TIME')}
            className={`
              flex-1 flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all
              ${jobType === 'ONE_TIME'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }
            `}
          >
            <Clock className={`w-5 h-5 ${jobType === 'ONE_TIME' ? 'text-primary-600' : 'text-gray-400'}`} />
            <div className="text-left">
              <p className={`font-medium ${jobType === 'ONE_TIME' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'}`}>
                One-time Job
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Run once at scheduled time
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setJobType('RECURRING')}
            className={`
              flex-1 flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all
              ${jobType === 'RECURRING'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }
            `}
          >
            <Repeat className={`w-5 h-5 ${jobType === 'RECURRING' ? 'text-primary-600' : 'text-gray-400'}`} />
            <div className="text-left">
              <p className={`font-medium ${jobType === 'RECURRING' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'}`}>
                Recurring Job
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Run repeatedly on schedule
              </p>
            </div>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Job Name */}
          <div>
            <label className="label">Job Name *</label>
            <input
              type="text"
              name="jobName"
              value={formData.jobName}
              onChange={handleChange}
              placeholder="e.g., Daily Report Generation"
              className={errors.jobName ? 'input-error' : 'input'}
            />
            {errors.jobName && (
              <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.jobName}
              </p>
            )}
          </div>



          {/* Dependency Selection */}
          <div className="relative">
            <label className="label">Depends On (Optional Parent Job)</label>
            <div className="flex gap-2">
                <input
                  type="text"
                  name="dependsOnJobId"
                  value={formData.dependsOnJobId}
                  onChange={handleChange}
                  placeholder="Enter Job ID or Search..."
                  className="input"
                />
                <div className="relative">
                    <input 
                        type="text" 
                        placeholder="Search by Name" 
                        className="input w-48"
                        value={parentSearch}
                        onChange={(e) => { setParentSearch(e.target.value); setShowParentDropdown(true); }}
                        onFocus={() => setShowParentDropdown(true)}
                    />
                     {showParentDropdown && parentJobs.length > 0 && (
                        <div className="absolute top-full right-0 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg mt-1 z-10 max-h-48 overflow-y-auto">
                            {parentJobs.map(job => (
                                <button
                                    key={job.jobId}
                                    type="button"
                                    onClick={() => selectParent(job)}
                                    className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0"
                                >
                                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{job.jobName}</p>
                                    <p className="text-xs text-gray-500 truncate">{job.jobId}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">
                This job will wait until the parent job completes successfully.
            </p>
          </div>

          {/* Task Type */}
          <div>
            <label className="label">Task Type *</label>
            <select
              name="taskType"
              value={formData.taskType}
              onChange={handleChange}
              className="input"
            >
              {taskTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Schedule Section */}
          <motion.div
            key={jobType}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-6"
          >
            {jobType === 'ONE_TIME' ? (
              <div>
                <label className="label">Schedule Time *</label>
                <input
                  type="datetime-local"
                  name="scheduleTime"
                  value={formData.scheduleTime}
                  onChange={handleChange}
                  className={errors.scheduleTime ? 'input-error' : 'input'}
                />
                {errors.scheduleTime && (
                  <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors.scheduleTime}
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="label">Interval (minutes)</label>
                  <input
                    type="number"
                    name="interval"
                    value={formData.interval}
                    onChange={handleChange}
                    placeholder="e.g., 60"
                    min="1"
                    className={errors.interval ? 'input-error' : 'input'}
                  />
                  {errors.interval && (
                    <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {errors.interval}
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">Cron Expression</label>
                  <input
                    type="text"
                    name="cronExpression"
                    value={formData.cronExpression}
                    onChange={handleChange}
                    placeholder="e.g., 0 9 * * *"
                    className="input"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Optional: Use cron syntax for complex schedules
                  </p>
                </div>
              </div>
            )}
          </motion.div>

          {/* Retry Settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="label">Max Retries</label>
              <input
                type="number"
                name="maxRetries"
                value={formData.maxRetries}
                onChange={handleChange}
                min="0"
                max="10"
                className="input"
              />
            </div>
            <div>
              <label className="label">Retry Delay (seconds)</label>
              <input
                type="number"
                name="retryDelay"
                value={formData.retryDelay}
                onChange={handleChange}
                min="1"
                className="input"
              />
            </div>
            <div>
              <label className="label">Priority</label>
              <input
                type="number"
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                min="0"
                max="10"
                className="input"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Lower = higher priority
              </p>
            </div>
          </div>

          {/* Payload */}
          <div>
            <label className="label">Payload (JSON)</label>
            <textarea
              name="payload"
              value={formData.payload}
              onChange={handleChange}
              rows={4}
              placeholder='{"key": "value"}'
              className={`${errors.payload ? 'input-error' : 'input'} font-mono text-sm`}
            />
            {errors.payload && (
              <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.payload}
              </p>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-4 pt-4">
            <button
              type="button"
              onClick={() => navigate('/jobs')}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update Job' : 'Create Job')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateJob
