export interface Env {
  VIDEOS_BUCKET: R2Bucket;

  // Secrets (configure via wrangler secret put)
  SUPABASE_URL: string; // ex: https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY: string; // service_role (recomendado no Worker)

  // Vars (wrangler.toml)
  CORS_ORIGIN?: string;
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
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
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

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: cors });
    }

    // Health
    if (request.method === "GET" && (pathname === "/" || pathname === "/health")) {
      return json(
        {
          ok: true,
          routes: ["POST /upload-video", "GET /video/<r2_key>"],
        },
        { status: 200, headers: cors }
      );
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
        headers.set("Cache-Control", "public, max-age=3600");

        if (parsedRange) {
          let start: number;
          let end: number;

          if ("suffix" in parsedRange) {
            const suffix = Math.min(parsedRange.suffix, obj.size);
            start = obj.size - suffix;
            end = obj.size - 1;
          } else {
            start = parsedRange.offset;
            end = "length" in parsedRange ? parsedRange.offset + parsedRange.length - 1 : obj.size - 1;
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

    // ---- Upload: POST /upload-video ----
    if (request.method === "POST" && pathname === "/upload-video") {
      try {
        requireEnv(env);

        const contentType = request.headers.get("Content-Type") || "";
        if (!contentType.toLowerCase().includes("multipart/form-data")) {
          return json({ error: "Expected multipart/form-data" }, { status: 400, headers: cors });
        }

        const form = await request.formData();

        // Required fields (aceita variações para evitar mismatch entre versões do frontend/README)
        const file = form.get("file") ?? form.get("video") ?? form.get("videoFile");
        const userId = String(form.get("user_id") ?? form.get("userId") ?? "").trim();

        if (!userId) return json({ error: "Missing user_id" }, { status: 400, headers: cors });
        if (!(file instanceof File)) return json({ error: "Missing file" }, { status: 400, headers: cors });

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
