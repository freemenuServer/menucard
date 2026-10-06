const SUPABASE_URL = "https://pfsrpowopbrevocwsuii.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_r3K8YKzV0ZHQxvXfkNimkw_e5E8EPmE";

const RESERVED = new Set([
  "about", "admin", "contact-us", "disclaimer", "drive", "engine", "index",
  "menu", "menugrowth", "owner", "plans", "privacy-policy", "qr",
  "signaturemenu", "terms-and-conditions", "sitemap", "robots", "favicon"
]);

const PLAN_SLUGS = {
  free: "free-starter",
  starter: "free-starter",
  "free-starter": "free-starter",
  growth: "growth-photos",
  premium: "growth-photos",
  "growth-photos": "growth-photos",
  signature: "signature-3d",
  "signature-3d": "signature-3d",
  signature_3d: "signature-3d",
  "full-3d": "full-3d-experience",
  "full_3d": "full-3d-experience",
  "full-3d-experience": "full-3d-experience"
};

function supabaseHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: "application/json"
  };
}

async function supabaseGet(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: supabaseHeaders()
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status}`);
  return response.json();
}

function resolveTemplate(rest, plan) {
  if (!plan) return "menu.html";

  const key = `${plan.slug || ""} ${plan.name || ""}`.toLowerCase().trim();

  const isSignature3D =
    key.includes("signature 3d") ||
    key.includes("signature-3d") ||
    key.includes("signature_3d") ||
    (key.includes("signature") && key.includes("3d"));

  const isFull3D =
    key.includes("full 3d") ||
    key.includes("full-3d") ||
    key.includes("full_3d") ||
    (key.includes("full") && key.includes("3d"));

  if (isSignature3D || isFull3D || rest.custom_plan_enabled === true) {
    return "signaturemenu.html";
  }

  const isGrowth =
    key.includes("growth") ||
    key.includes("growth-photos") ||
    key.includes("growth photos") ||
    key.includes("photo_menu_v1");

  return isGrowth ? "menugrowth.html" : "menu.html";
}

async function findRestaurant(slug) {
  const encoded = encodeURIComponent(slug);
  const rows = await supabaseGet(
    `restaurants?select=id,name,slug,plan_id,plan,custom_plan_enabled&slug=eq.${encoded}&limit=1`
  );
  if (rows[0]) return rows[0];

  // Backward compatibility for older restaurants that do not have a slug.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug)) {
    const idRows = await supabaseGet(
      `restaurants?select=id,name,slug,plan_id,plan,custom_plan_enabled&id=eq.${encoded}&limit=1`
    );
    return idRows[0] || null;
  }

  return null;
}

async function findPlan(rest) {
  if (rest.plan_id) {
    const id = encodeURIComponent(String(rest.plan_id));
    const rows = await supabaseGet(
      `plans?select=id,name,slug,is_active&id=eq.${id}&limit=1`
    );
    if (rows[0] && rows[0].is_active !== false) return rows[0];
  }

  const legacySlug = PLAN_SLUGS[String(rest.plan || "").trim().toLowerCase()];
  if (legacySlug) {
    const encoded = encodeURIComponent(legacySlug);
    const rows = await supabaseGet(
      `plans?select=id,name,slug,is_active&slug=eq.${encoded}&limit=1`
    );
    if (rows[0] && rows[0].is_active !== false) return rows[0];
  }

  return null;
}

export async function onRequest(context) {
  const slug = String(context.params?.slug || "").trim().toLowerCase();

  // Let normal static assets/pages continue through the Pages asset handler.
  if (!slug || slug.includes(".") || RESERVED.has(slug)) {
    return context.next();
  }

  try {
    const rest = await findRestaurant(slug);

    if (!rest) {
      return new Response("Restaurant not found", { status: 404 });
    }

    const plan = await findPlan(rest);
    const template = resolveTemplate(rest, plan);
    const publicSlug = String(rest.slug || slug).trim();

    // INTERNAL REWRITE ONLY: the browser stays on /<slug>.
    const target = new URL(context.request.url);
    target.pathname = `/${template}`;
    target.search = `?r=${encodeURIComponent(publicSlug)}`;

    return context.env.ASSETS.fetch(new Request(target.toString(), context.request));
  } catch (error) {
    console.error("FreeMenu clean URL routing error", error);
    return new Response("Unable to open this menu", { status: 502 });
  }
}
