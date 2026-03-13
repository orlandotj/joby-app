// JOBY overlay z-index scale (official)
// NOTE: Values currently match the existing codebase to minimize risk.
// A future phase can adjust the scale once all overlays are wired to these tokens.

export const Z_DIALOG_OVERLAY = 'z-[9999]'
export const Z_DIALOG_CONTENT = 'z-[10000]'

export const Z_SHEET_OVERLAY = 'z-[10000]'
export const Z_SHEET_CONTENT = 'z-[10001]'

export const Z_FULLSCREEN_OVERLAY = 'z-[9999]'
export const Z_FULLSCREEN_CONTENT = 'z-[10000]'
export const Z_FULLSCREEN_UI = 'z-[10001]'

export const Z_ALERT_OVERLAY = 'z-[11000]'
export const Z_ALERT_CONTENT = 'z-[11001]'

export const Z_TOAST = 'z-[20000]'
