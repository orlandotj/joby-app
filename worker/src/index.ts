export interface Env {
  VIDEOS_BUCKET: R2Bucket;

  // Secrets (configure via wrangler secret put)
  SUPABASE_URL: string; // ex: https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY: string; // service_role (recomendado no Worker)

  // Optional: signing secret for one-time upload URLs (recommended)
  UPLOAD_SIGNING_SECRET?: string;

  // Vars (wrangler.toml)
  CORS_ORIGIN?: string;
}

function normalizePathPrefix(value: string) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function encodePathPreserveSlashes(value: string) {
  const input = String(value || "").trim().replace(/^\/+/, "");
  if (!input) return "";
  return input
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : "";
}

async function supabaseAuthGetUserId(env: Env, accessToken: string) {
  const base = normalizePathPrefix(env.SUPABASE_URL);
  if (!accessToken) throw new Error("Missing access token");

  // Basic sanity check (not a full JWT validation; Supabase Auth validates it server-side below)
  if (!accessToken.includes(".")) {
    throw new Error("Invalid access token");
  }

  const res = await fetch(`${base}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Auth failed (${res.status}): ${text}`);
  }

  const data: any = await res.json().catch(() => null);
  const id = String(data?.id || "").trim();
  if (!id) throw new Error("Invalid auth user response");
  return id;
}

function assertAllowedUploadFile(file: File) {
  const type = String(file?.type || "").trim().toLowerCase();
  if (!type) throw new Error("Missing content-type");
  const isImage = type.startsWith("image/");
  const isVideo = type.startsWith("video/");
  if (!isImage && !isVideo) {
    throw new Error("Unsupported file type");
  }

  const maxBytes = isVideo ? 100 * 1024 * 1024 : 20 * 1024 * 1024; // video 100MB, image 20MB
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error("Empty file");
  if (file.size > maxBytes) {
    throw new Error(`File too large (max ${maxBytes} bytes)`);
  }

  return { isImage, isVideo, type, maxBytes };
}

async function supabaseRestGetOne(env: Env, table: string, query: string) {
  const base = normalizePathPrefix(env.SUPABASE_URL);
  const url = `${base}/rest/v1/${table}?${query}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`REST select failed (${res.status}): ${text}`);
  }

  const rows = (await res.json().catch(() => [])) as any[];
  return rows?.[0] ?? null;
}

async function supabaseRestGetMany(env: Env, table: string, query: string) {
  const base = normalizePathPrefix(env.SUPABASE_URL);
  const url = `${base}/rest/v1/${table}?${query}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`REST select failed (${res.status}): ${text}`);
  }

  const rows = (await res.json().catch(() => [])) as any[];
  return Array.isArray(rows) ? rows : [];
}

async function supabaseRestInsert(env: Env, table: string, payload: any) {
  const base = normalizePathPrefix(env.SUPABASE_URL);
  const url = `${base}/rest/v1/${table}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`REST insert failed (${res.status}): ${text}`);
  }

  const data = await res.json().catch(() => null);
  // PostgREST typically returns an array even for single-row inserts.
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

class HttpError extends Error {
  status: number;
  payload: any;

  constructor(status: number, payload: any, message?: string) {
    super(message || String(payload?.error || "HttpError"));
    this.status = status;
    this.payload = payload;
  }
}

async function ensureServiceRequestRow(env: Env, requestId: string, userId: string) {
  const reqQuery = `select=id,client_id,professional_id,status&id=eq.${encodeURIComponent(requestId)}`;

  const existing = await supabaseRestGetOne(env, "service_requests", reqQuery);
  if (existing) {
    const clientId = String(existing?.client_id || "").trim();
    if (!clientId || clientId !== userId) {
      throw new HttpError(403, { error: "Only the client can upload" });
    }
    return existing;
  }

  // Backfill from bookings when service_requests row doesn't exist yet.
  const booking = await supabaseRestGetOne(
    env,
    "bookings",
    `select=id,client_id,professional_id,status,notes&id=eq.${encodeURIComponent(requestId)}`
  );
  if (!booking) return null;

  const bookingClientId = String(booking?.client_id || "").trim();
  if (!bookingClientId || bookingClientId !== userId) {
    throw new HttpError(403, { error: "Only the client can upload" });
  }

  const professionalId = String(booking?.professional_id || "").trim() || null;
  const status = String(booking?.status || "").trim() || "pending";
  const notes = typeof booking?.notes === "string" ? booking.notes : null;

  try {
    await supabaseRestInsert(env, "service_requests", {
      id: requestId,
      client_id: bookingClientId,
      professional_id: professionalId,
      status,
      notes,
    });
  } catch (e: any) {
    // If it already exists (race/parallel uploads), ignore and re-select below.
    const msg = String(e?.message || e);
    const lower = msg.toLowerCase();
    const isConflict = msg.includes("(409)") || lower.includes("duplicate") || lower.includes("already exists");
    if (!isConflict) throw e;
  }

  const created = await supabaseRestGetOne(env, "service_requests", reqQuery);
  if (!created) return null;
  const createdClientId = String(created?.client_id || "").trim();
  if (!createdClientId || createdClientId !== userId) {
    throw new HttpError(403, { error: "Only the client can upload" });
  }
  return created;
}

async function supabaseStorageUpload(env: Env, bucket: string, objectPath: string, file: File) {
  const base = normalizePathPrefix(env.SUPABASE_URL);
  const encodedPath = encodePathPreserveSlashes(objectPath);
  const url = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;

  const body = await file.arrayBuffer();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Storage upload failed (${res.status}): ${text}`);
  }

  return true;
}

