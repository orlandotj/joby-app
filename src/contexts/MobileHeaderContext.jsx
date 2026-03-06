import React, { createContext, useContext, useMemo, useState } from 'react'

const MobileHeaderContext = createContext(null)

export const MobileHeaderProvider = ({ children } = {}) => {
  const [showMobileHeader, setShowMobileHeader] = useState(true)

  const value = useMemo(
    () => ({
      showMobileHeader,
      setShowMobileHeader,
    }),
    [showMobileHeader]
  )

  return (
    <MobileHeaderContext.Provider value={value}>
      {children}
    </MobileHeaderContext.Provider>
  )
}

export const useMobileHeader = () => {
  const ctx = useContext(MobileHeaderContext)
  if (!ctx) {
    throw new Error('useMobileHeader must be used within MobileHeaderProvider')
  }
  return ctx
}
