// API base URL - uses environment variable in production, localhost in development
const getBaseUrl = () => {
    let url = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    // Remove trailing slash if present to prevent double slashes (e.g. //api)
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

const BASE_URL = getBaseUrl();

// Create axios instance
const api = axios.create({
    baseURL: `${BASE_URL}/api`,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json'
    }
})

// Request interceptor
api.interceptors.request.use(
    (config) => {
        // Add auth token if available
        const token = localStorage.getItem('token')
        if (token) {
            config.headers.Authorization = `Bearer ${token}`
        }
        return config
    },
    (error) => {
        return Promise.reject(error)
    }
)

// Response interceptor
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const message = error.response?.data?.message || error.message || 'Something went wrong'

        // Don't show toast for specific errors
        if (!error.config?.skipToast) {
            toast.error(message)
        }

        return Promise.reject(error)
    }
)

// ═══════════════════════════════════════════════════════════════════════════
// JOB APIs
// ═══════════════════════════════════════════════════════════════════════════

export const jobsApi = {
    // Get all jobs with optional filters
    getAll: (params = {}) => api.get('/jobs', { params }),

    // Get single job by ID
    getById: (id) => api.get(`/jobs/${id}`),

    // Create new job
    create: (data) => api.post('/jobs', data),

    // Update job
    update: (id, data) => api.put(`/jobs/${id}`, data),

    // Cancel job
    cancel: (id) => api.post(`/jobs/${id}/cancel`),

    // Pause job
    pause: (id) => api.post(`/jobs/${id}/pause`),

    // Resume job
    resume: (id) => api.post(`/jobs/${id}/resume`),

    // Reschedule job
    reschedule: (id, data) => api.post(`/jobs/${id}/reschedule`, data),

    // Get job execution logs
    getLogs: (id, params = {}) => api.get(`/jobs/${id}/logs`, { params }),

    // Get job logs summary
    getLogsSummary: (id) => api.get(`/jobs/${id}/logs/summary`),

    // Delete job
    delete: (id) => api.delete(`/jobs/${id}`),
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM/MONITORING APIs
// ═══════════════════════════════════════════════════════════════════════════

export const systemApi = {
    // Get system health
    getHealth: () => api.get('/system/health', { skipToast: true }),

    // Get system statistics
    getStats: (period = '24h') => api.get('/system/stats', { params: { period } }),

    // Get live stats (lightweight)
    getLiveStats: () => api.get('/system/stats/live', { skipToast: true }),

    // Get worker stats
    getWorkers: () => api.get('/system/workers'),
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGS APIs
// ═══════════════════════════════════════════════════════════════════════════

export const logsApi = {
    // Get recent logs
    getRecent: (params = {}) => api.get('/logs/recent', { params }),
}

export default api
