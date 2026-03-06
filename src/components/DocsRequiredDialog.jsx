import React from 'react'
import { useNavigate } from 'react-router-dom'
import { log } from '@/lib/logger'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const DocsRequiredDialog = ({ open, onOpenChange }) => {
  const navigate = useNavigate()

  const navDebugLog = (to, reason) => {
    const dest = String(to || '')
    if (!dest) return
    if (!dest.startsWith('/me/edit') && !dest.startsWith('/login')) return
    try {
      if (import.meta.env.DEV) log.debug('NAV', dest, reason, new Error().stack)
    } catch {
      // ignore
    }
  }

  const navigateWithReason = (to, { reason, ...opts } = {}) => {
    navDebugLog(to, reason)
    navigate(to, opts)
  }

  return (
    <Dialog open={!!open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Documentação obrigatória</DialogTitle>
          <DialogDescription>
            Para oferecer serviços no JOBY, é obrigatório cadastrar CPF ou CNPJ em Informações pessoais.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>
            Agora não
          </Button>
          <Button
            className="joby-gradient text-primary-foreground"
            onClick={() => {
              onOpenChange?.(false)
              navigateWithReason('/me/edit?tab=personal', {
                reason: 'docs_required:go_to_personal_tab',
              })
            }}
          >
            Ir para Informações pessoais
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DocsRequiredDialog
