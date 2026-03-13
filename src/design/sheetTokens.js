import { Z_SHEET_CONTENT, Z_SHEET_OVERLAY } from './overlayZIndexTokens'

export const sheetOverlayBlurDark = `fixed inset-0 ${Z_SHEET_OVERLAY} bg-black/60 backdrop-blur-sm`

export const bottomSheetContainerBase =
  `fixed ${Z_SHEET_CONTENT} left-0 right-0 bottom-0 mx-auto w-full max-w-2xl bg-background rounded-t-2xl border border-border shadow-2xl`

export const bottomSheetHandleWrap = 'pt-2 flex justify-center'

export const bottomSheetHandleBar = 'h-1 w-12 rounded-full bg-muted'
