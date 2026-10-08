import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY")!;
const REVIEW_IP_SALT = Deno.env.get("REVIEW_IP_SALT")!;
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.includes(origin)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: cors(origin) });
  }

  if (req.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405, origin);
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ success: false, message: "Origin not allowed" }, 403, origin);

  try {
    const payload = await req.json();
    const nickname = String(payload.nickname || "").trim();
    const body = String(payload.body || "").trim();
    const rating = Number(payload.rating);
    const token = String(payload.turnstileToken || "");

    if (nickname.length < 2 || nickname.length > 32) return json({ success: false, message: "Ник должен содержать 2–32 символа." }, 400, origin);
    if (body.length < 10 || body.length > 1000) return json({ success: false, message: "Отзыв должен содержать 10–1000 символов." }, 400, origin);
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) return json({ success: false, message: "Некорректная оценка." }, 400, origin);
    if (!token) return json({ success: false, message: "Не пройдена проверка безопасности." }, 400, origin);

    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    const verifyBody = new URLSearchParams();
    verifyBody.set("secret", TURNSTILE_SECRET_KEY);
    verifyBody.set("response", token);
    if (ip !== "unknown") verifyBody.set("remoteip", ip);

    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: verifyBody
    });
    const verify = await verifyRes.json();
    if (!verify.success) return json({ success: false, message: "Проверка CAPTCHA не пройдена." }, 400, origin);

    const ipHash = await sha256(`${REVIEW_IP_SALT}:${ip}`);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent, error: recentError } = await admin
      .from("reviews")
      .select("id")
      .eq("ip_hash", ipHash)
      .gte("created_at", oneHourAgo)
      .limit(1);

    if (recentError) throw recentError;
    if (recent && recent.length > 0) return json({ success: false, message: "С этого подключения отзыв уже отправлялся недавно. Попробуйте позже." }, 429, origin);

    const { error } = await admin.from("reviews").insert({
      nickname,
      rating,
      body,
      published: true,
      owner_added: false,
      source_label: null,
      ip_hash: ipHash
    });
    if (error) throw error;

    return json({ success: true }, 200, origin);
  } catch (error) {
    console.error(error);
    return json({ success: false, message: "Не удалось отправить отзыв." }, 500, origin);
  }
});
