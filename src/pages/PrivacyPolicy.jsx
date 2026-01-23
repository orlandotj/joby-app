import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Shield, Lock, Eye, Database, UserCheck } from 'lucide-react'
import { Card } from '../components/ui/card'

export default function PrivacyPolicy() {
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
              <h1 className="text-2xl font-bold">Política de Privacidade</h1>
              <p className="text-sm text-muted-foreground">
                Última atualização: 30 de Dezembro de 2025
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Introdução */}
        <Card className="p-6 bg-primary/5 border-primary/50">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/20 rounded-lg">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold mb-2">
                Compromisso com sua Privacidade
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                A Joby leva sua privacidade a sério. Esta Política de
                Privacidade descreve como coletamos, usamos, armazenamos e
                protegemos suas informações pessoais em conformidade com a Lei
                Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
              </p>
            </div>
          </div>
        </Card>

        {/* 1. Informações que Coletamos */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            1. Informações que Coletamos
          </h2>
          <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <div>
              <p className="font-semibold text-foreground mb-2">
                1.1 Informações Fornecidas por Você:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Nome completo, CPF/CNPJ</li>
                <li>Email e número de telefone</li>
                <li>Endereço e localização</li>
                <li>Foto de perfil e biografia</li>
                <li>Informações bancárias para pagamentos</li>
                <li>
                  Documentos de identificação e qualificações profissionais
                </li>
                <li>Informações sobre serviços oferecidos ou solicitados</li>
                <li>Mensagens e comunicações na plataforma</li>
                <li>Avaliações e comentários</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-foreground mb-2">
                1.2 Informações Coletadas Automaticamente:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Endereço IP e dados de localização geográfica</li>
                <li>Tipo de dispositivo e sistema operacional</li>
                <li>Navegador e preferências de idioma</li>
                <li>Páginas visitadas e tempo de uso</li>
                <li>Interações com recursos da plataforma</li>
                <li>Cookies e tecnologias similares</li>
                <li>Logs de acesso e atividades</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-foreground mb-2">
                1.3 Informações de Terceiros:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Dados de redes sociais (se você optar por conectar)</li>
                <li>Informações de verificação de identidade</li>
                <li>Dados de processadores de pagamento</li>
                <li>Verificações de antecedentes (quando aplicável)</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* 2. Como Usamos suas Informações */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            2. Como Usamos suas Informações
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>Utilizamos suas informações pessoais para:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong>Fornecer e melhorar nossos serviços:</strong> Processar
                transações, facilitar conexões entre profissionais e clientes, e
                aprimorar a experiência do usuário
              </li>
              <li>
                <strong>Segurança e prevenção de fraudes:</strong> Verificar
                identidades, detectar atividades suspeitas e proteger contra uso
                não autorizado
              </li>
              <li>
                <strong>Comunicação:</strong> Enviar notificações, atualizações,
                mensagens do sistema e suporte ao cliente
              </li>
              <li>
                <strong>Pagamentos:</strong> Processar transações financeiras e
                gerenciar sua carteira
              </li>
              <li>
                <strong>Personalização:</strong> Recomendar serviços e
                profissionais relevantes
              </li>
              <li>
                <strong>Marketing:</strong> Enviar ofertas promocionais (você
                pode optar por não receber)
              </li>
              <li>
                <strong>Análise e pesquisa:</strong> Entender padrões de uso e
                melhorar a plataforma
              </li>
              <li>
                <strong>Cumprimento legal:</strong> Atender requisitos legais e
                regulatórios
              </li>
              <li>
                <strong>Resolução de disputas:</strong> Mediar conflitos entre
                usuários
              </li>
            </ul>
          </div>
        </Card>

        {/* 3. Base Legal para Processamento */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            3. Base Legal para Processamento (LGPD)
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>Processamos seus dados pessoais com base em:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong>Consentimento:</strong> Você nos fornece permissão
                explícita
              </li>
              <li>
                <strong>Execução de contrato:</strong> Necessário para fornecer
                nossos serviços
              </li>
              <li>
                <strong>Obrigação legal:</strong> Requerido por lei ou
                regulamentação
              </li>
              <li>
                <strong>Legítimo interesse:</strong> Para melhorar serviços,
                segurança e prevenção de fraudes
              </li>
              <li>
                <strong>Proteção de direitos:</strong> Defesa em processos
                legais
              </li>
            </ul>
          </div>
        </Card>

        {/* 4. Compartilhamento de Informações */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            4. Compartilhamento de Informações
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>Podemos compartilhar suas informações com:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong>Outros usuários:</strong> Informações de perfil visíveis
                para conexões apropriadas
              </li>
              <li>
                <strong>Prestadores de serviços:</strong> Processadores de
                pagamento, hospedagem, análise
              </li>
              <li>
                <strong>Parceiros comerciais:</strong> Com seu consentimento
                explícito
              </li>
              <li>
                <strong>Autoridades legais:</strong> Quando exigido por lei ou
                para proteger direitos
              </li>
              <li>
                <strong>Transações corporativas:</strong> Em caso de fusão,
                aquisição ou venda de ativos
              </li>
            </ul>
            <p className="mt-4 font-semibold text-foreground">
              Não vendemos suas informações pessoais a terceiros para fins de
              marketing.
            </p>
          </div>
        </Card>

        {/* 5. Segurança de Dados */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            5. Segurança e Proteção de Dados
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Implementamos medidas técnicas e organizacionais para proteger
              seus dados:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Criptografia SSL/TLS para transmissão de dados</li>
              <li>Criptografia de dados sensíveis em repouso</li>
              <li>Autenticação de dois fatores disponível</li>
              <li>Controles de acesso rigorosos</li>
              <li>Monitoramento contínuo de segurança</li>
              <li>Auditorias regulares de segurança</li>
              <li>Políticas de senha forte</li>
              <li>Backups regulares e redundância de dados</li>
            </ul>
            <p className="mt-4">
              Apesar de nossos esforços, nenhum sistema é 100% seguro.
              Notificaremos você sobre qualquer violação de dados conforme
              exigido pela LGPD.
            </p>
          </div>
        </Card>

        {/* 6. Seus Direitos (LGPD) */}
        <Card className="p-6 border-primary/50">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-primary" />
            6. Seus Direitos sob a LGPD
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Você tem direito a:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong>Confirmação e acesso:</strong> Saber se processamos seus
                dados e acessá-los
              </li>
              <li>
                <strong>Correção:</strong> Corrigir dados incompletos, inexatos
                ou desatualizados
              </li>
              <li>
                <strong>Anonimização, bloqueio ou eliminação:</strong> De dados
                desnecessários ou tratados em desconformidade
              </li>
              <li>
                <strong>Portabilidade:</strong> Receber seus dados em formato
                estruturado
              </li>
              <li>
                <strong>Informação sobre compartilhamento:</strong> Saber com
                quem compartilhamos seus dados
              </li>
              <li>
                <strong>Revogação de consentimento:</strong> Retirar
                consentimento a qualquer momento
              </li>
              <li>
                <strong>Oposição:</strong> Opor-se ao tratamento de dados em
                certas circunstâncias
              </li>
              <li>
                <strong>Revisão de decisões automatizadas:</strong> Questionar
                decisões baseadas em processamento automatizado
              </li>
            </ul>
            <p className="mt-4 font-semibold text-foreground">
              Para exercer seus direitos, entre em contato com nosso Encarregado
              de Proteção de Dados (DPO) através de: dpo@joby.com.br
            </p>
          </div>
        </Card>

        {/* 7. Retenção de Dados */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">7. Retenção de Dados</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Mantemos suas informações pessoais apenas pelo tempo necessário
              para cumprir as finalidades descritas nesta política, a menos que
              um período de retenção mais longo seja exigido ou permitido por
              lei.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mt-3">
              <li>Dados de conta: Enquanto sua conta estiver ativa</li>
              <li>
                Dados de transação: Conforme exigido por lei (geralmente 5 anos)
              </li>
              <li>Dados de comunicação: 2 anos após a última interação</li>
              <li>Logs de segurança: 1 ano</li>
              <li>Dados de marketing: Até você optar por não receber</li>
            </ul>
            <p className="mt-3">
              Após o período de retenção, deletamos ou anonimizamos seus dados
              de forma segura.
            </p>
          </div>
        </Card>

        {/* 8. Cookies e Tecnologias Similares */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            8. Cookies e Tecnologias Similares
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>Usamos cookies e tecnologias similares para:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Manter você conectado</li>
              <li>Lembrar suas preferências</li>
              <li>Entender como você usa a plataforma</li>
              <li>Melhorar o desempenho</li>
              <li>Personalizar conteúdo</li>
              <li>Exibir publicidade relevante</li>
            </ul>
            <p className="mt-3">
              Você pode controlar cookies através das configurações do seu
              navegador. Note que desabilitar cookies pode afetar a
              funcionalidade da plataforma.
            </p>
          </div>
        </Card>

        {/* 9. Transferência Internacional de Dados */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            9. Transferência Internacional de Dados
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Seus dados podem ser transferidos e processados em servidores
              localizados fora do Brasil. Quando isso ocorrer, garantimos que
              medidas adequadas de proteção estejam em vigor, incluindo:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Cláusulas contratuais padrão aprovadas</li>
              <li>Certificações internacionais de proteção de dados</li>
              <li>Garantias adequadas de segurança</li>
            </ul>
          </div>
        </Card>

        {/* 10. Menores de Idade */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            10. Proteção de Menores de Idade
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              A plataforma Joby é destinada a usuários maiores de 18 anos. Não
              coletamos intencionalmente informações de menores de idade.
            </p>
            <p>
              Se tomarmos conhecimento de que coletamos dados de um menor sem
              consentimento parental adequado, tomaremos medidas para deletar
              essas informações imediatamente.
            </p>
          </div>
        </Card>

        {/* 11. Alterações a esta Política */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            11. Alterações a esta Política
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Podemos atualizar esta Política de Privacidade periodicamente para
              refletir mudanças em nossas práticas ou requisitos legais.
            </p>
            <p>
              Notificaremos você sobre alterações significativas através de
              email ou notificação na plataforma. A data da "Última atualização"
              no topo desta página indica quando a política foi revisada pela
              última vez.
            </p>
          </div>
        </Card>

        {/* 12. Contato e Encarregado de Dados */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">
            12. Contato e Encarregado de Proteção de Dados
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Para questões sobre privacidade, exercício de direitos sob a LGPD,
              ou para entrar em contato com nosso Encarregado de Proteção de
              Dados (DPO):
            </p>
            <ul className="space-y-2 mt-3">
              <li>
                <strong>Encarregado (DPO):</strong> dpo@joby.com.br
              </li>
              <li>
                <strong>Privacidade:</strong> privacidade@joby.com.br
              </li>
              <li>
                <strong>Suporte Geral:</strong> suporte@joby.com.br
              </li>
              <li>
                <strong>Telefone:</strong> 0800-XXX-XXXX
              </li>
            </ul>
            <p className="mt-4">
              Você também tem o direito de apresentar uma reclamação à
              Autoridade Nacional de Proteção de Dados (ANPD) se acreditar que
              seus direitos de privacidade foram violados.
            </p>
          </div>
        </Card>

        {/* Confirmação Final */}
        <Card className="p-6 bg-primary/5 border-primary/50">
          <div className="text-center space-y-3">
            <p className="font-bold text-lg">
              Ao usar a plataforma Joby, você reconhece que leu e compreendeu
              esta Política de Privacidade.
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
