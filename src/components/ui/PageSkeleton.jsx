import React from 'react'

const Block = ({ className = '' }) => (
  <div className={`rounded-md bg-muted/50 animate-pulse ${className}`} />
)

const PageSkeleton = ({ title = 'Carregando…' } = {}) => {
  return (
    <div className="w-full">
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>
      <div className="space-y-3">
        <Block className="h-10 w-full" />
        <Block className="h-24 w-full" />
        <Block className="h-24 w-full" />
        <Block className="h-24 w-full" />
      </div>
    </div>
  )
}

export default PageSkeleton
