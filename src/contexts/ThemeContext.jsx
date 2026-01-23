import React, { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()

export const useTheme = () => useContext(ThemeContext)

export const ThemeProvider = ({ children }) => {
  // Modos: 'light', 'dark', 'system'
  const [themeMode, setThemeMode] = useState('system')
  const [actualTheme, setActualTheme] = useState('light')

  // Função para detectar o tema do sistema
  const getSystemTheme = () => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }

  // Função para aplicar o tema no documento
  const applyTheme = (theme) => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    setActualTheme(theme)
  }

  // Inicialização do tema
  useEffect(() => {
    const storedMode = localStorage.getItem('joby_theme_mode')
    const mode = storedMode || 'system'
    setThemeMode(mode)

    if (mode === 'system') {
      const systemTheme = getSystemTheme()
      applyTheme(systemTheme)
    } else {
      applyTheme(mode)
    }
  }, [])

  // Listener para mudanças no tema do sistema
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e) => {
      if (themeMode === 'system') {
        applyTheme(e.matches ? 'dark' : 'light')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [themeMode])

  // Atualiza o tema quando o modo muda
  useEffect(() => {
    if (themeMode === 'system') {
      const systemTheme = getSystemTheme()
      applyTheme(systemTheme)
    } else {
      applyTheme(themeMode)
    }
  }, [themeMode])

  // Função para alternar entre os modos
  const setTheme = (mode) => {
    setThemeMode(mode)
    localStorage.setItem('joby_theme_mode', mode)
  }

  // Função legada de toggle (mantida para compatibilidade)
  const toggleTheme = () => {
    const newMode = actualTheme === 'light' ? 'dark' : 'light'
    setTheme(newMode)
  }

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        actualTheme,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}
