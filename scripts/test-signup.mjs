import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

// Read .env
const envRaw = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
const env = Object.fromEntries(
  envRaw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split('=').map((s) => s.trim()))
)
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_KEY
if (!url || !key) {
  console.error('Faltando VITE_SUPABASE_URL ou VITE_SUPABASE_KEY em .env')
  process.exit(1)
}

const supabase = createClient(url, key)

async function run() {
  const timestamp = Date.now()
  const email = `copilot-test+${timestamp}@example.com`
  const password = 'Test1234!'
  console.log('Tentando registrar:', email)
  try {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      console.error('Erro do Supabase:', error)
      process.exit(2)
    }
    console.log('Resposta:', data)
  } catch (err) {
    console.error('Erro inesperado:', err)
    process.exit(3)
  }
}

run()