type NormalizeContext = "post_photo" | "profile_avatar" | "profile_cover" | "service_cover" | "chat_image";

function isNormalizeContext(value: string): value is NormalizeContext {
  return (
    value === "post_photo" ||
    value === "profile_avatar" ||
    value === "profile_cover" ||
    value === "service_cover" ||
    value === "chat_image"
  );
}

function getNormalizeRules(context: NormalizeContext) {
  const maxBytes = context === "profile_avatar" ? 10 * 1024 * 1024 : 30 * 1024 * 1024;
  const bucket = context === "profile_avatar" || context === "profile_cover" ? "profile-photos" : "photos";
  return { maxBytes, bucket };
}

type ImageMagicKind = "png" | "jpeg" | "webp" | "gif" | "bmp" | "tiff" | "heic" | "avif" | "unknown";

function bytesEqual(a: Uint8Array, b: number[]) {
  if (a.length < b.length) return false;
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function ascii(bytes: Uint8Array, start: number, len: number) {
  const end = Math.min(bytes.length, start + len);
  let s = "";
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function detectImageMagic(bytes: Uint8Array): { kind: ImageMagicKind; contentType: string; ext: string } {
  // PNG
  if (bytesEqual(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: "png", contentType: "image/png", ext: "png" };
  }

  // JPEG
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: "jpeg", contentType: "image/jpeg", ext: "jpg" };
  }

  // GIF
  const sig6 = ascii(bytes, 0, 6);
  if (sig6 === "GIF87a" || sig6 === "GIF89a") {
    return { kind: "gif", contentType: "image/gif", ext: "gif" };
  }

  // WEBP (RIFF....WEBP)
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { kind: "webp", contentType: "image/webp", ext: "webp" };
  }

  // BMP
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { kind: "bmp", contentType: "image/bmp", ext: "bmp" };
  }

  // TIFF
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))
  ) {
    return { kind: "tiff", contentType: "image/tiff", ext: "tif" };
  }

  // ISO-BMFF (HEIC/AVIF): look for 'ftyp' at offset 4.
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    const heicBrands = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);
    const avifBrands = new Set(["avif", "avis"]);
    if (avifBrands.has(brand)) {
      return { kind: "avif", contentType: "image/avif", ext: "avif" };
    }
    if (heicBrands.has(brand)) {
      // Content-Type varies across devices; keep a reasonable canonical value.
      return { kind: "heic", contentType: "image/heic", ext: "heic" };
    }
  }

  return { kind: "unknown", contentType: "application/octet-stream", ext: "bin" };
}

