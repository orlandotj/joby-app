import { useState, useEffect } from 'react'

/**
 * Hook para debounce de valores
 * Útil para otimizar buscas e evitar requisições desnecessárias
 *
 * @param {any} value - Valor a ser debounced
 * @param {number} delay - Delay em milissegundos (padrão: 500ms)
 * @returns {any} Valor debounced
 */
export const useDebounce = (value, delay = 500) => {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    // Atualizar valor debounced após o delay
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Limpar timeout se value mudar (cleanup)
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export default useDebounce
