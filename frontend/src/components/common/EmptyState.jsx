import { motion } from 'framer-motion'
import { Inbox, AlertTriangle, Search, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'

const illustrations = {
  empty: Inbox,
  error: AlertTriangle,
  search: Search,
}

function EmptyState({ 
  type = 'empty',
  title = 'No data found',
  description = 'There is no data to display at the moment.',
  actionLabel,
  actionLink,
  onAction
}) {
  const Icon = illustrations[type] || illustrations.empty

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
        {title}
      </h3>
      
      <p className="text-gray-500 dark:text-gray-400 text-center max-w-md mb-6">
        {description}
      </p>

      {(actionLabel && (actionLink || onAction)) && (
        actionLink ? (
          <Link to={actionLink} className="btn-primary">
            <Plus className="w-4 h-4" />
            {actionLabel}
          </Link>
        ) : (
          <button onClick={onAction} className="btn-primary">
            <Plus className="w-4 h-4" />
            {actionLabel}
          </button>
        )
      )}
    </motion.div>
  )
}

export default EmptyState
