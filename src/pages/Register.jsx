import React, { useState, useEffect } from 'react'
import { Autocomplete } from '@/components/ui/autocomplete'
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Briefcase, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const professions = [
  // SERVIÇOS POR HORA
  'Eletricista',
  'Encanador',
  'Bombeiro Hidráulico',
  'Técnico de Manutenção',
  'Montador de Móveis',
  'Instalador (TV, suporte, cortina, prateleira)',
  'Marceneiro',
  'Serralheiro',
  'Vidraceiro',
  'Diarista',
  'Faxina Residencial',
  'Limpeza Comercial',
  'Passadeira',
  'Organização Residencial',
  'Manicure',
  'Pedicure',
  'Manicure e Pedicure',
  'Designer de Unhas',
  'Cabeleireiro(a)',
  'Barbeiro',
  'Maquiador(a)',
  'Designer de Sobrancelhas',
  'Lash Designer',
  'Depilador(a)',
  'Técnico de Informática',
  'Suporte Técnico',
  'Manutenção de Computador',
  'Manutenção de Celular',
  'Editor de Vídeo',
  'Designer Gráfico',
  // SERVIÇOS POR DIÁRIA
  'Pedreiro',
  'Ajudante de Pedreiro',
  'Servente de Obras',
  'Pintor',
  'Gesseiro',
  'Azulejista',
  'Carpinteiro',
  'Mestre de Obras',
  'Limpeza Pós-Obra',
  'Limpeza de Terreno',
  'Lavagem de Área Externa',
  'Lavagem de Caixa d’Água',
  'Jardineiro',
  'Corte de Grama',
  'Poda de Árvores',
  'Caseiro',
  'Babá',
  'Cuidador(a) de Idosos',
  'Acompanhante',
  // SERVIÇOS POR EVENTO
  'Garçom',
  'Barman',
  'Cozinheiro(a)',
  'Churrasqueiro',
  'Auxiliar de Cozinha',
  'Recepcionista',
  'Segurança de Evento',
  'Animador de Festa',
  'Fotógrafo',
  'Videomaker',
  'Filmagem de Evento',
  'Cobertura de Evento',
  'Maquiagem para Evento',
  'Penteado para Evento',
  'Pacote Noiva',
  // SERVIÇOS COM VALOR FECHADO / POR DEMANDA
  'Carreto',
  'Frete Pequeno',
  'Mudança Residencial',
  'Lavagem de Sofá',
  'Lavagem de Tapete',
  'Estética Automotiva',
  'Polimento Automotivo',
  'Banho e Tosa',
  'Dedetização',
  // CATEGORIA ABERTA
  'Serviços Gerais',
  'Profissional Autônomo',
  'Multisserviços',
  'Outros Serviços',
  'Sem Categoria Definida',
  // EDUCAÇÃO & ENSINO
  'Professor',
  'Professor Particular',
  'Tutor',
  'Educador',
  'Instrutor',
  'Orientador Educacional',
  'Professor de Matemática',
  'Professor de Física',
  'Professor de Química',
  'Professor de Estatística',
  'Professor de Português',
  'Professor de Literatura',
  'Professor de Redação',
  'Professor de História',
  'Professor de Geografia',
  'Professor de Filosofia',
  'Professor de Sociologia',
  'Professor de Biologia',
  'Professor de Ciências',
  'Professor de Inglês',
  'Professor de Espanhol',
  'Professor de Francês',
  'Professor de Alemão',
  'Professor de Italiano',
  'Professor de Libras',
  'Professor de Português para Estrangeiros',
  'Professor de Informática',
  'Professor de Programação',
  'Professor de Excel',
  'Professor de Design Gráfico',
  'Professor de Edição de Vídeo',
  'Professor de Música',
  'Professor de Violão',
  'Professor de Guitarra',
  'Professor de Piano',
  'Professor de Canto',
  'Professor de Teatro',
  'Professor de Dança',
  'Professor de Desenho',
  'Professor de Pintura',
  'Professor de Educação Física',
  'Personal Trainer',
  'Professor de Yoga',
  'Professor de Pilates',
  'Coach Educacional',
  'Mentor Acadêmico',
  'Professor Geral',
  'Educador Geral',
  'Instrutor Geral',
  // CONSTRUÇÃO & MANUTENÇÃO
  'Pedreiro',
  'Ajudante de Pedreiro',
  'Servente de Obras',
  'Mestre de Obras',
  'Eletricista',
  'Eletricista Residencial',
  'Eletricista Industrial',
  'Encanador',
  'Bombeiro Hidráulico',
  'Pintor',
  'Gesseiro',
  'Azulejista',
  'Marceneiro',
  'Carpinteiro',
  'Serralheiro',
  'Soldador',
  'Vidraceiro',
  'Telhadista',
  'Impermeabilizador',
  'Instalador',
  'Técnico em Refrigeração',
  // LIMPEZA & ORGANIZAÇÃO
  'Diarista',
  'Faxineiro',
  'Auxiliar de Limpeza',
  'Governanta',
  'Passadeira',
  'Organizador Profissional',
  // BELEZA & ESTÉTICA
  'Manicure',
  'Pedicure',
  'Nail Designer',
  'Cabeleireiro',
  'Barbeiro',
  'Maquiador',
  'Designer de Sobrancelhas',
  'Lash Designer',
  'Esteticista',
  'Depilador',
  'Massoterapeuta',
  'Micropigmentador',
  // MODA & IMAGEM
  'Costureiro',
  'Alfaiate',
  'Modelista',
  'Consultor de Imagem',
  'Personal Stylist',
  // AUTOMOTIVO
  'Mecânico',
  'Mecânico Automotivo',
  'Eletricista Automotivo',
  'Funileiro',
  'Pintor Automotivo',
  'Esteticista Automotivo',
  'Lavador Automotivo',
  'Guincheiro',
  // TECNOLOGIA & DIGITAL
  'Técnico de Informática',
  'Analista de Suporte',
  'Técnico em Redes',
  'Desenvolvedor',
  'Desenvolvedor Web',
  'Desenvolvedor Mobile',
  'Designer Gráfico',
  'Editor de Vídeo',
  'Social Media',
  'Gestor de Tráfego',
  'Fotógrafo',
  'Videomaker',
  // LOGÍSTICA & TRANSPORTE
  'Motoboy',
  'Entregador',
  'Motorista Particular',
  'Motorista de Aplicativo',
  'Carreteiro',
  'Caminhoneiro',
  'Ajudante de Mudança',
  // EXTERNOS & CAMPO
  'Jardineiro',
  'Paisagista',
  'Caseiro',
  'Tratorista',
  // CUIDADOS & ASSISTÊNCIA
  'Babá',
  'Cuidador de Idosos',
  'Cuidador Infantil',
  'Acompanhante',
  'Enfermeiro',
  'Técnico de Enfermagem',
  // PETS
  'Adestrador de Cães',
  'Cuidador de Pets',
  'Tosador',
  'Banhista',
  // EDUCAÇÃO (RESUMO)
  'Professor',
  'Tutor',
  'Instrutor',
  'Educador',
  'Personal Trainer',
  'Professor de Idiomas',
  'Professor de Música',
  // ALIMENTAÇÃO
  'Cozinheiro',
  'Chef',
  'Auxiliar de Cozinha',
  'Confeiteiro',
  'Padeiro',
  'Churrasqueiro',
  // EVENTOS
  'Garçom',
  'Barman',
  'Recepcionista',
  'Cerimonialista',
  'Animador',
  'DJ',
  'Iluminador',
  'Sonoplasta',
  'Produtor de Eventos',
  // CONSULTORIA & PROFISSIONAIS LIBERAIS
  'Consultor',
  'Assessor',
  'Coach',
  'Mentor',
  'Tradutor',
  'Intérprete',
  // SERVIÇOS GERAIS (ABERTA)
  'Prestador de Serviços',
  'Multisserviços',
  'Autônomo',
  // CATEGORIA NEUTRA
  'Sem Profissão Definida',
  // CASA & APOIO DOMÉSTICO
  'Empregada Doméstica',
  'Copeiro',
  'Mordomo',
  'Zelador',
  'Porteiro',
  // CONDOMÍNIOS & PRÉDIOS
  'Síndico Profissional',
  'Supervisor Predial',
  'Auxiliar de Manutenção Predial',
  // SEGURANÇA
  'Vigilante',
  'Porteiro Noturno',
  'Controlador de Acesso',
  'Segurança Patrimonial',
  // ADMINISTRATIVO & ESCRITÓRIO
  'Assistente Administrativo',
  'Auxiliar Administrativo',
  'Secretário',
  'Secretária Executiva',
  'Recepcionista',
  'Digitador',
  // FINANCEIRO & NEGÓCIOS
  'Contador',
  'Auxiliar Contábil',
  'Analista Financeiro',
  'Consultor Financeiro',
  'Corretor de Imóveis',
  'Corretor de Seguros',
  // JURÍDICO
  'Advogado',
  'Assistente Jurídico',
  'Paralegal',
  // TÉCNICOS & ESPECIALIZADOS
  'Técnico Eletrônico',
  'Técnico Mecânico',
  'Técnico em Automação',
  'Técnico em Segurança do Trabalho',
  'Técnico Ambiental',
  // SAÚDE (NÃO MÉDICO)
  'Fisioterapeuta',
  'Terapeuta Ocupacional',
  'Psicólogo',
  'Nutricionista',
  'Fonoaudiólogo',
  // TERAPIAS & BEM-ESTAR
  'Terapeuta Holístico',
  'Quiropraxista',
  'Acupunturista',
  'Reiki Terapeuta',
  // ESPORTE & PERFORMANCE
  'Preparador Físico',
  'Treinador Esportivo',
  'Instrutor de Artes Marciais',
  'Instrutor de Natação',
  // LABORATORIAL & INDUSTRIAL LEVE
  'Operador de Máquinas',
  'Operador de Empilhadeira',
  'Inspetor de Qualidade',
  // MÍDIA & ENTRETENIMENTO
  'Streamer',
  'Criador de Conteúdo',
  'Narrador',
  'Locutor',
  // INTERNACIONAL / REMOTO
  'Tradutor',
  'Intérprete',
  'Professor Online',
  'Assistente Virtual',
  // CATEGORIAS FINAIS
  'Freelancer',
  'Profissional Liberal',
  'Autônomo Geral',
]

