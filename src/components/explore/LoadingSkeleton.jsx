import React from 'react';

const LoadingSkeleton = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl overflow-hidden bg-card shadow animate-pulse">
          <div className="p-4">
            <div className="flex items-center space-x-3 mb-3">
              <div className="h-14 w-14 rounded-full bg-muted"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-muted rounded"></div>
                <div className="h-3 w-1/2 bg-muted rounded"></div>
              </div>
            </div>
            <div className="h-4 w-full bg-muted rounded mb-2"></div>
            <div className="h-4 w-5/6 bg-muted rounded mb-3"></div>
            <div className="flex justify-between">
              <div className="h-4 w-1/4 bg-muted rounded"></div>
              <div className="h-4 w-1/3 bg-muted rounded"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LoadingSkeleton;