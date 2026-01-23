const normalizeText = (value) => (value == null ? '' : String(value)).trim().toLowerCase()

export const normalizePriceUnit = (raw) => {
  const v = normalizeText(raw)

  // Accept both stored values and UI labels.
  const map = {
    hora: 'hora',
    'por hora': 'hora',

    dia: 'dia',
    diária: 'dia',
    diaria: 'dia',
    'por dia': 'dia',
    'por diária': 'dia',
    'por diaria': 'dia',

    mes: 'mes',
    mês: 'mes',
    mensal: 'mes',
    mensalidade: 'mes',
    'por mês': 'mes',
    'por mes': 'mes',

    projeto: 'projeto',
    'por projeto': 'projeto',

    evento: 'evento',
    'por evento': 'evento',

    // Legacy values we used before; best-effort mapping.
    serviço: 'projeto',
    servico: 'projeto',
    visita: 'projeto',
    'visita técnica': 'projeto',
    'visita tecnica': 'projeto',
    quantidade: 'projeto',
  }

  return map[v] || 'hora'
}

export const formatPriceUnit = (raw, { prefix = false } = {}) => {
  const unit = normalizePriceUnit(raw)
  const pretty =
    unit === 'hora'
      ? 'hora'
      : unit === 'dia'
        ? 'dia'
        : unit === 'mes'
          ? 'mês'
          : unit

  return prefix ? `Por ${pretty}` : pretty
}
