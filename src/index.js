// src/index.js — API du gestionnaire de fichiers perso
// Cloudflare Worker + stockage Tigris (compatible S3)
//
// Secrets attendus : TIGRIS_ACCESS_KEY_ID, TIGRIS_SECRET_ACCESS_KEY,
//                    BUCKET_NAME, JWT_SECRET, APP_PASSWORD
// Variables (wrangler.jsonc, non secrètes) : STORAGE_LIMIT_BYTES, ALERT_BYTES,
//                    ALLOWED_ORIGIN (optionnel), S3_ENDPOINT (optionnel)

import { AwsClient } from "aws4fetch";

const ENC = new TextEncoder();
const SIGNED_URL_TTL = 300; // durée de vie des liens signés : 5 min
const SESSION_TTL = 60 * 60 * 12; // durée d'une session : 12 h
const MAX_KEY_LENGTH = 512;

// ---------- réponses & CORS ----------

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// ---------- crypto : session JWT (HS256) ----------

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromB64url = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0)
  );

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    ENC.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, ENC.encode(data)));
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Comparaison à temps constant (on compare les empreintes HMAC, de même longueur)
async function safeEqual(secret, a, b) {
  return sameBytes(await hmac(secret, a), await hmac(secret, b));
}

async function signToken(env) {
  const header = b64url(ENC.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(
    ENC.encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_TTL }))
  );
  const sig = b64url(await hmac(env.JWT_SECRET, `${header}.${payload}`));
  return `${header}.${payload}.${sig}`;
}

