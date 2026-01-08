interface SkeletonLoaderProps {
  type?: 'card' | 'table' | 'list' | 'avatar' | 'text' | 'custom';
  count?: number;
  className?: string;
}

const SkeletonLoader = ({ 
  type = 'card', 
  count = 1, 
  className = '' 
}: SkeletonLoaderProps) => {
  const baseClass = "animate-pulse bg-gradient-to-r from-primary-100 via-primary-200 to-primary-100 bg-[length:200%_100%] animate-shimmer";
  
  const renderSkeleton = () => {
    switch (type) {
      case 'card':
        return (
          <div className={`bg-surface rounded-xl p-6 shadow-navy border border-primary-100/20 ${className}`}>
            <div className="flex items-center space-x-4 mb-4">
              <div className={`${baseClass} w-12 h-12 rounded-full`}></div>
              <div className="flex-1 space-y-2">
                <div className={`${baseClass} h-4 rounded w-3/4`}></div>
                <div className={`${baseClass} h-3 rounded w-1/2`}></div>
              </div>
            </div>
            <div className="space-y-3">
              <div className={`${baseClass} h-3 rounded`}></div>
              <div className={`${baseClass} h-3 rounded w-5/6`}></div>
              <div className={`${baseClass} h-3 rounded w-4/6`}></div>
            </div>
          </div>
        );
        
      case 'table':
        return (
          <div className={`space-y-3 ${className}`}>
            {/* Table header */}
            <div className="flex space-x-4 pb-3 border-b border-primary-100/30">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={`${baseClass} h-4 rounded flex-1`}></div>
              ))}
            </div>
            {/* Table rows */}
            {[1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="flex space-x-4 py-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className={`${baseClass} h-3 rounded flex-1`}></div>
                ))}
              </div>
            ))}
          </div>
        );
        
      case 'list':
        return (
          <div className={`space-y-4 ${className}`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center space-x-3">
                <div className={`${baseClass} w-10 h-10 rounded-full`}></div>
                <div className="flex-1 space-y-2">
                  <div className={`${baseClass} h-4 rounded w-3/4`}></div>
                  <div className={`${baseClass} h-3 rounded w-1/2`}></div>
                </div>
              </div>
            ))}
          </div>
        );
        
      case 'avatar':
        return (
          <div className={`${baseClass} w-10 h-10 rounded-full ${className}`}></div>
        );
        
      case 'text':
        return (
          <div className={`space-y-2 ${className}`}>
            <div className={`${baseClass} h-4 rounded`}></div>
            <div className={`${baseClass} h-4 rounded w-5/6`}></div>
            <div className={`${baseClass} h-4 rounded w-4/6`}></div>
          </div>
        );
        
      case 'custom':
        return (
          <div className={`${baseClass} rounded-lg ${className}`}></div>
        );
        
      default:
        return (
          <div className={`${baseClass} rounded-lg h-20 ${className}`}></div>
        );
    }
  };

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>{renderSkeleton()}</div>
      ))}
    </>
  );
};

export default SkeletonLoader;
