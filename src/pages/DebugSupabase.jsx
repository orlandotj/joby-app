import React, { useState } from 'react'
import { supabaseUrl } from '@/lib/supabaseClient'

export default function DebugSupabase() {
  const [status, setStatus] = useState('idle') // idle | testing | success | error
  const [info, setInfo] = useState(null)

  const runTest = async () => {
    setStatus('testing')
    setInfo(null)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const res = await fetch(supabaseUrl + '/', {
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeout)

      const text = await res.text().catch(() => null)

      setInfo({
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        bodySnippet: text ? text.slice(0, 1000) : null,
      })
      setStatus('success')
    } catch (err) {
      setInfo({ error: true, message: err?.message || String(err) })
      setStatus('error')
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Debug Supabase</h1>
      <p className="mb-4">
        This page tests connectivity to your Supabase project URL:{' '}
        <code className="bg-muted px-2 py-1 rounded">{supabaseUrl}</code>
      </p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={runTest}
          className="rounded bg-primary px-4 py-2 text-white"
        >
          Testar conexão
        </button>
      </div>

      <div className="mt-4">
        <h2 className="font-semibold">
          Status: <span className="font-mono">{status}</span>
        </h2>
        {info && (
          <div className="mt-2 bg-surface border p-4 rounded">
            {info.error ? (
              <>
                <p className="text-red-600">Erro: {info.message}</p>
                <p className="mt-2 text-sm text-muted">
                  Se vir "Failed to fetch" ou "ERR_NAME_NOT_RESOLVED" é um
                  problema de DNS/rede local — tente `nslookup` com 1.1.1.1 /
                  8.8.8.8 ou testar em outra rede (hotspot).
                </p>
              </>
            ) : (
              <>
                <p>
                  HTTP {info.status} {info.statusText}
                </p>
                {info.bodySnippet && (
                  <pre className="mt-2 whitespace-pre-wrap text-sm max-h-60 overflow-auto bg-black/5 p-2 rounded">
                    {info.bodySnippet}
                  </pre>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 text-sm text-muted">
        <p>Comandos úteis:</p>
        <ul className="list-disc ml-6">
          <li>
            <code>nslookup {supabaseUrl.replace('https://', '')} 1.1.1.1</code>
          </li>
          <li>
            <code>nslookup {supabaseUrl.replace('https://', '')} 8.8.8.8</code>
          </li>
          <li>
            <code>curl -v {supabaseUrl}/</code>
          </li>
          <li>
            <code>ipconfig /flushdns</code> (Windows)
          </li>
        </ul>
      </div>
    </div>
  )
}
