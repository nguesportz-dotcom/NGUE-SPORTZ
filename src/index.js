const DEFAULT_SETTINGS = {
  title: "NGU DROPZONE",
  subtitle: "Compete. Dominate. Claim the prize.",
  type: "Squad",
  slots: 12,
  entryFee: 80,
  whatsappLink: "",
  rules: [
    "No hackers",
    "No PC players",
    "Admins decision is final"
  ],
  prizes: [
    { label: "1st Prize", amount: 500 },
    { label: "2nd Prize", amount: 300 },
    { label: "3rd Prize", amount: 100 }
  ]
};

async function initDB(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    )
  `).run();

  const row = await env.DB
    .prepare("SELECT id FROM settings WHERE id = 1")
    .first();

  if (!row) {
    await env.DB
      .prepare("INSERT INTO settings (id, data) VALUES (1, ?)")
      .bind(JSON.stringify(DEFAULT_SETTINGS))
      .run();
  }
}

function unauthorized() {
  return new Response("Admin login required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="NGU ESPORTZ Admin"'
    }
  });
}

function isAdmin(request, env) {
  const header = request.headers.get("Authorization") || "";

  if (!header.startsWith("Basic ")) return false;

  try {
    const decoded = atob(header.slice(6));
    const split = decoded.indexOf(":");

    const username = split >= 0 ? decoded.slice(0, split) : "";
    const password = split >= 0 ? decoded.slice(split + 1) : "";

    const adminUser = env.ADMIN_USER || "admin";
    const adminPass = env.ADMIN_PASS || "ngu123";

    return username === adminUser && password === adminPass;
  } catch {
    return false;
  }
}

async function getSettings(env) {
  const row = await env.DB
    .prepare("SELECT data FROM settings WHERE id = 1")
    .first();

  return row ? JSON.parse(row.data) : DEFAULT_SETTINGS;
}

async function getRegistrations(env) {
  const result = await env.DB
    .prepare("SELECT data FROM registrations ORDER BY created_at DESC")
    .all();

  return result.results.map(row => JSON.parse(row.data));
}

async function handleAPI(request, env, pathname) {
  await initDB(env);

  if (pathname === "/api/settings" && request.method === "GET") {
    return Response.json(await getSettings(env));
  }

  if (pathname === "/api/settings" && request.method === "PUT") {
    if (!isAdmin(request, env)) return unauthorized();

    const current = await getSettings(env);
    const body = await request.json();

    const updated = {
      ...current,
      ...body
    };

    await env.DB
      .prepare("UPDATE settings SET data = ? WHERE id = 1")
      .bind(JSON.stringify(updated))
      .run();

    return Response.json(updated);
  }

  if (pathname === "/api/register" && request.method === "POST") {
    const settings = await getSettings(env);

    const countRow = await env.DB
      .prepare("SELECT COUNT(*) AS count FROM registrations")
      .first();

    const count = Number(countRow?.count || 0);

    if (count >= Number(settings.slots)) {
      return Response.json(
        { error: "All slots are full" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const id =
      "NGU-" +
      Date.now().toString(36).toUpperCase();

    const createdAt = new Date().toISOString();

    const registration = {
      ...body,
      id,
      createdAt,
      status: "pending"
    };

    await env.DB
      .prepare(`
        INSERT INTO registrations
        (id, data, created_at, status)
        VALUES (?, ?, ?, ?)
      `)
      .bind(
        id,
        JSON.stringify(registration),
        createdAt,
        "pending"
      )
      .run();

    return Response.json({
      ok: true,
      id
    });
  }

  if (pathname === "/api/registrations" && request.method === "GET") {
    if (!isAdmin(request, env)) return unauthorized();

    return Response.json(await getRegistrations(env));
  }

  if (
    pathname === "/api/registrations.csv" &&
    request.method === "GET"
  ) {
    if (!isAdmin(request, env)) return unauthorized();

    const registrations = await getRegistrations(env);

    const headers = [
      "id",
      "name",
      "type",
      "whatsapp",
      "entryFee",
      "createdAt"
    ];

    const rows = [headers.join(",")];

    for (const item of registrations) {
      const line = headers
        .map(key =>
          `"${String(item[key] ?? "")
            .replace(/"/g, '""')}"`
        )
        .join(",");

      const players = (item.players || [])
        .map(p => `${p.name || ""} ${p.uid || ""}`)
        .join(" | ");

      rows.push(
        line +
        `,"${players.replace(/"/g, '""')}"`
      );
    }

    rows[0] += ',"players"';

    return new Response(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="ngu-registrations.csv"'
      }
    });
  }

  return new Response("Not Found", { status: 404 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      try {
        return await handleAPI(request, env, pathname);
      } catch (error) {
        console.error(error);

        return Response.json(
          { error: "Server error" },
          { status: 500 }
        );
      }
    }

    if (pathname === "/admin.html") {
      if (!isAdmin(request, env)) {
        return unauthorized();
      }
    }

    const blocked = [
      "/data.json",
      "/server.js",
      "/package.json",
      "/wrangler.jsonc",
      "/src/index.js"
    ];

    if (blocked.includes(pathname)) {
      return new Response("Not Found", { status: 404 });
    }

    if (pathname === "/") {
      return env.ASSETS.fetch(
        new Request(new URL("/index.html", request.url))
      );
    }

    return env.ASSETS.fetch(request);
  }
};
