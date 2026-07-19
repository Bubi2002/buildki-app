import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerDropboxRoutes } from "../dropbox-oauth";
import { registerStripeRoutes } from "../stripe";
import { authEmailRouter } from "../auth-email";
import { appRouter } from "../routers";
import { createContext } from "./context";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerDropboxRoutes(app);
  registerStripeRoutes(app);
  app.use(authEmailRouter);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Privacy Policy page for App Store Connect
  app.get("/datenschutz", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Datenschutzerklärung – ProtoKI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: #1a1a1a; background: #fafafa; padding: 40px 20px; }
    .container { max-width: 720px; margin: 0 auto; background: #fff; padding: 48px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
    h1 { font-size: 28px; margin-bottom: 8px; color: #111; }
    h2 { font-size: 20px; margin-top: 32px; margin-bottom: 12px; color: #222; }
    p, li { font-size: 15px; margin-bottom: 12px; color: #333; }
    ul { padding-left: 24px; margin-bottom: 16px; }
    .meta { font-size: 13px; color: #666; margin-bottom: 32px; }
    .contact { background: #f5f7fa; padding: 20px; border-radius: 8px; margin-top: 24px; }
    .contact p { margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Datenschutzerklärung</h1>
    <p class="meta">ProtoKI – Baustellenprotokoll App | Stand: Juli 2026</p>

    <h2>1. Verantwortlicher</h2>
    <p>Jörg Iserloh<br>CI Concepts<br>Ringstr. 6, 76228 Karlsruhe<br>E-Mail: info@ciconcepts.net<br>Telefon: +49 172 327 6466</p>

    <h2>2. Welche Daten werden erhoben?</h2>
    <p>ProtoKI verarbeitet folgende Daten ausschließlich zur Erstellung von Baustellenprotokollen:</p>
    <ul>
      <li><strong>Audio-Aufnahmen:</strong> Sprachaufnahmen werden zur Transkription an unseren Server übermittelt und nach der Verarbeitung gelöscht.</li>
      <li><strong>Fotos:</strong> Aufgenommene oder aus der Galerie gewählte Bilder werden lokal auf Ihrem Gerät gespeichert und optional in PDF-Protokolle eingebettet.</li>
      <li><strong>Standortdaten:</strong> Nur bei Freigabe wird der Standort zur automatischen Adresszuordnung im Protokoll verwendet.</li>
      <li><strong>Kontaktdaten:</strong> Von Ihnen eingegebene Team-Kontakte (Name, E-Mail, Telefon) werden lokal gespeichert.</li>
    </ul>

    <h2>3. Lokale Datenspeicherung</h2>
    <p>Alle Protokolle, Projekte, Einstellungen und Kontakte werden primär lokal auf Ihrem Gerät gespeichert (AsyncStorage). Eine Übertragung an externe Server erfolgt nur für:</p>
    <ul>
      <li>Audio-Transkription (temporäre Verarbeitung)</li>
      <li>KI-gestützte Protokollerstellung (temporäre Verarbeitung)</li>
      <li>Optionales Cloud-Backup (nur bei Aktivierung durch den Nutzer)</li>
    </ul>

    <h2>4. Zweck der Verarbeitung</h2>
    <p>Die Datenverarbeitung dient ausschließlich der Erstellung, Verwaltung und dem Export von Baustellenprotokollen sowie der Aufgabenverwaltung im Bauwesen.</p>

    <h2>5. Datenweitergabe</h2>
    <p>Eine Weitergabe Ihrer Daten an Dritte erfolgt nicht, es sei denn:</p>
    <ul>
      <li>Sie teilen ein Protokoll aktiv per E-Mail, WhatsApp oder andere Kanäle</li>
      <li>Sie delegieren eine Aufgabe an eine Person (E-Mail-Versand bei Eingabe)</li>
    </ul>

    <h2>6. Ihre Rechte</h2>
    <p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung und Datenübertragbarkeit. Da alle Daten lokal gespeichert sind, können Sie diese jederzeit durch Löschen der App vollständig entfernen.</p>

    <h2>7. Löschung</h2>
    <p>Lokal gespeicherte Daten werden durch Deinstallation der App vollständig gelöscht. Temporär auf dem Server verarbeitete Audio-Daten werden nach der Transkription automatisch gelöscht.</p>

    <h2>8. Kontakt</h2>
    <div class="contact">
      <p><strong>Bei Fragen zum Datenschutz:</strong></p>
      <p>Jörg Iserloh</p>
      <p>E-Mail: info@ciconcepts.net</p>
      <p>Telefon: +49 172 327 6466</p>
    </div>
  </div>
</body>
</html>`);
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
