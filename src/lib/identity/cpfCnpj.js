export const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '')

export const maskCPF = (value) => {
  const d = digitsOnly(value).slice(0, 11)
  const p1 = d.slice(0, 3)
  const p2 = d.slice(3, 6)
  const p3 = d.slice(6, 9)
  const p4 = d.slice(9, 11)
  if (d.length <= 3) return p1
  if (d.length <= 6) return `${p1}.${p2}`
  if (d.length <= 9) return `${p1}.${p2}.${p3}`
  return `${p1}.${p2}.${p3}-${p4}`
}

export const maskCNPJ = (value) => {
  const d = digitsOnly(value).slice(0, 14)
  const p1 = d.slice(0, 2)
  const p2 = d.slice(2, 5)
  const p3 = d.slice(5, 8)
  const p4 = d.slice(8, 12)
  const p5 = d.slice(12, 14)
  if (d.length <= 2) return p1
  if (d.length <= 5) return `${p1}.${p2}`
  if (d.length <= 8) return `${p1}.${p2}.${p3}`
  if (d.length <= 12) return `${p1}.${p2}.${p3}/${p4}`
  return `${p1}.${p2}.${p3}/${p4}-${p5}`
}

export const validateCPF = (cpf) => {
  const d = digitsOnly(cpf)
  if (!d) return { ok: true }
  if (d.length !== 11) return { ok: false, reason: 'CPF incompleto.' }
  if (/^(\d)\1{10}$/.test(d)) return { ok: false, reason: 'CPF inválido.' }

  const calc = (base, factor) => {
    let sum = 0
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i)
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }

  const d1 = calc(d.slice(0, 9), 10)
  const d2 = calc(d.slice(0, 9) + String(d1), 11)
  if (String(d1) !== d[9] || String(d2) !== d[10]) {
    return { ok: false, reason: 'CPF inválido.' }
  }
  return { ok: true }
}

export const validateCNPJ = (cnpj) => {
  const d = digitsOnly(cnpj)
  if (!d) return { ok: true }
  if (d.length !== 14) return { ok: false, reason: 'CNPJ incompleto.' }
  if (/^(\d)\1{13}$/.test(d)) return { ok: false, reason: 'CNPJ inválido.' }

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  const calc = (base, weights) => {
    let sum = 0
    for (let i = 0; i < weights.length; i++) sum += Number(base[i]) * weights[i]
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }

  const d1 = calc(d.slice(0, 12), weights1)
  const d2 = calc(d.slice(0, 12) + String(d1), weights2)

  if (String(d1) !== d[12] || String(d2) !== d[13]) {
    return { ok: false, reason: 'CNPJ inválido.' }
  }
  return { ok: true }
}
