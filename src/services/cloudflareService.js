/**
 * Serviço para comunicação com Cloudflare Worker (upload de vídeos R2)
 */

import { log } from '@/lib/logger'

const CLOUDFLARE_WORKER_URL =
  import.meta.env.VITE_WORKER_API_URL || import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';

const FASTSTART_SERVER_URL = import.meta.env.VITE_FASTSTART_API_URL || '';

function getWorkerBaseUrl() {
  const raw = String(CLOUDFLARE_WORKER_URL || '').trim().replace(/\/+$/, '');

  // Se não estiver configurado, usamos mesma origem.
  if (!raw) return '';

  // Se o app estiver sendo acessado via IP da rede (ex: 192.168.x.x)
  // e a env aponta para localhost/127, isso quebraria no celular (ele tentaria acessar o próprio 127.0.0.1).
  // Nesse caso, usa mesma origem e deixa o proxy do Vite encaminhar pro Worker.
  try {
    const currentHost = window.location.hostname;
    const envHost = new URL(raw).hostname;
    const isEnvLocal = envHost === '127.0.0.1' || envHost === 'localhost';
    const isCurrentLocal = currentHost === '127.0.0.1' || currentHost === 'localhost';
    if (isEnvLocal && !isCurrentLocal) return '';
  } catch {
    // ignore
  }

  return raw;
}

function buildWorkerUrl(path) {
  const base = getWorkerBaseUrl();
  const p = String(path || '').startsWith('/') ? String(path || '') : `/${path}`;
  return base ? `${base}${p}` : p;
}

function getFaststartBaseUrl() {
  const raw = String(FASTSTART_SERVER_URL || '').trim().replace(/\/+$/, '');

  // Se não estiver configurado, usamos mesma origem.
  if (!raw) return '';

  // Mesma proteção de LAN vs localhost.
  try {
    const currentHost = window.location.hostname;
    const envHost = new URL(raw).hostname;
    const isEnvLocal = envHost === '127.0.0.1' || envHost === 'localhost';
    const isCurrentLocal = currentHost === '127.0.0.1' || currentHost === 'localhost';
    if (isEnvLocal && !isCurrentLocal) return '';
  } catch {
    // ignore
  }

  return raw;
}

function buildFaststartUrl(path) {
  const base = getFaststartBaseUrl();
  const p = String(path || '').startsWith('/') ? String(path || '') : `/${path}`;
  return base ? `${base}${p}` : p;
}

function assertFaststartUrl() {
  // Sem URL -> tenta mesma origem (pode ser via proxy do Vite em dev)
  if (!getFaststartBaseUrl() && import.meta.env?.DEV !== true) {
    throw new Error(
      '❌ VARIÁVEL DE AMBIENTE FALTANDO: VITE_FASTSTART_API_URL\n' +
        'Aponte para o servidor Node (upload faststart).\n' +
        'Exemplo (dev):\n' +
        'VITE_FASTSTART_API_URL=http://localhost:8788\n'
    );
  }
}

function assertWorkerUrl() {
  // Se não tem URL, a gente cai pra mesma origem (via proxy do Vite em dev).
  // Só erro se não existir proxy/config e a chamada falhar.
  if (!getWorkerBaseUrl() && (import.meta.env?.DEV !== true)) {
    throw new Error(
      '❌ VARIÁVEL DE AMBIENTE FALTANDO: VITE_WORKER_API_URL (ou VITE_CLOUDFLARE_WORKER_URL)\n' +
        'Configure no .env (local) e no Cloudflare Pages (produção).\n' +
        'Exemplo (produção):\n' +
        'VITE_WORKER_API_URL=https://<seu-worker-ou-dominio>\n'
    );
  }
}

/**
 * Upload de vídeo para Cloudflare R2 via Worker
 *
 * IMPORTANTE:
 * - Worker espera o arquivo em "file"
 * - Worker espera o usuário em "user_id"
 *
 * @param {Object} params
 * @param {File} params.videoFile - Arquivo de vídeo
 * @param {string} params.userId - UUID do usuário
 * @param {string} params.title - Título do vídeo
 * @param {string} [params.description] - Descrição opcional
 * @param {string} [params.postId] - UUID do post (opcional)
 * @param {'short'|'long'} [params.videoType] - Tipo do vídeo (default: 'short')
 * @param {(percent:number)=>void} [params.onProgress] - Callback de progresso
 *
 * @returns {Promise<Object>} resposta do Worker
 */
