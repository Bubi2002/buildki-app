/**
 * Dropbox OAuth Server Routes
 * 
 * Handles the OAuth2 PKCE flow for Dropbox:
 * 1. Client initiates auth → server returns Dropbox authorize URL
 * 2. User authorizes in browser → redirected back with code
 * 3. Server exchanges code for access_token + refresh_token
 * 4. Tokens stored client-side (SecureStore) for direct API calls
 * 
 * Dropbox API v2 endpoints used:
 * - /oauth2/authorize (PKCE)
 * - /oauth2/token (exchange + refresh)
 * - /2/files/upload
 * - /2/files/create_folder_v2
 * - /2/users/get_current_account
 */
import type { Express, Request, Response } from "express";

// Dropbox App credentials - stored as env vars
const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY || "";
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET || "";

// Deployed domain for redirect
const DEPLOYED_DOMAIN = process.env.DEPLOYED_DOMAIN || "https://protokollapp-c7amcxpp.manus.space";

export function registerDropboxRoutes(app: Express) {
  /**
   * GET /api/dropbox/auth-url
   * Returns the Dropbox OAuth2 authorize URL for the client to open
   */
  app.get("/api/dropbox/auth-url", (req: Request, res: Response) => {
    if (!DROPBOX_APP_KEY) {
      return res.status(500).json({ error: "Dropbox App Key nicht konfiguriert" });
    }

    const redirectUri = `${DEPLOYED_DOMAIN}/api/dropbox/callback`;
    const state = req.query.state as string || Math.random().toString(36).substring(7);

    const params = new URLSearchParams({
      client_id: DROPBOX_APP_KEY,
      response_type: "code",
      redirect_uri: redirectUri,
      state,
      token_access_type: "offline", // Get refresh token
    });

    const authorizeUrl = `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
    res.json({ authorizeUrl, state });
  });

  /**
   * GET /api/dropbox/callback
   * Handles the OAuth2 callback from Dropbox after user authorization.
   * Exchanges the code for tokens and redirects back to the app.
   */
  app.get("/api/dropbox/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    if (error) {
      // Redirect back to app with error
      return res.redirect(`/dropbox-settings?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return res.redirect("/dropbox-settings?error=no_code");
    }

    try {
      const redirectUri = `${DEPLOYED_DOMAIN}/api/dropbox/callback`;
      const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          client_id: DROPBOX_APP_KEY,
          client_secret: DROPBOX_APP_SECRET,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const errBody = await tokenResponse.text();
        console.error("[Dropbox OAuth] Token exchange failed:", errBody);
        return res.redirect(`/dropbox-settings?error=token_exchange_failed`);
      }

      const tokens = await tokenResponse.json();
      // tokens: { access_token, token_type, expires_in, refresh_token, scope, uid, account_id }

      // Redirect back to app with tokens encoded in URL (for native deep link)
      // The client will store these securely
      const params = new URLSearchParams({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || "",
        expires_in: String(tokens.expires_in || 14400),
        account_id: tokens.account_id || "",
        uid: tokens.uid || "",
        state: state || "",
      });

      // For web: redirect to settings page with tokens
      res.redirect(`/dropbox-settings?dropbox_connected=true&${params.toString()}`);
    } catch (err: any) {
      console.error("[Dropbox OAuth] Callback error:", err);
      res.redirect(`/dropbox-settings?error=server_error`);
    }
  });

  /**
   * POST /api/dropbox/exchange
   * Mobile-friendly token exchange endpoint.
   * Native app sends the code, server returns tokens as JSON.
   */
  app.post("/api/dropbox/exchange", async (req: Request, res: Response) => {
    const { code, codeVerifier } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Code fehlt" });
    }

    if (!DROPBOX_APP_KEY) {
      return res.status(500).json({ error: "Dropbox nicht konfiguriert" });
    }

    try {
      const redirectUri = `${DEPLOYED_DOMAIN}/api/dropbox/callback`;
      const body: Record<string, string> = {
        code,
        grant_type: "authorization_code",
        client_id: DROPBOX_APP_KEY,
        redirect_uri: redirectUri,
      };

      // If using PKCE (no app secret), use code_verifier
      if (codeVerifier) {
        body.code_verifier = codeVerifier;
      } else if (DROPBOX_APP_SECRET) {
        body.client_secret = DROPBOX_APP_SECRET;
      }

      const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
      });

      if (!tokenResponse.ok) {
        const errBody = await tokenResponse.text();
        console.error("[Dropbox OAuth] Exchange failed:", errBody);
        return res.status(400).json({ error: "Token-Austausch fehlgeschlagen" });
      }

      const tokens = await tokenResponse.json();
      res.json({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresIn: tokens.expires_in || 14400,
        accountId: tokens.account_id || null,
        uid: tokens.uid || null,
      });
    } catch (err: any) {
      console.error("[Dropbox OAuth] Exchange error:", err);
      res.status(500).json({ error: "Server-Fehler beim Token-Austausch" });
    }
  });

  /**
   * POST /api/dropbox/refresh
   * Refresh an expired access token using the refresh token.
   */
  app.post("/api/dropbox/refresh", async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh Token fehlt" });
    }

    if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
      return res.status(500).json({ error: "Dropbox nicht konfiguriert" });
    }

    try {
      const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: DROPBOX_APP_KEY,
          client_secret: DROPBOX_APP_SECRET,
        }),
      });

      if (!tokenResponse.ok) {
        const errBody = await tokenResponse.text();
        console.error("[Dropbox OAuth] Refresh failed:", errBody);
        return res.status(401).json({ error: "Token-Erneuerung fehlgeschlagen" });
      }

      const tokens = await tokenResponse.json();
      res.json({
        accessToken: tokens.access_token,
        expiresIn: tokens.expires_in || 14400,
      });
    } catch (err: any) {
      console.error("[Dropbox OAuth] Refresh error:", err);
      res.status(500).json({ error: "Server-Fehler bei Token-Erneuerung" });
    }
  });

  /**
   * POST /api/dropbox/upload
   * Proxy upload to Dropbox (for files that are already on the server/accessible via URL).
   * Client sends base64 content + path, server uploads to Dropbox.
   */
  app.post("/api/dropbox/upload", async (req: Request, res: Response) => {
    const { accessToken, base64Content, path, mimeType } = req.body;

    if (!accessToken || !base64Content || !path) {
      return res.status(400).json({ error: "accessToken, base64Content und path sind erforderlich" });
    }

    try {
      const buffer = Buffer.from(base64Content, "base64");

      const uploadResponse = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path,
            mode: "add",
            autorename: true,
            mute: false,
          }),
        },
        body: buffer,
      });

      if (!uploadResponse.ok) {
        const errBody = await uploadResponse.text();
        console.error("[Dropbox Upload] Failed:", errBody);
        
        if (uploadResponse.status === 401) {
          return res.status(401).json({ error: "Token abgelaufen", needsRefresh: true });
        }
        return res.status(400).json({ error: "Upload fehlgeschlagen", details: errBody });
      }

      const result = await uploadResponse.json();
      res.json({
        success: true,
        path: result.path_display,
        size: result.size,
        id: result.id,
      });
    } catch (err: any) {
      console.error("[Dropbox Upload] Error:", err);
      res.status(500).json({ error: "Upload-Fehler" });
    }
  });

  /**
   * POST /api/dropbox/create-folder
   * Create a folder in Dropbox
   */
  app.post("/api/dropbox/create-folder", async (req: Request, res: Response) => {
    const { accessToken, path } = req.body;

    if (!accessToken || !path) {
      return res.status(400).json({ error: "accessToken und path sind erforderlich" });
    }

    try {
      const response = await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path, autorename: false }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        // Folder might already exist - that's OK
        if (errBody.includes("path/conflict/folder")) {
          return res.json({ success: true, path, alreadyExists: true });
        }
        return res.status(400).json({ error: "Ordner-Erstellung fehlgeschlagen", details: errBody });
      }

      const result = await response.json();
      res.json({ success: true, path: result.metadata?.path_display || path });
    } catch  {
      res.status(500).json({ error: "Fehler bei Ordner-Erstellung" });
    }
  });

  /**
   * POST /api/dropbox/account-info
   * Get current Dropbox account info
   */
  app.post("/api/dropbox/account-info", async (req: Request, res: Response) => {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: "accessToken fehlt" });
    }

    try {
      const response = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: "null",
      });

      if (!response.ok) {
        if (response.status === 401) {
          return res.status(401).json({ error: "Token abgelaufen", needsRefresh: true });
        }
        return res.status(400).json({ error: "Kontoinformationen nicht abrufbar" });
      }

      const account = await response.json();
      res.json({
        name: account.name?.display_name || "",
        email: account.email || "",
        accountId: account.account_id || "",
      });
    } catch  {
      res.status(500).json({ error: "Fehler beim Abrufen der Kontoinformationen" });
    }
  });
}
