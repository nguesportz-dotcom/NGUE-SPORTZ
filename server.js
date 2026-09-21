const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, "data.json");

app.use(express.json());

const read = () => JSON.parse(fs.readFileSync(DATA, "utf8"));
const write = (data) =>
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));

function auth(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="NGU ESPORTZ Admin"');
    return res.status(401).send("Admin login required");
  }

  const decoded = Buffer.from(header.slice(6), "base64").toString();
  const split = decoded.indexOf(":");

  const username = split >= 0 ? decoded.slice(0, split) : "";
  const password = split >= 0 ? decoded.slice(split + 1) : "";

  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASS || "ngu123";

  if (username !== adminUser || password !== adminPass) {
    res.set("WWW-Authenticate", 'Basic realm="NGU ESPORTZ Admin"');
    return res.status(401).send("Invalid admin credentials");
  }

  next();
}

// Public website
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Public static files except admin.html
app.use(express.static(__dirname, { index: false }));

// 🔐 Protect Admin page itself
app.get("/admin.html", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// Public settings
app.get("/api/settings", (req, res) => {
  res.json(read().settings);
});

// 🔐 Update settings
app.put("/api/settings", auth, (req, res) => {
  const data = read();

  data.settings = {
    ...data.settings,
    ...req.body
  };

  write(data);
  res.json(data.settings);
});

// Player registration
app.post("/api/register", (req, res) => {
  const data = read();

  if (data.registrations.length >= Number(data.settings.slots)) {
    return res.status(400).json({
      error: "All slots are full"
    });
  }

  const id =
    "NGU-" + Date.now().toString(36).toUpperCase();

  data.registrations.push({
    ...req.body,
    id,
    createdAt: new Date().toISOString(),
    status: "pending"
  });

  write(data);

  res.json({
    ok: true,
    id
  });
});

// 🔐 Admin registrations
app.get("/api/registrations", auth, (req, res) => {
  res.json(read().registrations);
});

// 🔐 CSV export
app.get("/api/registrations.csv", auth, (req, res) => {
  const registrations = read().registrations;

  const headers = [
    "id",
    "name",
    "type",
    "whatsapp",
    "entryFee",
    "createdAt"
  ];

  const rows = [headers.join(",")];

  registrations.forEach((item) => {
    const line = headers
      .map(
        (key) =>
          `"${String(item[key] ?? "").replace(/"/g, '""')}"`
      )
      .join(",");

    const players = (item.players || [])
      .map(
        (p) => `${p.name || ""} (${p.uid || ""})`
      )
      .join(" | ");

    rows.push(
      line + `,"${players.replace(/"/g, '""')}"`
    );
  });

  rows[0] += ',"players"';

  res
    .set("Content-Type", "text/csv")
    .set(
      "Content-Disposition",
      'attachment; filename="ngu-registrations.csv"'
    )
    .send(rows.join("\n"));
});

app.listen(PORT, () => {
  console.log(
    "NGU ESPORTZ running on port " + PORT
  );
});