export async function uploadVideoToCloudflare({
  videoFile,
  userId,
  title,
  description = '',
  postId = null,
  videoType = 'short',
  onProgress = null,
}) {
  assertWorkerUrl();

  const uploadUrl = buildWorkerUrl('/upload-video');
  try {
    if (import.meta.env.DEV) log.debug('UPLOAD', 'VIDEO UPLOAD URL:', uploadUrl)
  } catch {
    // ignore
  }

  // Validar arquivo
  if (!videoFile || !(videoFile instanceof File)) {
    throw new Error('Arquivo de vídeo inválido');
  }

  // Validar campos obrigatórios
  if (!userId) {
    throw new Error('userId é obrigatório');
  }
  if (!title || !String(title).trim()) {
    throw new Error('title é obrigatório');
  }

  // Criar FormData (NOMES QUE O WORKER ESPERA)
  const formData = new FormData();
  formData.append('file', videoFile); // ✅ worker espera "file"
  formData.append('user_id', userId); // ✅ worker espera "user_id"
  formData.append('title', String(title).trim());

  if (description && String(description).trim()) {
    formData.append('description', String(description).trim());
  }

  // Se o Worker não usar postId, ele simplesmente ignora
  if (postId) {
    formData.append('postId', postId);
  }

  // Se o Worker não usar videoType, ele ignora
  formData.append('videoType', videoType);

  // Preferir XHR quando onProgress existe (para ter barra real)
  if (typeof onProgress === 'function') {
    return await uploadWithXHR(uploadUrl, formData, onProgress);
  }

  // Fallback simples com fetch
  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // resposta não é JSON
  }

  if (!response.ok) {
    const msg =
      (json && (json.message || json.error)) ||
      `Erro ${response.status}${response.statusText ? `: ${response.statusText}` : ''}`;
    throw new Error(msg);
  }

  return json ?? { success: true, raw: text };
}

/**
 * Upload de vídeo via Node (remux faststart + upload R2 + insert Supabase)
 *
 * Mantém o mesmo contrato de retorno do Worker: { ok:true, r2Key, playbackUrl, inserted }
 */
export async function uploadVideoFaststart({
  videoFile,
  userId,
  title,
  description = '',
  uploadType = null,
  videoType = 'short',
  onProgress = null,
}) {
  assertFaststartUrl();

  const uploadUrl = buildFaststartUrl('/api/upload-video-faststart');
  try {
    if (import.meta.env.DEV) log.debug('UPLOAD', 'VIDEO FASTSTART UPLOAD URL:', uploadUrl)
  } catch {
    // ignore
  }

  if (!videoFile || !(videoFile instanceof File)) {
    throw new Error('Arquivo de vídeo inválido');
  }
  if (!userId) {
    throw new Error('userId é obrigatório');
  }
  if (!title || !String(title).trim()) {
    throw new Error('title é obrigatório');
  }

  const formData = new FormData();
  formData.append('file', videoFile);
  formData.append('user_id', userId);
  formData.append('title', String(title).trim());

  if (description && String(description).trim()) {
    formData.append('description', String(description).trim());
  }

  // New (JOBY): explicit upload type expected by backend rules.
  // Keep both keys to tolerate older/newer server parsers.
  if (uploadType && String(uploadType).trim()) {
    formData.append('upload_type', String(uploadType).trim());
    formData.append('uploadType', String(uploadType).trim());
  }

  formData.append('videoType', videoType);

  if (typeof onProgress === 'function') {
    return await uploadWithXHR(uploadUrl, formData, onProgress);
  }

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  if (!response.ok) {
    const msg =
      (json && (json.message || json.error)) ||
      `Erro ${response.status}${response.statusText ? `: ${response.statusText}` : ''}`;
    throw new Error(msg);
  }

  return json ?? { ok: true, raw: text };
}

/**
 * Upload via XHR com progresso real
 */
function uploadWithXHR(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener('load', () => {
      const status = xhr.status;
      const text = xhr.responseText || '';
      let json = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        // ignore parse
      }

      if (status >= 200 && status < 300) {
        onProgress(100);
        resolve(json ?? { success: true, raw: text });
      } else {
        const msg =
          (json && (json.message || json.error)) ||
          `Erro ${status}${xhr.statusText ? `: ${xhr.statusText}` : ''}`;
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error', () => {
      const isApi =
        String(url || '').includes('/api/') || String(url || '').includes('/api');
      const hint = isApi
        ? 'Verifique se o servidor Faststart está rodando (porta 8788) e se o proxy do Vite para /api está ativo.'
        : 'Verifique sua conexão e CORS/URL do servidor.';
      reject(new Error(`Erro de rede ao fazer upload. ${hint}`));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload cancelado'));
    });

    xhr.open('POST', url);
    xhr.send(formData);
  });
}

/**
 * Verifica se o Worker está acessível
 * - tenta /health (se existir)
 * - senão faz OPTIONS em /upload-video
 */
export async function checkWorkerHealth() {
  // Sem URL -> tenta mesma origem (proxy do Vite em dev)

  // tenta /health
  try {
    const r = await fetch(buildWorkerUrl('/health'));
    if (r.ok) return { available: true };
  } catch {
    // ignore
  }

  // fallback: OPTIONS /upload-video
  try {
    const response = await fetch(buildWorkerUrl('/upload-video'), {
      method: 'OPTIONS',
    });
    return { available: response.ok };
  } catch (error) {
    return { available: false, error: error.message };
  }
}