async function supabaseStorageCreateSignedUrl(env: Env, bucket: string, objectPath: string, expiresInSeconds: number) {
  const base = normalizePathPrefix(env.SUPABASE_URL);
  const encodedPath = encodePathPreserveSlashes(objectPath);
  const url = `${base}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Signed URL failed (${res.status}): ${text}`);
  }

  const data: any = await res.json().catch(() => null);
  const signedURL = String(data?.signedURL || data?.signedUrl || "").trim();
  if (!signedURL) throw new Error("Signed URL missing in response");

  // signedURL typically starts with /object/sign/...
  const storageBase = `${base}/storage/v1`;
  const full = signedURL.startsWith("http") ? signedURL : `${storageBase}${signedURL}`;
  return full;
}

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function corsHeaders(env: Env) {
  const origin = env.CORS_ORIGIN?.trim() || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function isUuid(value: string) {
  const v = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function sanitizeExtFromFilename(filename: string) {
  const raw = String(filename || "").trim();
  const parts = raw.split(".");
  const ext = (parts.length > 1 ? parts.pop() : "") || "bin";
  const safe = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  return safe || "bin";
}

function base64UrlEncode(buf: ArrayBufferLike) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // btoa expects binary string
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeText(text: string) {
  const encoded = new TextEncoder().encode(text);
  const ab = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
  return base64UrlEncode(ab);
}

function base64UrlDecodeToText(value: string) {
  const v = String(value || "").trim().replace(/-/g, "+").replace(/_/g, "/");
  const pad = v.length % 4 === 0 ? "" : "=".repeat(4 - (v.length % 4));
  const bin = atob(v + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacSha256(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return sig;
}

async function signUploadToken(env: Env, payload: any) {
  const secret = String(env.UPLOAD_SIGNING_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!secret) throw new Error("Missing signing secret");
  const jsonPayload = JSON.stringify(payload);
  const payloadB64 = base64UrlEncodeText(jsonPayload);
  const sig = await hmacSha256(secret, payloadB64);
  const sigB64 = base64UrlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

async function verifyUploadToken(env: Env, token: string) {
  const secret = String(env.UPLOAD_SIGNING_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!secret) throw new Error("Missing signing secret");
  const t = String(token || "").trim();
  const parts = t.split(".");
  if (parts.length !== 2) throw new Error("Invalid token");
  const payloadB64 = parts[0];
  const sigB64 = parts[1];

  const expectedSig = await hmacSha256(secret, payloadB64);
  const expectedSigB64 = base64UrlEncode(expectedSig);
  if (sigB64 !== expectedSigB64) throw new Error("Invalid token signature");

  const payloadText = base64UrlDecodeToText(payloadB64);
  const payload = JSON.parse(payloadText);
  const exp = Number(payload?.exp || 0);
  if (!exp || !Number.isFinite(exp) || Date.now() > exp) throw new Error("Token expired");
  return payload;
}

async function supabaseStorageCreateSignedUploadUrl(
  env: Env,
  bucket: string,
  objectPath: string,
  { upsert = false } = {}
) {
  const base = normalizePathPrefix(env.SUPABASE_URL);
  const encodedPath = encodePathPreserveSlashes(objectPath);
  const url = `${base}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(upsert ? { "x-upsert": "true" } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Signed upload URL failed (${res.status}): ${text}`);
  }

  const data: any = await res.json().catch(() => null);
  const relative = String(data?.url || data?.signedUrl || data?.signedURL || "").trim();
  if (!relative) throw new Error("Signed upload URL missing in response");

  const storageBase = `${base}/storage/v1`;
  const full = relative.startsWith("http") ? relative : `${storageBase}${relative}`;

  // Parse token from query string (helpful for debugging; uploadUrl already includes it)
  let token = "";
  try {
    const u = new URL(full);
    token = String(u.searchParams.get("token") || "").trim();
  } catch {
    // ignore
  }

  return { uploadUrl: full, token };
}

function parseRangeHeader(rangeHeader: string) {
  // Examples:
  // - bytes=0-1023
  // - bytes=0-
  // - bytes=-500
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;

  const startStr = match[1];
  const endStr = match[2];

  if (startStr === "" && endStr === "") return null;

  if (startStr === "") {
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { suffix } as const;
  }

  const offset = Number(startStr);
  if (!Number.isFinite(offset) || offset < 0) return null;

  if (endStr === "") {
    return { offset } as const;
  }

  const end = Number(endStr);
  if (!Number.isFinite(end) || end < offset) return null;
  return { offset, length: end - offset + 1 } as const;
}

function requireEnv(env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_URL.startsWith("http")) {
    throw new Error("SUPABASE_URL missing/invalid. Configure with: wrangler secret put SUPABASE_URL");
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY missing. Configure with: wrangler secret put SUPABASE_SERVICE_ROLE_KEY"
    );
  }
}

function sanitizeKey(key: string) {
  // remove leading slashes and disallow ".."
  const k = key.replace(/^\/+/, "");
  if (!k || k.includes("..")) throw new Error("Invalid r2_key");
  return k;
}

function guessContentType(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  return "application/octet-stream";
}

async function saveVideoMetadataToSupabase(env: Env, payload: any) {
  // Supabase REST endpoint
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const url = `${base}/rest/v1/videos`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase insert failed (${res.status}): ${text}`);
  }

  const data = await res.json().catch(() => null);
  return data;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const cors = corsHeaders(env);

    const isPath = (value: string, expected: string) => value === expected || value === `${expected}/`;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: cors });
    }

    // Health
    if (request.method === "GET" && (isPath(pathname, "/") || isPath(pathname, "/health"))) {
      return json(
        {
          ok: true,
          routes: [
            "POST /api/images/normalize",
            "POST /api/chat-attachments/signed-upload-url",
            "PUT /api/chat-attachments/r2-upload/<r2_key>?token=...",
            "POST /api/service-attachments/upload",
            "POST /api/service-attachments/signed-urls",
            "POST /api/service-attachments/signed-url",
            "POST /upload-video",
            "GET /video/<r2_key>",
          ],
        },
        { status: 200, headers: cors }
      );
    }

    // =====================================
    // Images Normalize API
    // - Auth: Supabase JWT (Bearer) validated server-side
    // - Accepts multipart/form-data: file + context
    // - Validates by magic bytes (minimum)
    // - MVP conversion: save original for PNG/JPEG/WEBP
    // - HEIC/AVIF/TIFF: 415 unless context=chat_image (may save original with warning)
    // =====================================
    if (request.method === "POST" && isPath(pathname, "/api/images/normalize")) {
      try {
        requireEnv(env);

        const token = getBearerToken(request);
        if (!token) {
          return json(
            {
              ok: false,
              code: "MISSING_TOKEN",
              message: "Missing access token",
            },
            { status: 401, headers: cors }
          );
        }

        let userId: string;
        try {
          userId = await supabaseAuthGetUserId(env, token);
        } catch (e: any) {
          const msg = String(e?.message || e);
          const isMissing = msg.toLowerCase().includes("missing access token");
          const isInvalid = msg.toLowerCase().includes("invalid access token");
          const isAuthFailed = msg.toLowerCase().startsWith("auth failed");

          if (isMissing) {
            return json(
              {
                ok: false,
                code: "MISSING_TOKEN",
                message: "Missing access token",
              },
              { status: 401, headers: cors }
            );
          }

          if (isInvalid || isAuthFailed) {
            return json(
              {
                ok: false,
                code: "INVALID_TOKEN",
                message: "Invalid access token",
              },
              { status: 403, headers: cors }
            );
          }

          throw e;
        }
        if (!isUuid(userId)) return json({ error: "Invalid auth" }, { status: 401, headers: cors });

        const contentType = request.headers.get("Content-Type") || "";
        if (!contentType.toLowerCase().includes("multipart/form-data")) {
          return json({ error: "Expected multipart/form-data", code: "EXPECTED_MULTIPART" }, { status: 400, headers: cors });
        }

        const form = await request.formData();
        const file = form.get("file") as any;
        const contextRaw = String(form.get("context") ?? "").trim();

        if (!(file instanceof File)) {
          return json({ error: "Missing file", code: "NO_FILE" }, { status: 400, headers: cors });
        }
        if (!Number.isFinite(file.size) || file.size <= 0) {
          return json({ error: "Empty file", code: "EMPTY_FILE" }, { status: 400, headers: cors });
        }
        if (!isNormalizeContext(contextRaw)) {
          return json(
            {
              error: "Invalid context",
              code: "INVALID_CONTEXT",
              allowed: ["post_photo", "profile_avatar", "profile_cover", "service_cover", "chat_image"],
            },
            { status: 400, headers: cors }
          );
        }

        const context = contextRaw as NormalizeContext;
        const rules = getNormalizeRules(context);
        if (file.size > rules.maxBytes) {
          return json(
            { error: "File too large", code: "FILE_TOO_LARGE", maxBytes: rules.maxBytes },
            { status: 413, headers: cors }
          );
        }

        const headBuf = await file.slice(0, 64).arrayBuffer();
        const head = new Uint8Array(headBuf);
        const magic = detectImageMagic(head);

        if (magic.kind === "unknown") {
          return json(
            { error: "Unsupported image format", code: "UNRECOGNIZED_MAGIC" },
            { status: 415, headers: cors }
          );
        }

        const warnings: any[] = [];
        const canSaveOriginalOnUnsupportedDecode = context === "chat_image";

        const requiresDecodeToNormalize = magic.kind === "heic" || magic.kind === "avif" || magic.kind === "tiff";
        const isGif = magic.kind === "gif";

        // For critical contexts, do not persist formats that likely won't render.
        if ((requiresDecodeToNormalize || isGif) && !canSaveOriginalOnUnsupportedDecode) {
          const code = "UNSUPPORTED_DECODE_RUNTIME";
          const message =
            magic.kind === "gif"
              ? "GIF não suportado para normalização no servidor no momento"
              : "Formato de imagem não suportado para conversão no servidor no momento";
          return json({ error: message, code, kind: magic.kind }, { status: 415, headers: cors });
        }

        if (requiresDecodeToNormalize || isGif) {
          warnings.push({ code: "SAVED_ORIGINAL_UNSUPPORTED_CONVERSION", kind: magic.kind });
        }

        // MVP: no re-encode in Worker runtime. Save original bytes.
        const objectPath = `normalized/${context}/${userId}/${crypto.randomUUID()}.${magic.ext}`;

        // Ensure Storage sees a sensible content-type.
        const body = await file.arrayBuffer();
        const fixed = new File([body], file.name || `upload.${magic.ext}`, { type: magic.contentType });
        await supabaseStorageUpload(env, rules.bucket, objectPath, fixed);

        return json(
          {
            ok: true,
            result: {
              url: `storage://${rules.bucket}/${objectPath}`,
              bucket: rules.bucket,
              objectPath,
              contentType: magic.contentType,
              bytes: Number(fixed.size || 0) || Number(file.size || 0) || 0,
            },
            warnings,
          },
          { status: 200, headers: cors }
        );
      } catch (e: any) {
        if (e instanceof HttpError) {
          return json(e.payload, { status: e.status, headers: cors });
        }
        return json({ error: "Normalize failed", message: String(e?.message || e) }, { status: 500, headers: cors });
      }
    }

    // =====================================
    // CHAT Attachments API (Signed Upload URLs)
    // - Auth: Supabase JWT (Bearer) validated server-side
    // - Worker validates destination user (participation in conversation)
    // - Photos/PDF/files -> Supabase Storage (bucket: photos)
    // - Videos -> R2 (bucket binding: VIDEOS_BUCKET)
    // =====================================

    // POST /api/chat-attachments/signed-upload-url
    if (request.method === "POST" && isPath(pathname, "/api/chat-attachments/signed-upload-url")) {
      try {
        requireEnv(env);

        const token = getBearerToken(request);
        const userId = await supabaseAuthGetUserId(env, token);

        const body: any = await request.json().catch(() => ({}));
        const otherUserId = String(body?.otherUserId ?? body?.other_user_id ?? body?.receiverId ?? body?.receiver_id ?? "").trim();
        const fileName = String(body?.fileName ?? body?.filename ?? body?.name ?? "").trim();
        const contentType = String(body?.contentType ?? body?.type ?? body?.mimeType ?? "").trim();
        const size = Number(body?.size ?? body?.fileSize ?? 0);

        if (!isUuid(userId)) return json({ error: "Invalid auth" }, { status: 401, headers: cors });
        if (!isUuid(otherUserId) || otherUserId === userId) {
          return json({ error: "Invalid otherUserId" }, { status: 400, headers: cors });
        }
        if (!contentType) {
          return json({ error: "Missing contentType" }, { status: 400, headers: cors });
        }
        if (Number.isFinite(size) && size <= 0) {
          return json({ error: "Missing/invalid size" }, { status: 400, headers: cors });
        }

        // Validate the destination user exists (conversation participant)
        const otherProfile = await supabaseRestGetOne(env, "profiles", `select=id&id=eq.${encodeURIComponent(otherUserId)}`);
        if (!otherProfile) return json({ error: "User not found" }, { status: 404, headers: cors });

        const isVideo = String(contentType || "").toLowerCase().startsWith("video/");
        const ext = sanitizeExtFromFilename(fileName);

        if (!isVideo) {
          // Supabase Storage (photos bucket)
          const objectPath = `message-attachments/${userId}/${crypto.randomUUID()}.${ext}`;
          const signed = await supabaseStorageCreateSignedUploadUrl(env, "photos", objectPath, { upsert: false });

          return json(
            {
              ok: true,
              provider: "supabase",
              method: "PUT",
              uploadUrl: signed.uploadUrl,
              bucket: "photos",
              objectPath,
              url: `storage://photos/${objectPath}`,
              contentType,
            },
            { status: 200, headers: cors }
          );
        }

        // R2 (videos only)
        const r2Key = `videos/${userId}/${crypto.randomUUID()}.${ext}`;
        const exp = Date.now() + 10 * 60 * 1000; // 10 minutes
        const uploadToken = await signUploadToken(env, {
          v: 1,
          kind: "chat_video",
          uid: userId,
          key: r2Key,
          exp,
          ct: contentType,
          size,
        });
        const uploadUrl = `${url.origin}/api/chat-attachments/r2-upload/${encodePathPreserveSlashes(r2Key)}?token=${encodeURIComponent(uploadToken)}`;

        return json(
          {
            ok: true,
            provider: "r2",
            method: "PUT",
            uploadUrl,
            r2Key,
            url: r2Key,
            contentType,
          },
          { status: 200, headers: cors }
        );
      } catch (e: any) {
        return json({ error: "Signed upload URL failed", message: String(e?.message || e) }, { status: 500, headers: cors });
      }
    }

    // PUT /api/chat-attachments/r2-upload/<r2_key>?token=...
    if (request.method === "PUT" && pathname.startsWith("/api/chat-attachments/r2-upload/")) {
      try {
        requireEnv(env);

        const token = String(new URL(request.url).searchParams.get("token") || "").trim();
        if (!token) return json({ error: "Missing token" }, { status: 400, headers: cors });

        const rawKey = pathname.slice("/api/chat-attachments/r2-upload/".length);
        const decodedKey = (() => {
          try {
            return decodeURIComponent(rawKey);
          } catch {
            return rawKey;
          }
        })();
        const r2Key = sanitizeKey(decodedKey);

        const payload = await verifyUploadToken(env, token);
        const expectedKey = String(payload?.key || "").trim();
        if (!expectedKey || expectedKey !== r2Key) return json({ error: "Token/key mismatch" }, { status: 403, headers: cors });

        const contentType = String(request.headers.get("Content-Type") || payload?.ct || "application/octet-stream").trim();

        // NOTE: reading into memory; for very large videos, consider multipart uploads.
        const body = await request.arrayBuffer();
        if (!body || body.byteLength <= 0) return json({ error: "Empty body" }, { status: 400, headers: cors });

        await env.VIDEOS_BUCKET.put(r2Key, body, {
          httpMetadata: { contentType },
          customMetadata: {
            user_id: String(payload?.uid || ""),
            kind: String(payload?.kind || ""),
          },
        });

        return json({ ok: true, r2Key }, { status: 200, headers: cors });
      } catch (e: any) {
        return json({ error: "R2 upload failed", message: String(e?.message || e) }, { status: 500, headers: cors });
      }
    }

    // ---- Playback proxy: GET /video/<r2_key> ----
    if (request.method === "GET" && pathname.startsWith("/video/")) {
      try {
        const rawKey = pathname.slice("/video/".length);
        const decodedKey = (() => {
          try {
            return decodeURIComponent(rawKey);
          } catch {
            return rawKey;
          }
        })();
        const r2Key = sanitizeKey(decodedKey);

        // Support Range requests (video streaming)
        const rangeHeader = request.headers.get("Range") || undefined;
        const parsedRange = rangeHeader ? parseRangeHeader(rangeHeader) : null;

        const obj = await env.VIDEOS_BUCKET.get(r2Key, parsedRange ? { range: parsedRange } : undefined);
        if (!obj) {
          return json({ error: "Video not found" }, { status: 404, headers: cors });
        }

        const headers = new Headers(cors);
        headers.set("Accept-Ranges", "bytes");
        headers.set("Content-Type", obj.httpMetadata?.contentType || guessContentType(r2Key));
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        // Help browser cache/validation. (R2 provides etag/uploaded for objects.)
        try {
          const etag = (obj as any)?.etag;
          if (etag) headers.set("ETag", String(etag));
        } catch {}
        try {
          const uploaded = (obj as any)?.uploaded;
          const t = uploaded ? new Date(uploaded) : null;
          if (t && !Number.isNaN(t.getTime())) headers.set("Last-Modified", t.toUTCString());
        } catch {}

        if (parsedRange) {
          let start: number;
          let end: number;

          if ("suffix" in parsedRange) {
            const suffixRaw = (parsedRange as any).suffix;
            const suffixNum = Number(suffixRaw);
            const suffix = Math.min(Number.isFinite(suffixNum) ? suffixNum : 0, obj.size);
            start = obj.size - suffix;
            end = obj.size - 1;
          } else {
            start = parsedRange.offset;
            const lenRaw = (parsedRange as any).length;
            const lenNum = Number(lenRaw);
            end = Number.isFinite(lenNum) && lenNum > 0 ? parsedRange.offset + lenNum - 1 : obj.size - 1;
          }

          if (start >= obj.size || start < 0 || end < start) {
            headers.set("Content-Range", `bytes */${obj.size}`);
            return new Response(null, { status: 416, headers });
          }

          headers.set("Content-Range", `bytes ${start}-${end}/${obj.size}`);
          headers.set("Content-Length", String(end - start + 1));
          return new Response(obj.body, { status: 206, headers });
        }

        headers.set("Content-Length", String(obj.size));
        return new Response(obj.body, { status: 200, headers });
      } catch (e: any) {
        return json({ error: "Playback error", message: String(e?.message || e) }, { status: 500, headers: cors });
      }
    }

    // =====================================
    // JOBY Service Attachments API
    // - photos bucket is PRIVATE
    // - access via these endpoints using service_role
    // - permissions enforced via DB checks
    // =====================================

    // POST /api/service-attachments/upload
    if (request.method === "POST" && isPath(pathname, "/api/service-attachments/upload")) {
      try {
        requireEnv(env);

        const token = getBearerToken(request);
        const userId = await supabaseAuthGetUserId(env, token);

        const contentType = request.headers.get("Content-Type") || "";
        if (!contentType.toLowerCase().includes("multipart/form-data")) {
          return json({ error: "Expected multipart/form-data" }, { status: 400, headers: cors });
        }

        const form = await request.formData();
        const requestId = String(form.get("requestId") ?? form.get("request_id") ?? "").trim();
        const file = form.get("file") as any;
        const captionRaw = String(
          form.get("caption") ?? form.get("description") ?? form.get("legend") ?? ""
        ).trim();
        const caption = captionRaw ? captionRaw.slice(0, 200) : "";

        if (!requestId) return json({ error: "Missing requestId" }, { status: 400, headers: cors });
        if (!isUuid(requestId)) return json({ error: "Invalid requestId" }, { status: 400, headers: cors });
        if (!(file instanceof File)) return json({ error: "Missing file" }, { status: 400, headers: cors });

        let mediaType: "image" | "video" = "image";
        try {
          const allowed = assertAllowedUploadFile(file);
          mediaType = allowed.isVideo ? "video" : "image";
        } catch (e: any) {
          return json({ error: "Invalid file", message: String(e?.message || e) }, { status: 400, headers: cors });
        }

        const reqRow = await ensureServiceRequestRow(env, requestId, userId);
        if (!reqRow) return json({ error: "Request not found" }, { status: 404, headers: cors });

        const clientId = String(reqRow?.client_id || "").trim();
        if (!clientId || clientId !== userId) return json({ error: "Only the client can upload" }, { status: 403, headers: cors });

        const extRaw = (file.name.split(".").pop() || "bin").toLowerCase();
        const ext = extRaw.replace(/[^a-z0-9]/g, "") || "bin";
        const objectPath = `service-attachments/${clientId}/${requestId}/${crypto.randomUUID()}.${ext}`;

        await supabaseStorageUpload(env, "photos", objectPath, file);
        let inserted: any = null;
        const baseRow: any = {
          request_id: requestId,
          uploader_id: clientId,
          bucket_id: "photos",
          object_path: objectPath,
          media_type: mediaType,
        };

        // Caption is optional and schema may be behind; insert with fallback.
        try {
          inserted = await supabaseRestInsert(env, "service_request_media", {
            ...baseRow,
            caption: caption || null,
          });
        } catch (e: any) {
          const msg = String(e?.message || e);
          const isMissingColumn = msg.toLowerCase().includes("column") && msg.toLowerCase().includes("does not exist");
          if (!isMissingColumn) throw e;
          inserted = await supabaseRestInsert(env, "service_request_media", baseRow);
        }

        return json(
          {
            ok: true,
            mediaType,
            media: {
              id: inserted?.id,
              requestId,
            },
          },
          { status: 200, headers: cors }
        );
      } catch (e: any) {
        if (e instanceof HttpError) {
          return json(e.payload, { status: e.status, headers: cors });
        }
        return json(
          { error: "Upload failed", message: String(e?.message || e) },
          { status: 500, headers: cors }
        );
      }
    }

    // POST /api/service-attachments/signed-urls (batch)
    if (request.method === "POST" && isPath(pathname, "/api/service-attachments/signed-urls")) {
      try {
        requireEnv(env);

        const token = getBearerToken(request);
        const userId = await supabaseAuthGetUserId(env, token);

        const body: any = await request.json().catch(() => ({}));
        const mediaIdsRaw: any = body?.mediaIds ?? body?.media_ids ?? body?.ids ?? [];
        const mediaIds = Array.isArray(mediaIdsRaw)
          ? mediaIdsRaw.map((v) => String(v ?? "").trim()).filter(Boolean)
          : [];

        if (mediaIds.length === 0) return json({ error: "Missing mediaIds" }, { status: 400, headers: cors });

        // Guardrails: keep payloads reasonable.
        const uniqueMediaIds = Array.from(new Set(mediaIds)).slice(0, 50);

        const idsIn = uniqueMediaIds.map((id) => encodeURIComponent(id)).join(",");
        const mediaRows = await supabaseRestGetMany(
          env,
          "service_request_media",
          `select=id,request_id,object_path,media_type&id=in.(${idsIn})`
        );

        if (mediaRows.length === 0) {
          return json({ ok: true, signedUrlsById: {} }, { status: 200, headers: cors });
        }

        const requestIds = Array.from(
          new Set(mediaRows.map((r: any) => String(r?.request_id ?? "").trim()).filter(Boolean))
        );

        const reqIdsIn = requestIds.map((id) => encodeURIComponent(id)).join(",");
        const requestRows = requestIds.length
          ? await supabaseRestGetMany(
              env,
              "service_requests",
              `select=id,client_id,professional_id&id=in.(${reqIdsIn})`
            )
          : [];

        const requestById = new Map<string, any>(requestRows.map((r: any) => [String(r?.id ?? "").trim(), r]));

        const canViewRequest = (requestId: string) => {
          const reqRow = requestById.get(requestId);
          if (!reqRow) return false;
          const clientId = String(reqRow?.client_id || "").trim();
          const professionalId = String(reqRow?.professional_id || "").trim();
          return userId === clientId || (professionalId && userId === professionalId);
        };

        const signedUrlsById: Record<string, string> = {};

        const concurrency = 8;
        let index = 0;
        const runNext = async (): Promise<void> => {
          const current = index++;
          if (current >= mediaRows.length) return;

          const row: any = mediaRows[current];
          const mediaId = String(row?.id ?? "").trim();
          const requestId = String(row?.request_id ?? "").trim();
          const objectPath = String(row?.object_path ?? "").trim();
          if (!mediaId || !requestId || !objectPath) return runNext();

          if (!canViewRequest(requestId)) return runNext();

          try {
            const signedUrl = await supabaseStorageCreateSignedUrl(env, "photos", objectPath, 60 * 30);
            if (signedUrl) signedUrlsById[mediaId] = signedUrl;
          } catch {
            // ignore per-item failures
          }

          return runNext();
        };

        await Promise.all(Array.from({ length: Math.min(concurrency, mediaRows.length) }, () => runNext()));

        return json({ ok: true, signedUrlsById }, { status: 200, headers: cors });
      } catch (e: any) {
        return json(
          { error: "Signed URLs failed", message: String(e?.message || e) },
          { status: 500, headers: cors }
        );
      }
    }

    // POST /api/service-attachments/signed-url
    if (request.method === "POST" && isPath(pathname, "/api/service-attachments/signed-url")) {
      try {
        requireEnv(env);

        const token = getBearerToken(request);
        const userId = await supabaseAuthGetUserId(env, token);

        const body: any = await request.json().catch(() => ({}));

        const mediaId = String(body?.mediaId ?? body?.media_id ?? "").trim();
        if (!mediaId) return json({ error: "Missing mediaId" }, { status: 400, headers: cors });

        // Never accept object_path from the client.
        const mediaRow = await supabaseRestGetOne(
          env,
          "service_request_media",
          `select=id,request_id,object_path,media_type&id=eq.${encodeURIComponent(mediaId)}`
        );
        if (!mediaRow) return json({ error: "Media not found" }, { status: 404, headers: cors });

        const requestId = String(mediaRow?.request_id || "").trim();
        const objectPath = String(mediaRow?.object_path || "").trim();
        if (!requestId || !objectPath) return json({ error: "Media invalid" }, { status: 400, headers: cors });

        const reqRow = await supabaseRestGetOne(
          env,
          "service_requests",
          `select=id,client_id,professional_id,status&id=eq.${encodeURIComponent(requestId)}`
        );
        if (!reqRow) return json({ error: "Request not found" }, { status: 404, headers: cors });

        const clientId = String(reqRow?.client_id || "").trim();
        const professionalId = String(reqRow?.professional_id || "").trim();
        const canView = userId === clientId || (professionalId && userId === professionalId);
        if (!canView) return json({ error: "Forbidden" }, { status: 403, headers: cors });

        const signedUrl = await supabaseStorageCreateSignedUrl(env, "photos", objectPath, 60 * 30);
        return json({ ok: true, signedUrl }, { status: 200, headers: cors });
      } catch (e: any) {
        return json(
          { error: "Signed URL failed", message: String(e?.message || e) },
          { status: 500, headers: cors }
        );
      }
    }

    // ---- Upload: POST /upload-video ----
    if (request.method === "POST" && isPath(pathname, "/upload-video")) {
      try {
        requireEnv(env);

        const contentType = request.headers.get("Content-Type") || "";
        if (!contentType.toLowerCase().includes("multipart/form-data")) {
          return json({ error: "Expected multipart/form-data" }, { status: 400, headers: cors });
        }

        const form = await request.formData();

        // Required fields (aceita variações para evitar mismatch entre versões do frontend/README)
        const fileAny: any = form.get("file") ?? form.get("video") ?? form.get("videoFile");
        const userId = String(form.get("user_id") ?? form.get("userId") ?? "").trim();

        if (!userId) return json({ error: "Missing user_id" }, { status: 400, headers: cors });
        const file = fileAny && typeof fileAny === "object" ? (fileAny as File) : null;
        if (!file || typeof (file as any).arrayBuffer !== "function") {
          return json({ error: "Missing file" }, { status: 400, headers: cors });
        }

        // Optional metadata
        const title = String(form.get("title") || "").trim();
        const description = String(form.get("description") || "").trim();
        const uploadType = String(form.get("upload_type") ?? form.get("videoType") ?? "short-video").trim();

        // Basic validation
        const maxBytes = 100 * 1024 * 1024; // 100MB dev guard (ajuste)
        if (file.size <= 0) return json({ error: "Empty file" }, { status: 400, headers: cors });
        if (file.size > maxBytes) return json({ error: "File too large", maxBytes }, { status: 413, headers: cors });

        const ext =
          (file.name.split(".").pop() || "mp4")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "mp4";

        const videoId = crypto.randomUUID();
        const r2Key = `videos/${userId}/${videoId}.${ext}`;

        // Upload to R2
        await env.VIDEOS_BUCKET.put(r2Key, await file.arrayBuffer(), {
          httpMetadata: {
            contentType: file.type || guessContentType(file.name),
          },
          customMetadata: {
            user_id: userId,
            original_name: file.name,
            upload_type: uploadType,
          },
        });

        // Save metadata to Supabase (table: videos)
        // Ajuste os nomes das colunas conforme sua tabela.
        const row = {
          user_id: userId,
          title: title || null,
          description: description || null,
          // IMPORTANT: salvar SOMENTE a key do R2 (não URL)
          url: r2Key,
          provider: "cloudflare_r2",
          video_status: "uploaded",
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          created_at: new Date().toISOString(),
        };

        const inserted = await saveVideoMetadataToSupabase(env, row);

        // Return playback URL (via worker)
        const playbackUrl = `${url.origin}/video/${r2Key}`;

        return json(
          {
            ok: true,
            r2Key,
            playbackUrl,
            inserted,
          },
          { status: 200, headers: cors }
        );
      } catch (e: any) {
        return json(
          { error: "Internal server error", message: String(e?.message || e) },
          { status: 500, headers: cors }
        );
      }
    }

    return json({ error: "Not found" }, { status: 404, headers: cors });
  },
};
