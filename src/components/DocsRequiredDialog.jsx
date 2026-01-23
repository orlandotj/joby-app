import React from 'react'
import { useNavigate } from 'react-router-dom'
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
              navigate('/me/edit?tab=personal')
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
