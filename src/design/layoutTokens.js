// Tokens de layout/UI do JOBY (intencionalmente mínimos e estáveis)

export const layoutTokens = {
  // Wrapper raiz de páginas dentro do MainLayout.
  // Deve permanecer neutro para evitar duplicar largura/padding do MainLayout.
  pageRootBase: '',

  // Use apenas quando a página realmente precisa de um espaço extra inferior
  // além do que o MainLayout já reserva.
  pageRootBottomOnly: 'pb-6',

  // Use apenas em páginas que precisam de pan/swipe touch.
  pageRootTouchPanY: 'touch-pan-y',

  // Header premium
  headerCard:
    'mb-3 rounded-3xl border border-border/50 bg-card/40 backdrop-blur-sm px-4 py-3.5 sm:px-5 sm:py-4 shadow-md',
  headerTopRow: 'flex items-center gap-4',
  headerIconBox:
    'h-[52px] w-[52px] sm:h-14 sm:w-14 rounded-2xl joby-gradient flex items-center justify-center shadow-xl ring-1 ring-black/5 shrink-0',
  headerTextCol: 'min-w-0 flex-1',
  headerTitle: 'text-xl sm:text-2xl font-extrabold tracking-tight leading-tight text-foreground',
  headerSubtitle: 'mt-0.5 text-sm text-muted-foreground',
  headerDivider: 'mt-2 h-px w-12 rounded-full bg-primary/80',
  headerInnerSlot: 'mt-3',
}
