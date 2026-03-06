import React from 'react'
import { Card } from '@/components/ui/card'

const EmptyState = ({ title = 'Nada por aqui', message = '' }) => {
  return (
    <Card className="p-8 text-center">
      <p className="text-base font-semibold text-foreground">{title}</p>
      {String(message || '').trim() ? (
        <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
          {String(message)}
        </p>
      ) : null}
    </Card>
  )
}

export default EmptyState
