import React from 'react'
import { cn } from '@/lib/utils'
import { layoutTokens } from '@/design/layoutTokens'

/**
 * Header premium padrão do JOBY.
 * - Divider sempre no texto
 * - Sem animação: fica a cargo da página
 * - Customização limitada ao slot interno (children)
 */
const JobyPageHeader = ({
  icon,
  title,
  subtitle,
  children,
  contentClassName,
  dataTestId,
}) => {
  return (
    <div className={layoutTokens.headerCard} data-testid={dataTestId}>
      <div className={layoutTokens.headerTopRow}>
        <div className={layoutTokens.headerIconBox}>{icon}</div>

        <div className={layoutTokens.headerTextCol}>
          <h1 className={layoutTokens.headerTitle}>{title}</h1>
          {subtitle ? <p className={layoutTokens.headerSubtitle}>{subtitle}</p> : null}
          <div className={layoutTokens.headerDivider} />
        </div>
      </div>

      {children ? (
        <div className={cn(layoutTokens.headerInnerSlot, contentClassName)}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

export default JobyPageHeader
