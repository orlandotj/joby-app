import fetch from 'node-fetch'

const SUPABASE_URL = 'https://sondqndusmtxyhmtombv.supabase.co'
const TABLE_NAME = 'servicos'
const API_KEY =
  process.env.SUPABASE_KEY ||
  process.env.VITE_SUPABASE_KEY ||
  'REPLACE_WITH_KEY'
const JWT_TOKEN = process.env.JWT_TOKEN || 'REPLACE_WITH_JWT'

async function testQuery() {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}`, {
      method: 'GET',
      headers: {
        apikey: API_KEY,
        Authorization: `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Erro na requisição:', errorText)
      return
    }

    const data = await response.json()
    console.log('Dados retornados:', data)
  } catch (error) {
    console.error('Erro ao fazer a requisição:', error)
  }
}

testQuery()
