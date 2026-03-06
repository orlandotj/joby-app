import React from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const ErrorState = ({ title = 'Algo deu errado', message = '', onRetry }) => {
  const canRetry = typeof onRetry === 'function'

  return (
    <Card className="p-6 text-center">
      <p className="text-base font-semibold text-foreground">{title}</p>
      {String(message || '').trim() ? (
        <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
          {String(message)}
        </p>
      ) : null}
      {canRetry ? (
        <div className="mt-4">
          <Button variant="outline" onClick={onRetry}>
            Tentar novamente
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

export default ErrorState
