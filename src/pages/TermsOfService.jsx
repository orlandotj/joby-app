import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Ban, Shield } from 'lucide-react'
import { Card } from '../components/ui/card'

export default function TermsOfService() {
  const navigate = useNavigate()

  const handleBack = () => {
    const idx = window.history.state?.idx
    const canGoBack =
      typeof idx === 'number' ? idx > 0 : window.history.length > 1
    if (canGoBack) navigate(-1)
    else navigate('/settings', { replace: true })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Termos de Uso</h1>
              <p className="text-sm text-muted-foreground">
                Última atualização: 30 de Dezembro de 2025
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Alerta de Banimento */}
        <Card className="p-6 bg-red-500/10 border-red-500/50">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-red-500/20 rounded-lg">
              <Ban className="w-6 h-6 text-red-500" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-red-500 mb-2">
                PROIBIÇÃO DE NEGÓCIOS FORA DA PLATAFORMA
              </h2>
              <p className="text-sm leading-relaxed">
                <strong>ATENÇÃO:</strong> É ESTRITAMENTE PROIBIDO realizar
                negociações, pagamentos ou acordos fora da plataforma Joby.
                Qualquer usuário que solicitar, oferecer ou realizar transações
                externas será <strong>PERMANENTEMENTE BANIDO</strong> sem aviso
                prévio e sem direito a reembolso ou contestação.
              </p>
              <div className="mt-4 p-4 bg-background/50 rounded-lg">
                <p className="text-sm font-semibold mb-2">
                  Exemplos de Violação:
                </p>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  <li>
                    Solicitar pagamento via PIX, transferência bancária ou
                    dinheiro direto
                  </li>
                  <li>
                    Compartilhar contatos externos (WhatsApp, telefone, email)
                    para negociação
                  </li>
                  <li>Combinar serviços e pagamentos fora do aplicativo</li>
                  <li>Tentar contornar as taxas da plataforma</li>
                </ul>
              </div>
            </div>
          </div>
        </Card>

        {/* 1. Aceitação dos Termos */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            1. Aceitação dos Termos
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Ao criar uma conta, acessar ou usar o aplicativo Joby, você
              concorda em estar legalmente vinculado a estes Termos de Uso e
              todas as políticas incorporadas por referência.
            </p>
            <p>
              Se você não concordar com estes termos, não deverá acessar ou usar
              os serviços da Joby.
            </p>
            <p>
              Reservamo-nos o direito de modificar estes termos a qualquer
              momento. O uso continuado após alterações constitui aceitação dos
              novos termos.
            </p>
          </div>
        </Card>

        {/* 2. Descrição do Serviço */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">2. Descrição do Serviço</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              A Joby é uma plataforma digital que conecta profissionais
              autônomos a clientes que necessitam de serviços. Atuamos como
              intermediários, fornecendo:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Sistema de busca e descoberta de profissionais</li>
              <li>Sistema de agendamento e gerenciamento de trabalhos</li>
              <li>Sistema de pagamento seguro integrado</li>
              <li>Sistema de mensagens entre usuários</li>
              <li>Sistema de avaliações e reputação</li>
              <li>Proteção contra fraudes e mediação de disputas</li>
            </ul>
            <p className="mt-4">
              <strong>IMPORTANTE:</strong> Todas as transações DEVEM ocorrer
              exclusivamente através da plataforma Joby.
            </p>
          </div>
        </Card>

        {/* 3. Elegibilidade e Cadastro */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            3. Elegibilidade e Cadastro
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>Para usar a plataforma Joby, você deve:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Ter no mínimo 18 anos de idade</li>
              <li>Fornecer informações verdadeiras, precisas e completas</li>
              <li>Manter suas informações atualizadas</li>
              <li>Não ter sido previamente banido da plataforma</li>
              <li>Cumprir todas as leis locais aplicáveis</li>
            </ul>
            <p className="mt-4">
              Você é responsável por manter a confidencialidade de sua conta e
              senha. Não compartilhe suas credenciais com terceiros.
            </p>
          </div>
        </Card>

        {/* 4. Conduta do Usuário */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">4. Conduta do Usuário</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">É PROIBIDO:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li className="text-red-500 font-semibold">
                Realizar ou solicitar transações fora da plataforma (BANIMENTO
                PERMANENTE)
              </li>
              <li className="text-red-500 font-semibold">
                Compartilhar informações de contato para negociação externa
                (BANIMENTO PERMANENTE)
              </li>
              <li>Usar a plataforma para atividades ilegais ou fraudulentas</li>
              <li>Criar contas falsas ou múltiplas contas sem autorização</li>
              <li>
                Publicar conteúdo ofensivo, difamatório ou discriminatório
              </li>
              <li>Assediar, ameaçar ou intimidar outros usuários</li>
              <li>Manipular avaliações ou classificações</li>
              <li>
                Copiar, modificar ou distribuir conteúdo da plataforma sem
                autorização
              </li>
              <li>Interferir com o funcionamento da plataforma</li>
              <li>Coletar dados de outros usuários sem consentimento</li>
              <li>Fazer spam ou publicidade não autorizada</li>
            </ul>
          </div>
        </Card>

        {/* 5. Transações e Pagamentos */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">5. Transações e Pagamentos</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg mb-4">
              <p className="font-bold text-red-500 mb-2">REGRA FUNDAMENTAL:</p>
              <p>
                TODOS os pagamentos devem ser processados exclusivamente através
                do sistema de pagamento integrado da Joby. Qualquer tentativa de
                pagamento externo resultará em banimento permanente imediato.
              </p>
            </div>
            <p>
              <strong>Taxas da Plataforma:</strong>
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>A Joby cobra uma taxa de serviço sobre cada transação</li>
              <li>As taxas são claramente exibidas antes da confirmação</li>
              <li>
                Profissionais recebem o pagamento após a conclusão do serviço
              </li>
              <li>
                Fundos são retidos em garantia até a conclusão satisfatória
              </li>
            </ul>
            <p className="mt-4">
              <strong>Reembolsos e Disputas:</strong>
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Disputas devem ser abertas através da plataforma</li>
              <li>Analisamos cada caso individualmente</li>
              <li>Decisões de reembolso são finais e a critério da Joby</li>
              <li>Não há reembolso em casos de violação dos termos</li>
            </ul>
          </div>
        </Card>

        {/* 6. Profissionais e Serviços */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            6. Responsabilidades dos Profissionais
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>Os profissionais que oferecem serviços na plataforma devem:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Fornecer descrições precisas de seus serviços</li>
              <li>Cumprir prazos e compromissos acordados</li>
              <li>Manter comunicação profissional e respeitosa</li>
              <li>Possuir qualificações e licenças necessárias</li>
              <li>Manter seguro de responsabilidade quando aplicável</li>
              <li>Reportar problemas através da plataforma</li>
              <li className="text-red-500 font-semibold">
                NUNCA solicitar ou aceitar pagamentos fora da plataforma
              </li>
            </ul>
          </div>
        </Card>

        {/* 7. Responsabilidades dos Clientes */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            7. Responsabilidades dos Clientes
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>Os clientes que contratam serviços na plataforma devem:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Fornecer informações claras sobre o trabalho solicitado</li>
              <li>Comunicar requisitos e expectativas claramente</li>
              <li>Pagar pelos serviços através da plataforma</li>
              <li>Avaliar profissionais de forma honesta e justa</li>
              <li>Reportar problemas através dos canais apropriados</li>
              <li className="text-red-500 font-semibold">
                NUNCA solicitar ou oferecer pagamentos fora da plataforma
              </li>
            </ul>
          </div>
        </Card>

        {/* 8. Propriedade Intelectual */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">8. Propriedade Intelectual</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Todo o conteúdo da plataforma Joby, incluindo mas não limitado a:
              design, texto, gráficos, logotipos, ícones, imagens, áudio, vídeo,
              software e código, é de propriedade exclusiva da Joby ou de seus
              licenciadores.
            </p>
            <p>
              Você recebe uma licença limitada, não exclusiva e intransferível
              para usar a plataforma para fins pessoais ou comerciais conforme
              permitido por estes termos.
            </p>
            <p>
              Ao postar conteúdo na plataforma, você nos concede uma licença
              mundial, não exclusiva, livre de royalties para usar, reproduzir e
              exibir esse conteúdo.
            </p>
          </div>
        </Card>

        {/* 9. Privacidade e Proteção de Dados */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            9. Privacidade e Proteção de Dados
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Sua privacidade é importante para nós. Coletamos, usamos e
              protegemos suas informações pessoais conforme descrito em nossa
              Política de Privacidade.
            </p>
            <p>
              Ao usar a Joby, você concorda com a coleta e uso de informações de
              acordo com nossa Política de Privacidade e em conformidade com a
              LGPD (Lei Geral de Proteção de Dados).
            </p>
          </div>
        </Card>

        {/* 10. Suspensão e Banimento */}
        <Card className="p-6 border-red-500/50">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            10. Suspensão e Banimento de Contas
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">
              Reservamo-nos o direito de suspender ou banir contas imediatamente
              e sem aviso prévio nas seguintes situações:
            </p>
            <div className="p-4 bg-red-500/10 rounded-lg space-y-2">
              <p className="font-bold text-red-500">
                BANIMENTO PERMANENTE AUTOMÁTICO:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Realizar ou solicitar transações fora da plataforma</li>
                <li>
                  Compartilhar informações de contato para negociação externa
                </li>
                <li>Tentar contornar o sistema de pagamento da Joby</li>
                <li>
                  Solicitar ou aceitar pagamentos diretos (PIX, dinheiro,
                  transferência)
                </li>
              </ul>
            </div>
            <p className="font-semibold text-foreground mt-4">
              Outras Violações que Podem Resultar em Banimento:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Violação de qualquer termo deste acordo</li>
              <li>Comportamento fraudulento ou enganoso</li>
              <li>Assédio ou abuso de outros usuários</li>
              <li>Atividade ilegal na plataforma</li>
              <li>Múltiplas reclamações ou avaliações negativas</li>
              <li>Criação de contas falsas ou múltiplas</li>
              <li>Manipulação de avaliações ou classificações</li>
            </ul>
            <p className="mt-4 font-semibold text-red-500">
              Usuários banidos perdem acesso permanente a todas as
              funcionalidades, fundos pendentes (exceto em casos específicos de
              análise) e não poderão criar novas contas.
            </p>
          </div>
        </Card>

        {/* 11. Limitação de Responsabilidade */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            11. Limitação de Responsabilidade
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              A Joby atua como intermediária entre profissionais e clientes. Não
              somos empregadores dos profissionais e não garantimos a qualidade,
              segurança ou legalidade dos serviços prestados.
            </p>
            <p>
              <strong>A Joby não se responsabiliza por:</strong>
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                Qualidade, pontualidade ou adequação dos serviços prestados
              </li>
              <li>Danos, perdas ou lesões resultantes do uso da plataforma</li>
              <li>Disputas entre usuários</li>
              <li>Conteúdo gerado por usuários</li>
              <li>Falhas técnicas ou interrupções de serviço</li>
              <li>Perdas financeiras indiretas ou consequentes</li>
            </ul>
            <p className="mt-4">
              Nossa responsabilidade total está limitada ao valor das taxas que
              você pagou à Joby nos 12 meses anteriores ao evento que deu origem
              à reclamação.
            </p>
          </div>
        </Card>

        {/* 12. Indenização */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">12. Indenização</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Você concorda em indenizar, defender e isentar a Joby, seus
              diretores, funcionários, parceiros e afiliados de quaisquer
              reivindicações, responsabilidades, danos, perdas e despesas
              (incluindo honorários advocatícios) resultantes de:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Seu uso da plataforma</li>
              <li>Violação destes Termos de Uso</li>
              <li>Violação de direitos de terceiros</li>
              <li>Conteúdo que você publica na plataforma</li>
              <li>Suas interações com outros usuários</li>
            </ul>
          </div>
        </Card>

        {/* 13. Legislação Aplicável */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            13. Legislação Aplicável e Foro
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Estes Termos de Uso são regidos pelas leis da República Federativa
              do Brasil.
            </p>
            <p>
              Qualquer disputa relacionada a estes termos será submetida ao foro
              da comarca da sede da Joby, com exclusão de qualquer outro, por
              mais privilegiado que seja.
            </p>
          </div>
        </Card>

        {/* 14. Disposições Gerais */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">14. Disposições Gerais</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              <strong>Integralidade:</strong> Estes termos constituem o acordo
              completo entre você e a Joby.
            </p>
            <p>
              <strong>Modificações:</strong> Podemos modificar estes termos a
              qualquer momento. Alterações significativas serão notificadas.
            </p>
            <p>
              <strong>Renúncia:</strong> A falha em fazer cumprir qualquer
              disposição não constitui renúncia de direitos.
            </p>
            <p>
              <strong>Divisibilidade:</strong> Se qualquer disposição for
              considerada inválida, as demais permanecerão em vigor.
            </p>
            <p>
              <strong>Cessão:</strong> Você não pode transferir seus direitos e
              obrigações sem nosso consentimento prévio por escrito.
            </p>
          </div>
        </Card>

        {/* 15. Contato */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">15. Contato</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Para questões sobre estes Termos de Uso, entre em contato conosco:
            </p>
            <ul className="space-y-2">
              <li>
                <strong>Email:</strong> legal@joby.com.br
              </li>
              <li>
                <strong>Suporte:</strong> suporte@joby.com.br
              </li>
              <li>
                <strong>Telefone:</strong> 0800-XXX-XXXX
              </li>
            </ul>
          </div>
        </Card>

        {/* Confirmação Final */}
        <Card className="p-6 bg-primary/5 border-primary/50">
          <div className="text-center space-y-3">
            <p className="font-bold text-lg">
              Ao usar a plataforma Joby, você confirma que leu, entendeu e
              concorda com estes Termos de Uso.
            </p>
            <p className="text-sm text-muted-foreground">
              Última atualização: 30 de Dezembro de 2025
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
