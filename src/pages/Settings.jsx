import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sun,
  Moon,
  Monitor,
  User,
  Wallet,
  Briefcase,
  Bell,
  Shield,
  HelpCircle,
  LogOut,
  ChevronRight,
  CreditCard,
  Clock,
  DollarSign,
  FileCheck,
  Zap,
  MapPin,
  BellRing,
  MessageSquare,
  Lock,
  Eye,
  Smartphone,
  Mail,
  Phone,
} from 'lucide-react'

const Settings = () => {
  const { user, logout } = useAuth()
  const { themeMode, setTheme } = useTheme()
  const navigate = useNavigate()

  // Estados para switches
  const [emergencyMode, setEmergencyMode] = useState(false)
  const [pushNotifications, setPushNotifications] = useState(true)
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [smsNotifications, setSmsNotifications] = useState(false)
  const [workRequestNotifications, setWorkRequestNotifications] = useState(true)
  const [messageNotifications, setMessageNotifications] = useState(true)

  // Scroll para o topo ao montar o componente
  React.useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 py-8 space-y-6 pb-24">
      <h1 className="text-3xl font-bold mb-6">Configurações</h1>

      {/* 1. Conta e Perfil */}
      <Card className="overflow-hidden border-border/50">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <User className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Conta e Perfil</h2>
          </div>

          <Button
            onClick={() => navigate('/me/edit')}
            className="w-full justify-between bg-primary hover:bg-primary/90"
          >
            <span>Editar Perfil</span>
            <ChevronRight className="w-4 h-4" />
          </Button>

          <div className="pt-2 space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>Alterar foto e informações pessoais</span>
            </div>
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              <span>Gerenciar categorias de serviços</span>
            </div>
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4" />
              <span>Verificação de conta e documentos</span>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Pagamentos e Carteira */}
      <Card className="overflow-hidden border-border/50">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Wallet className="w-5 h-5 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold">Pagamentos e Carteira</h2>
          </div>

          <div className="grid gap-3">
            <button
              onClick={() => navigate('/wallet')}
              className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all"
            >
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-green-500" />
                <div className="text-left">
                  <p className="font-medium">Minha Carteira</p>
                  <p className="text-xs text-muted-foreground">
                    Ver saldo e histórico
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <button className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all">
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-blue-500" />
                <div className="text-left">
                  <p className="font-medium">Dados de Pagamento</p>
                  <p className="text-xs text-muted-foreground">
                    Cartões e contas bancárias
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <button className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-purple-500" />
                <div className="text-left">
                  <p className="font-medium">Histórico de Transações</p>
                  <p className="text-xs text-muted-foreground">
                    Pagamentos e recebimentos
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </Card>

      {/* 3. Preferências de Trabalho */}
      <Card className="overflow-hidden border-border/50">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Briefcase className="w-5 h-5 text-orange-500" />
            </div>
            <h2 className="text-xl font-semibold">Preferências de Trabalho</h2>
          </div>

          <div className="space-y-4">
            {/* Atendimento de Emergência */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-red-500" />
                <div>
                  <p className="font-medium">Atendimento de Emergência</p>
                  <p className="text-xs text-muted-foreground">
                    Receba solicitações urgentes
                  </p>
                </div>
              </div>
              <Switch
                checked={emergencyMode}
                onCheckedChange={setEmergencyMode}
              />
            </div>

            {/* Área de Atuação */}
            <button className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all w-full">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-blue-500" />
                <div className="text-left">
                  <p className="font-medium">Área de Atuação</p>
                  <p className="text-xs text-muted-foreground">
                    Definir raio de atendimento
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            {/* Disponibilidade */}
            <button className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all w-full">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-green-500" />
                <div className="text-left">
                  <p className="font-medium">Horários de Disponibilidade</p>
                  <p className="text-xs text-muted-foreground">
                    Configurar agenda de trabalho
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            {/* Preços */}
            <button className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all w-full">
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-green-500" />
                <div className="text-left">
                  <p className="font-medium">Preços e Tarifas</p>
                  <p className="text-xs text-muted-foreground">
                    Configurar valores dos serviços
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </Card>

      {/* 4. Notificações */}
      <Card className="overflow-hidden border-border/50">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Bell className="w-5 h-5 text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold">Notificações</h2>
          </div>

          <div className="space-y-4">
            {/* Push Notifications */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <BellRing className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium">Notificações Push</p>
                  <p className="text-xs text-muted-foreground">
                    Alertas no dispositivo
                  </p>
                </div>
              </div>
              <Switch
                checked={pushNotifications}
                onCheckedChange={setPushNotifications}
              />
            </div>

            {/* Email */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="font-medium">Notificações por Email</p>
                  <p className="text-xs text-muted-foreground">
                    Receber emails importantes
                  </p>
                </div>
              </div>
              <Switch
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
              />
            </div>

            {/* SMS */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-green-500" />
                <div>
                  <p className="font-medium">Notificações por SMS</p>
                  <p className="text-xs text-muted-foreground">
                    Alertas via mensagem de texto
                  </p>
                </div>
              </div>
              <Switch
                checked={smsNotifications}
                onCheckedChange={setSmsNotifications}
              />
            </div>

            {/* Solicitações de Trabalho */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <Briefcase className="w-5 h-5 text-orange-500" />
                <div>
                  <p className="font-medium">Solicitações de Trabalho</p>
                  <p className="text-xs text-muted-foreground">
                    Novos pedidos de serviço
                  </p>
                </div>
              </div>
              <Switch
                checked={workRequestNotifications}
                onCheckedChange={setWorkRequestNotifications}
              />
            </div>

            {/* Mensagens */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="font-medium">Mensagens</p>
                  <p className="text-xs text-muted-foreground">
                    Novas mensagens de chat
                  </p>
                </div>
              </div>
              <Switch
                checked={messageNotifications}
                onCheckedChange={setMessageNotifications}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 5. Aparência */}
      <Card className="overflow-hidden border-border/50">
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Sun className="w-5 h-5 text-purple-500" />
            </div>
            <h2 className="text-xl font-semibold">Aparência</h2>
          </div>

          {/* Abas com efeito de brilho */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Tema do aplicativo</Label>
            <div className="flex border-b border-border">
              {/* Aba Claro */}
              <button
                onClick={() => setTheme('light')}
                className={`relative flex-1 px-4 py-3 text-sm font-medium transition-all duration-300 ${
                  themeMode === 'light'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Sun className="w-4 h-4" />
                  <span>Claro</span>
                </div>
                {themeMode === 'light' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_rgba(251,146,60,0.8)]" />
                )}
              </button>

              {/* Aba Escuro */}
              <button
                onClick={() => setTheme('dark')}
                className={`relative flex-1 px-4 py-3 text-sm font-medium transition-all duration-300 ${
                  themeMode === 'dark'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Moon className="w-4 h-4" />
                  <span>Escuro</span>
                </div>
                {themeMode === 'dark' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_rgba(251,146,60,0.8)]" />
                )}
              </button>

              {/* Aba Sistema */}
              <button
                onClick={() => setTheme('system')}
                className={`relative flex-1 px-4 py-3 text-sm font-medium transition-all duration-300 ${
                  themeMode === 'system'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Monitor className="w-4 h-4" />
                  <span>Sistema</span>
                </div>
                {themeMode === 'system' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_rgba(251,146,60,0.8)]" />
                )}
              </button>
            </div>

            {/* Descrição do tema selecionado */}
            <div className="pt-2 p-4 rounded-lg bg-accent/30">
              <p className="text-sm text-muted-foreground">
                {themeMode === 'system'
                  ? 'O tema segue automaticamente as configurações do seu dispositivo'
                  : themeMode === 'light'
                  ? 'Tema claro ativado - perfeito para ambientes bem iluminados'
                  : 'Tema escuro ativado - ideal para reduzir o cansaço visual'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* 6. Segurança e Privacidade */}
      <Card className="overflow-hidden border-border/50">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-red-500/10">
              <Shield className="w-5 h-5 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold">Segurança e Privacidade</h2>
          </div>

          <div className="grid gap-3">
            <button className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-red-500" />
                <div className="text-left">
                  <p className="font-medium">Alterar Senha</p>
                  <p className="text-xs text-muted-foreground">
                    Proteja sua conta
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <button className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-blue-500" />
                <div className="text-left">
                  <p className="font-medium">Dispositivos Conectados</p>
                  <p className="text-xs text-muted-foreground">
                    Gerenciar sessões ativas
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <button className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all">
              <div className="flex items-center gap-3">
                <Eye className="w-5 h-5 text-purple-500" />
                <div className="text-left">
                  <p className="font-medium">Privacidade do Perfil</p>
                  <p className="text-xs text-muted-foreground">
                    Controlar visibilidade
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <button
              onClick={() => navigate('/terms')}
              className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all"
            >
              <div className="flex items-center gap-3">
                <FileCheck className="w-5 h-5 text-green-500" />
                <div className="text-left">
                  <p className="font-medium">Termos de Uso</p>
                  <p className="text-xs text-muted-foreground">
                    Ler termos e condições
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => navigate('/privacy')}
              className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all"
            >
              <div className="flex items-center gap-3">
                <FileCheck className="w-5 h-5 text-blue-500" />
                <div className="text-left">
                  <p className="font-medium">Política de Privacidade</p>
                  <p className="text-xs text-muted-foreground">
                    LGPD e proteção de dados
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </Card>

      {/* 7. Suporte */}
      <Card className="overflow-hidden border-border/50">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <HelpCircle className="w-5 h-5 text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold">Suporte</h2>
          </div>

          <div className="grid gap-3">
            <button className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all">
              <div className="flex items-center gap-3">
                <HelpCircle className="w-5 h-5 text-blue-500" />
                <div className="text-left">
                  <p className="font-medium">Central de Ajuda</p>
                  <p className="text-xs text-muted-foreground">
                    Perguntas frequentes e tutoriais
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <button className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-green-500" />
                <div className="text-left">
                  <p className="font-medium">Falar com Suporte</p>
                  <p className="text-xs text-muted-foreground">
                    Chat em tempo real
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <button className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-yellow-500" />
                <div className="text-left">
                  <p className="font-medium">Disputas e Reclamações</p>
                  <p className="text-xs text-muted-foreground">
                    Resolver problemas
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <button className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-purple-500" />
                <div className="text-left">
                  <p className="font-medium">Feedback e Sugestões</p>
                  <p className="text-xs text-muted-foreground">
                    Ajude-nos a melhorar
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <div className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">
              Versão 1.0.0 • Joby © 2025
            </p>
          </div>
        </div>
      </Card>

      {/* 8. Sair */}
      <Card className="overflow-hidden border-red-500/30">
        <div className="p-6">
          <Button
            variant="destructive"
            onClick={handleLogout}
            className="w-full justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da Conta</span>
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default Settings
