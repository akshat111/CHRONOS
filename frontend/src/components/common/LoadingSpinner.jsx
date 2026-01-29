function LoadingSpinner({ size = 'default', className = '' }) {
  const sizeClasses = {
    small: 'w-4 h-4',
    default: 'w-8 h-8',
    large: 'w-12 h-12',
  }

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className={`
          ${sizeClasses[size]}
          border-2 border-gray-200 dark:border-gray-700
          border-t-primary-600
          rounded-full
          animate-spin
        `}
      />
    </div>
  )
}

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <LoadingSpinner size="large" />
      <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading...</p>
    </div>
  )
}

export { LoadingSpinner, PageLoader }
export default LoadingSpinner
