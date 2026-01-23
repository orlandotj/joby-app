import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://sondqndusmtxyhmtombv.supabase.co'
const supabaseKey =
  process.env.SUPABASE_KEY ||
  process.env.VITE_SUPABASE_KEY ||
  'REPLACE_WITH_KEY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function login(email, password) {
  const {
    data: { session },
    error,
  } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    console.error('Erro no login:', error.message)
    return null
  } else {
    console.log('Token JWT:', session.access_token)
    return session.access_token
  }
}

// Substitua pelos seus dados de login para testar
login('seu@email.com', 'suasenha')
