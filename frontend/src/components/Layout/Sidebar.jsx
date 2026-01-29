import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  LayoutDashboard, 
  Clock, 
  PlusCircle, 
  Zap
} from 'lucide-react'

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/jobs', label: 'Jobs', icon: Clock },
  { path: '/jobs/create', label: 'Create Job', icon: PlusCircle },
]

function Sidebar() {
  const location = useLocation()

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-gray-200 dark:border-gray-700">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold gradient-text">CHRONOS</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Job Scheduler</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path === '/jobs' && location.pathname.startsWith('/jobs') && location.pathname !== '/jobs/create')
          
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className="relative block"
            >
              {isActive && (
                <motion.div
                  layoutId="activeNav"
                  className="absolute inset-0 bg-primary-50 dark:bg-primary-900/20 rounded-lg"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <div className={`
                relative flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                ${isActive 
                  ? 'text-primary-600 dark:text-primary-400 font-medium' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }
              `}>
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </div>
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}

export default Sidebar
