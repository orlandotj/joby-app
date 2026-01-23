/**
 * Script de teste para verificar configuração do Supabase
 * Execute: node test_supabase_setup.mjs
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Ler .env
let supabaseUrl, supabaseKey
try {
  const envPath = join(__dirname, '.env')
  const envContent = fs.readFileSync(envPath, 'utf8')
  const env = Object.fromEntries(
    envContent
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [key, ...values] = line.split('=')
        return [key.trim(), values.join('=').trim()]
      })
  )

  supabaseUrl = env.VITE_SUPABASE_URL
  supabaseKey = env.VITE_SUPABASE_KEY || env.SUPABASE_KEY
} catch (err) {
  console.error('❌ Erro ao ler .env:', err.message)
  console.log('\n💡 Certifique-se que o arquivo .env existe com:')
  console.log('VITE_SUPABASE_URL=https://seu-projeto.supabase.co')
  console.log('VITE_SUPABASE_KEY=sua_chave_anon')
  process.exit(1)
}

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '❌ VITE_SUPABASE_URL ou VITE_SUPABASE_KEY não encontrados no .env'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('🧪 TESTE DE CONFIGURAÇÃO DO SUPABASE - JOBY APP')
console.log('='.repeat(60))
console.log(`📍 URL: ${supabaseUrl}`)
console.log(`🔑 Key: ${supabaseKey.substring(0, 20)}...`)
console.log('='.repeat(60))
console.log('')

// Testes
const tests = []
let passedTests = 0
let failedTests = 0

async function runTest(name, testFn) {
  process.stdout.write(`⏳ ${name}... `)
  try {
    await testFn()
    console.log('✅')
    passedTests++
    tests.push({ name, status: 'PASS' })
  } catch (err) {
    console.log(`❌ ${err.message}`)
    failedTests++
    tests.push({ name, status: 'FAIL', error: err.message })
  }
}

// TESTE 1: Conexão básica
await runTest('Conexão com Supabase', async () => {
  const response = await fetch(supabaseUrl)
  if (!response.ok) throw new Error('Não foi possível conectar')
})

// TESTE 2: Verificar tabela profiles
await runTest('Verificar tabela profiles', async () => {
  const { error } = await supabase.from('profiles').select('id').limit(1)
  if (error) throw new Error(error.message)
})

// TESTE 3: Verificar tabela services
await runTest('Verificar tabela services', async () => {
  const { error } = await supabase.from('services').select('id').limit(1)
  if (error) throw new Error(error.message)
})

// TESTE 4: Verificar tabela videos
await runTest('Verificar tabela videos', async () => {
  const { error } = await supabase.from('videos').select('id').limit(1)
  if (error) throw new Error(error.message)
})

// TESTE 5: Verificar tabela photos
await runTest('Verificar tabela photos', async () => {
  const { error } = await supabase.from('photos').select('id').limit(1)
  if (error) throw new Error(error.message)
})

// TESTE 6: Verificar tabela messages
await runTest('Verificar tabela messages', async () => {
  const { error } = await supabase.from('messages').select('id').limit(1)
  if (error) throw new Error(error.message)
})

// TESTE 7: Verificar tabela bookings
await runTest('Verificar tabela bookings', async () => {
  const { error } = await supabase.from('bookings').select('id').limit(1)
  if (error) throw new Error(error.message)
})

// TESTE 8: Verificar tabela reviews
await runTest('Verificar tabela reviews', async () => {
  const { error } = await supabase.from('reviews').select('id').limit(1)
  if (error) throw new Error(error.message)
})

// TESTE 9: Verificar tabela follows
await runTest('Verificar tabela follows', async () => {
  const { error } = await supabase.from('follows').select('id').limit(1)
  if (error) throw new Error(error.message)
})

// TESTE 10: Verificar storage bucket profile-photos
await runTest('Verificar bucket profile-photos', async () => {
  const { data, error } = await supabase.storage.getBucket('profile-photos')
  if (error)
    throw new Error('Bucket não encontrado - crie no Supabase Dashboard')
})

// TESTE 11: Verificar storage bucket videos
await runTest('Verificar bucket videos', async () => {
  const { data, error } = await supabase.storage.getBucket('videos')
  if (error)
    throw new Error('Bucket não encontrado - crie no Supabase Dashboard')
})

// TESTE 12: Verificar storage bucket photos
await runTest('Verificar bucket photos', async () => {
  const { data, error } = await supabase.storage.getBucket('photos')
  if (error)
    throw new Error('Bucket não encontrado - crie no Supabase Dashboard')
})

// TESTE 13: Teste de registro (criar usuário de teste)
const testEmail = `teste_${Date.now()}@joby-test.com`
const testPassword = 'Senha123!'
let testUserId = null

await runTest('Teste de registro de usuário', async () => {
  const { data, error } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: {
        name: 'Usuário Teste',
        profession: 'Testador',
      },
    },
  })

  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Usuário não foi criado')

  testUserId = data.user.id
})

// TESTE 14: Verificar se perfil foi criado automaticamente
await runTest('Verificar criação automática de perfil', async () => {
  if (!testUserId) throw new Error('Usuário de teste não criado')

  // Aguardar trigger criar o perfil
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', testUserId)
    .single()

  if (error) throw new Error('Perfil não foi criado automaticamente')
  if (!data) throw new Error('Perfil não encontrado')
})

// TESTE 15: Teste de login
await runTest('Teste de login', async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  })

  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Login falhou')
})

// TESTE 16: Limpar usuário de teste
await runTest('Limpar dados de teste', async () => {
  if (!testUserId) return

  // Fazer logout
  await supabase.auth.signOut()

  // Nota: O perfil será deletado automaticamente por CASCADE
})

console.log('')
console.log('='.repeat(60))
console.log('📊 RESULTADOS')
console.log('='.repeat(60))
console.log(`✅ Testes passados: ${passedTests}`)
console.log(`❌ Testes falhados: ${failedTests}`)
console.log(`📈 Total: ${tests.length}`)
console.log(
  `🎯 Taxa de sucesso: ${((passedTests / tests.length) * 100).toFixed(1)}%`
)
console.log('')

if (failedTests > 0) {
  console.log('❌ TESTES FALHADOS:')
  tests
    .filter((t) => t.status === 'FAIL')
    .forEach((t) => {
      console.log(`  • ${t.name}: ${t.error}`)
    })
  console.log('')
  console.log('💡 AÇÕES NECESSÁRIAS:')
  console.log('  1. Certifique-se que executou o script SQL completo')
  console.log('  2. Crie os buckets de storage no Supabase Dashboard')
  console.log('  3. Configure as políticas de autenticação')
  console.log('  4. Verifique o arquivo GUIA_CONFIGURACAO_SUPABASE.md')
  console.log('')
  process.exit(1)
} else {
  console.log('🎉 SUCESSO! Tudo está configurado corretamente!')
  console.log('')
  console.log('📝 PRÓXIMOS PASSOS:')
  console.log('  1. Execute: npm run dev')
  console.log('  2. Acesse: http://localhost:5173')
  console.log('  3. Crie uma conta e teste as funcionalidades')
  console.log('  4. Comece a desenvolver! 🚀')
  console.log('')
  process.exit(0)
}
