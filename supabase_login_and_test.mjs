import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://sondqndusmtxyhmtombv.supabase.co'
const supabaseKey =
  process.env.SUPABASE_KEY ||
  process.env.VITE_SUPABASE_KEY ||
  'REPLACE_WITH_KEY'

const supabase = createClient(supabaseUrl, supabaseKey)

const TABLE_NAME = 'servicos'

async function loginAndTest(email, password) {
  // Login user
  const {
    data: { session },
    error: loginError,
  } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (loginError) {
    console.error('Erro no login:', loginError.message)
    return
  }

  const token = session.access_token
  console.log('Token JWT:', token)

  // Test query with token
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${TABLE_NAME}`, {
      method: 'GET',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${token}`,
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

// To run tests, call with your test credentials (DON'T commit real credentials):
// loginAndTest('EMAIL', 'PASSWORD');
