import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Moon, Sun, RefreshCw, LogOut, User } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { systemApi } from '../../services/api'

const pageNames = {
  '/dashboard': 'Dashboard',
  '/jobs': 'Jobs',
  '/jobs/create': 'Create Job',
}

function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const [liveStats, setLiveStats] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const menuRef = useRef(null)

  // Get current page name
  const getPageName = () => {
    if (location.pathname.includes('/logs')) {
      return 'Job Logs'
    }
    return pageNames[location.pathname] || 'CHRONOS'
  }

  // Fetch live stats
  const fetchLiveStats = async () => {
    try {
      const { data } = await systemApi.getLiveStats()
      setLiveStats(data)
    } catch (error) {
      // Silent fail for header stats
    }
  }

  // Refresh stats
  const handleRefresh = async () => {
    setIsRefreshing(true)
    await fetchLiveStats()
    setTimeout(() => setIsRefreshing(false), 500)
  }

  // Handle signout
  const handleSignout = () => {
    logout()
    navigate('/login')
  }

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    fetchLiveStats()
    const interval = setInterval(fetchLiveStats, 30000) // Every 30 seconds
    return () => clearInterval(interval)
  }, [])

  return (
    <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
      {/* Page Title */}
      <div>
        <motion.h1 
          key={location.pathname}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-semibold text-gray-900 dark:text-white"
        >
          {getPageName()}
        </motion.h1>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* Live Stats */}
        {liveStats && (
          <div className="hidden md:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="status-dot status-dot-running" />
              <span className="text-gray-600 dark:text-gray-300">
                {liveStats.running} running
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="status-dot status-dot-scheduled" />
              <span className="text-gray-600 dark:text-gray-300">
                {liveStats.scheduled} scheduled
              </span>
            </div>
          </div>
        )}

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          className="btn-icon text-gray-500 dark:text-gray-400"
          title="Refresh stats"
        >
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="btn-icon text-gray-500 dark:text-gray-400"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* User Avatar with Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 focus:outline-none"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white font-medium text-sm cursor-pointer hover:ring-2 hover:ring-primary-500/50 transition-all">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50"
              >
                {/* User Info */}
                <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {user?.username || 'User'}
                    </span>
                  </div>
                </div>

                {/* Sign Out */}
                <button
                  onClick={handleSignout}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}

export default Header