async function verifyToken(env, token) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) return false;
  try {
    const expected = await hmac(env.JWT_SECRET, `${parts[0]}.${parts[1]}`);
    if (!sameBytes(expected, fromB64url(parts[2]))) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
    return payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

// ---------- stockage S3 (Tigris) ----------

const s3 = (env) =>
  new AwsClient({
    accessKeyId: env.TIGRIS_ACCESS_KEY_ID,
    secretAccessKey: env.TIGRIS_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });

const endpointHost = (env) => new URL(env.S3_ENDPOINT || "https://t3.storage.dev").host;
const bucketUrl = (env) => `https://${env.BUCKET_NAME}.${endpointHost(env)}`;

function objectUrl(env, key) {
  return `${bucketUrl(env)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function validKey(key) {
  return (
    typeof key === "string" &&
    key.length > 0 &&
    key.length <= MAX_KEY_LENGTH &&
    !key.startsWith("/") &&
    !key.split("/").some((seg) => seg === ".." || seg === ".") &&
    !/[\u0000-\u001f]/.test(key)
  );
}

// Lien signé temporaire : le navigateur parle directement à Tigris
async function presign(env, method, key, extraParams = {}) {
  const url = new URL(objectUrl(env, key));
  url.searchParams.set("X-Amz-Expires", String(SIGNED_URL_TTL));
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
  const signed = await s3(env).sign(new Request(url.toString(), { method }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1]) : "";
};

function parseList(xml) {
  const files = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => ({
    key: tag(m[1], "Key"),
    size: Number(tag(m[1], "Size")),
    lastModified: tag(m[1], "LastModified"),
  }));
  const folders = [...xml.matchAll(/<CommonPrefixes>\s*<Prefix>([\s\S]*?)<\/Prefix>/g)].map(
    (m) => decodeXml(m[1])
  );
  return {
    files,
    folders,
    next: /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? tag(xml, "NextContinuationToken")
      : null,
  };
}

async function listObjects(env, { prefix = "", delimiter = "", token = "" } = {}) {
  const url = new URL(`${bucketUrl(env)}/`);
  url.searchParams.set("list-type", "2");
  if (prefix) url.searchParams.set("prefix", prefix);
  if (delimiter) url.searchParams.set("delimiter", delimiter);
  if (token) url.searchParams.set("continuation-token", token);
  const res = await s3(env).fetch(url.toString());
  if (!res.ok) throw new Error(`Liste impossible (${res.status})`);
  return parseList(await res.text());
}

async function usage(env) {
  let used = 0;
  let count = 0;
  let token = "";
  let pages = 0;
  do {
    const page = await listObjects(env, { token });
    for (const f of page.files) {
      used += f.size;
      count++;
    }
    token = page.next || "";
  } while (token && ++pages < 100);

  const limit = Number(env.STORAGE_LIMIT_BYTES || 5e9);
  const alertAt = Number(env.ALERT_BYTES || 4e9);
  return {
    used,
    count,
    limit,
    alertAt,
    alert: used >= alertAt,
    percent: Math.round((used / limit) * 1000) / 10,
  };
}

// ---------- routes ----------

async function login(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  const ok =
    typeof body.password === "string" &&
    (await safeEqual(env.JWT_SECRET, body.password, env.APP_PASSWORD));
  if (!ok) {
    // Ralentit les tentatives. Un vrai blocage viendra avec une règle de limitation Cloudflare.
    await new Promise((r) => setTimeout(r, 1000));
    return json({ error: "Mot de passe incorrect" }, 401);
  }
  return json({ token: await signToken(env), expiresIn: SESSION_TTL });
}

async function route(request, env) {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  const required = [
    "TIGRIS_ACCESS_KEY_ID",
    "TIGRIS_SECRET_ACCESS_KEY",
    "BUCKET_NAME",
    "JWT_SECRET",
    "APP_PASSWORD",
  ];
  if (required.some((name) => !env[name])) {
    return json({ error: "Configuration incomplète (secrets manquants)" }, 500);
  }

  if (pathname === "/api/login" && method === "POST") return login(request, env);
  if (!pathname.startsWith("/api/")) return json({ error: "Introuvable" }, 404);

  const auth = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!(await verifyToken(env, auth))) return json({ error: "Non autorisé" }, 401);

  // Liste d'un dossier
  if (pathname === "/api/files" && method === "GET") {
    const prefix = searchParams.get("prefix") || "";
    if (prefix && !(validKey(prefix) && prefix.endsWith("/"))) {
      return json({ error: "Dossier invalide" }, 400);
    }
    const folders = [];
    const files = [];
    let token = "";
    do {
      const page = await listObjects(env, { prefix, delimiter: "/", token });
      folders.push(...page.folders);
      files.push(...page.files);
      token = page.next || "";
    } while (token);
    return json({
      prefix,
      folders: folders.map((p) => ({ prefix: p, name: p.slice(prefix.length, -1) })),
      files: files
        .map((f) => ({ ...f, name: f.key.slice(prefix.length) }))
        .filter((f) => f.name && f.name !== ".keep"),
    });
  }

  // Suppression d'un fichier
  if (pathname === "/api/files" && method === "DELETE") {
    const key = searchParams.get("key");
    if (!validKey(key)) return json({ error: "Clé invalide" }, 400);
    const res = await s3(env).fetch(objectUrl(env, key), { method: "DELETE" });
    if (!res.ok) return json({ error: "Suppression impossible" }, 502);
    return json({ deleted: key });
  }

  // Création d'un dossier (un fichier vide .keep matérialise le dossier)
  if (pathname === "/api/folders" && method === "POST") {
    const { prefix } = await request.json().catch(() => ({}));
    if (!(validKey(prefix) && prefix.endsWith("/"))) {
      return json({ error: "Nom de dossier invalide" }, 400);
    }
    const res = await s3(env).fetch(objectUrl(env, `${prefix}.keep`), {
      method: "PUT",
      body: "",
    });
    if (!res.ok) return json({ error: "Création impossible" }, 502);
    return json({ created: prefix });
  }

  // Lien d'envoi (upload) — refuse si le quota serait dépassé
  if (pathname === "/api/upload-url" && method === "POST") {
    const { key, size } = await request.json().catch(() => ({}));
    if (!validKey(key) || key.endsWith("/")) return json({ error: "Clé invalide" }, 400);
    const u = await usage(env);
    if (u.used + (Number(size) || 0) > u.limit) {
      return json({ error: "Stockage plein : quota dépassé", usage: u }, 413);
    }
    return json({
      url: await presign(env, "PUT", key),
      method: "PUT",
      expiresIn: SIGNED_URL_TTL,
      usage: u,
    });
  }

  // Lien de téléchargement (ou d'aperçu si inline = true)
  if (pathname === "/api/download-url" && method === "POST") {
    const { key, inline } = await request.json().catch(() => ({}));
    if (!validKey(key)) return json({ error: "Clé invalide" }, 400);
    const name = key.split("/").pop();
    const disposition = inline
      ? "inline"
      : `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
    return json({
      url: await presign(env, "GET", key, { "response-content-disposition": disposition }),
      expiresIn: SIGNED_URL_TTL,
    });
  }

  // Jauge de stockage + alerte
  if (pathname === "/api/usage" && method === "GET") return json(await usage(env));

  return json({ error: "Introuvable" }, 404);
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      console.error(err);
      return json({ error: "Erreur serveur" }, 500, cors);
    }
  },
};