const Register = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [email, setEmail] = useState(location.state?.email || '')
  const [password, setPassword] = useState('')
  const [profession, setProfession] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorInfo, setErrorInfo] = useState(null)
  const [successMessage, setSuccessMessage] = useState(false)
  const { register, isAuthenticated, loading } = useAuth()

  // Pré-preencher email se vier da página de login
  useEffect(() => {
    if (location.state?.email) {
      setEmail(location.state.email)
    }
  }, [location])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorInfo(null)
    setSuccessMessage(false)
    setUsernameError('')

    // Validação simples de username
    if (!username.match(/^[a-zA-Z0-9_\.]{3,20}$/)) {
      setUsernameError(
        'O nome de usuário deve ter de 3 a 20 caracteres e pode conter letras, números, _ e .'
      )
      return
    }
    // Aqui você pode adicionar uma verificação de unicidade no backend
    if (!acceptTerms) {
      setErrorInfo({
        type: 'terms',
        message: 'Você precisa aceitar os Termos de Uso para criar a conta.',
      })
      return
    }

    const res = await register(name, email, password, profession, username)

    if (res?.success) {
      setSuccessMessage(true)
      setTimeout(() => {
        navigate('/login')
      }, 2000)
    } else {
      if (res?.errorType === 'Email já cadastrado') {
        setErrorInfo({
          type: 'emailExists',
          message:
            'Este email já está cadastrado. Faça login ou use outro email.',
        })
      } else if (res?.errorType === 'Username já cadastrado') {
        setUsernameError('Este nome de usuário já está em uso. Escolha outro.')
      } else {
        setErrorInfo({
          type: 'general',
          message: res?.message || 'Erro ao criar conta. Tente novamente.',
        })
      }
    }
  }

  if (isAuthenticated) {
    return <Navigate to="/" />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 20,
              delay: 0.2,
            }}
            className="w-16 h-16 rounded-full joby-gradient flex items-center justify-center mb-4 shadow-lg"
          >
            <Briefcase size={32} className="text-primary-foreground" />
          </motion.div>
          <h1 className="text-3xl font-bold text-foreground">JOBY</h1>
          <p className="text-muted-foreground mt-1">
            Conectando profissionais e clientes
          </p>
        </div>

        <div className="bg-card border border-border/50 rounded-xl shadow-2xl p-6 sm:p-8">
          <h2 className="text-xl font-semibold mb-6 text-center text-foreground">
            Criar uma nova conta
          </h2>

          {/* Mensagem de sucesso */}
          {successMessage && (
            <Alert className="mb-4 border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertTitle className="text-green-800 dark:text-green-300">
                Conta criada com sucesso!
              </AlertTitle>
              <AlertDescription className="text-green-700 dark:text-green-400">
                Você será redirecionado para fazer login...
              </AlertDescription>
            </Alert>
          )}

          {/* Alert de erro */}
          {errorInfo && errorInfo.type === 'emailExists' && (
            <Alert className="mb-4 border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900">
              <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <AlertTitle className="text-orange-800 dark:text-orange-300">
                Email já cadastrado
              </AlertTitle>
              <AlertDescription className="text-orange-700 dark:text-orange-400">
                Já existe uma conta com o email <strong>{email}</strong>.
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-900/30"
                  onClick={() => navigate('/login', { state: { email } })}
                >
                  Ir para login
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Nome de usuário</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Escolha um nome de usuário único"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="bg-background/50"
                  autoComplete="username"
                />
                {usernameError && (
                  <p className="text-xs text-destructive mt-1">
                    {usernameError}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-background/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profession">Profissão</Label>
                <Autocomplete
                  id="profession"
                  options={professions}
                  value={profession}
                  onChange={setProfession}
                  placeholder="Digite para buscar profissão..."
                  required
                  showOtherOption
                  className="bg-background/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="•••••••• (mínimo 6 caracteres)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="bg-background/50"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2 mt-2">
                <input
                  id="acceptTerms"
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  required
                />
                <label
                  htmlFor="acceptTerms"
                  className="text-sm text-muted-foreground"
                >
                  Li e aceito os{' '}
                  <Link to="/termos" className="underline text-primary">
                    Termos de Uso
                  </Link>
                </label>
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground mt-2"
                disabled={loading}
              >
                {loading ? 'Criando conta...' : 'Criar conta'}
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm">
            <p className="text-muted-foreground">
              Já tem uma conta?{' '}
              <Link
                to="/login"
                className="text-primary hover:underline font-medium"
              >
                Entrar
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          © {new Date().getFullYear()} JOBY. Todos os direitos reservados.
        </p>
      </motion.div>
    </div>
  )
}

export default Register
