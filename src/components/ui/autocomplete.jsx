import React, { useState } from 'react'

export function Autocomplete({
  options,
  value,
  onChange,
  placeholder = '',
  required = false,
  className = '',
  id = '',
  showOtherOption = false,
}) {
  const [search, setSearch] = useState('')
  const removeDuplicates = (arr) => Array.from(new Set(arr))
  const filterProfissoes = (input, profissoes) => {
    const unique = removeDuplicates(profissoes)
    if (!input) return unique.filter((opt) => opt !== 'Outros Serviços')
    const exact = unique.filter(
      (p) => p !== 'Outros Serviços' && p.toLowerCase() === input.toLowerCase()
    )
    const startsWith = unique.filter(
      (p) =>
        p !== 'Outros Serviços' &&
        p.toLowerCase().startsWith(input.toLowerCase()) &&
        p.toLowerCase() !== input.toLowerCase()
    )
    const contains = unique.filter(
      (p) =>
        p !== 'Outros Serviços' &&
        !p.toLowerCase().startsWith(input.toLowerCase()) &&
        p.toLowerCase().includes(input.toLowerCase())
    )
    return [...exact, ...startsWith, ...contains]
  }
  const filtered = filterProfissoes(search, options)
  const showDropdown =
    search.length > 0 && (filtered.length > 0 || showOtherOption)

  return (
    <div className={`relative ${className}`} id={id}>
      <input
        type="text"
        value={search !== '' ? search : value}
        onChange={(e) => {
          setSearch(e.target.value)
          if (value) onChange('') // Limpa o valor salvo ao digitar
        }}
        onBlur={() => {
          // Se o texto digitado não está na lista, não altera o valor do perfil
        }}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 border rounded bg-background/50"
        autoComplete="off"
      />
      {showDropdown && (
        <ul className="absolute z-10 w-full bg-background border rounded shadow mt-1 max-h-40 overflow-y-auto">
          {filtered.map((opt) => (
            <li
              key={opt}
              className="px-3 py-2 cursor-pointer hover:bg-accent"
              onClick={() => {
                onChange(opt)
                setSearch('') // Limpa o campo de busca ao selecionar
              }}
            >
              {opt}
            </li>
          ))}
          {showOtherOption && filtered.length === 0 && (
            <li
              key="Outros Serviços"
              className="px-3 py-2 cursor-pointer hover:bg-accent"
              onClick={() => {
                onChange('Outros Serviços')
                setSearch('') // Limpa o campo para permitir digitar novamente
              }}
            >
              Outros Serviços
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
