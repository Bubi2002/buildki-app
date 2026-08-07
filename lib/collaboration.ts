/**
 * BuildKI – Team-Collaboration Foundation
 * ----------------------------------------
 * Client-seitiges Fundament fuer echte Mehrbenutzer-Zusammenarbeit
 * (Teams, geteilte Projekte, Einladungen mit Token/Link).
 *
 * WICHTIG: Dieses Modul macht die App "collaboration-ready", aktiviert die
 * Zusammenarbeit aber noch NICHT. Alles, was einen Server braucht, ist mit
 * `SERVER-TODO` markiert und an genau einer Stelle gebuendelt (RemoteBackend).
 * Solange kein Server angebunden ist, laeuft alles lokal (LocalBackend) und
 * echte, geraeteuebergreifende Freigaben passieren nicht.
 *
 * Anbinden spaeter: RemoteBackend implementieren (tRPC/HTTP gegen dein Backend)
 * und in `collaboration` statt LocalBackend verwenden. Der Rest der App bleibt
 * unveraendert, weil er nur gegen das `CollaborationBackend`-Interface arbeitet.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

// ─── Datenmodell ──────────────────────────────────────────────────────────────

export type TeamRole = "owner" | "admin" | "member" | "viewer";
export type SharePermission = "read" | "write";
export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export interface TeamMember {
  userId: string;          // stabile ID (spaeter: Server-User-ID)
  name: string;
  email?: string;
  phone?: string;
  role: TeamRole;
  joinedAt: string;        // ISO
  invitedBy?: string;      // userId
}

export interface TeamInvite {
  token: string;           // opaker Token, steckt im Einladungs-Link
  teamId: string;
  email?: string;
  role: TeamRole;
  createdAt: string;       // ISO
  expiresAt: string;       // ISO
  acceptedAt?: string;
  status: InviteStatus;
}

export interface ProjectShare {
  projectId: string;
  teamId: string;
  permission: SharePermission;
  sharedAt: string;        // ISO
}

export interface Team {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;       // ISO
  members: TeamMember[];
  shares: ProjectShare[];
}

// ─── Links & Token ────────────────────────────────────────────────────────────

/**
 * Universal-Link-Ziel. Damit dieser Link die App oeffnet, braucht deine Domain
 * spaeter eine apple-app-site-association-Datei (Associated Domains). Bis dahin
 * dient er als Web-Fallback ("App laden + Team beitreten").
 */
export const INVITE_LINK_BASE = "https://buildki.app/join";

/** Custom-Scheme-Deeplink (aus app.config scheme) als Geraete-Fallback. */
export const INVITE_DEEPLINK = "manus20250614001800://join";

/** Baut den Einladungs-Link, der in E-Mail/SMS verschickt wird. */
export function buildInviteLink(token: string): string {
  return `${INVITE_LINK_BASE}?token=${encodeURIComponent(token)}`;
}

/** Extrahiert den Token aus einem geoeffneten Einladungs-Link (Deep-Link-Handler). */
export function parseInviteToken(url: string): string | null {
  try {
    const match = url.match(/[?&]token=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

async function generateToken(): Promise<string> {
  // 32 zufaellige Hex-Zeichen – kryptografisch ueber expo-crypto.
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Backend-Interface (die eine Naht zum Server) ─────────────────────────────

export interface CreateInviteInput {
  teamId: string;
  email?: string;
  role: TeamRole;
  invitedBy: string;
}

export interface CollaborationBackend {
  createInvite(input: CreateInviteInput): Promise<TeamInvite>;
  acceptInvite(token: string, user: { userId: string; name: string; email?: string }): Promise<{ teamId: string; role: TeamRole } | null>;
  listMembers(teamId: string): Promise<TeamMember[]>;
  removeMember(teamId: string, userId: string): Promise<void>;
  shareProject(projectId: string, teamId: string, permission: SharePermission): Promise<void>;
  /** Zieht geteilte Projekt-Daten (Maengel, Protokolle …) vom Server. */
  pullSharedData(teamId: string): Promise<void>;
}

// ─── Lokales Backend (heute aktiv, ohne Server) ───────────────────────────────

const TEAMS_KEY = "collab_teams";
const INVITES_KEY = "collab_invites";
const INVITE_TTL_DAYS = 14;

async function loadInvites(): Promise<TeamInvite[]> {
  try { return JSON.parse((await AsyncStorage.getItem(INVITES_KEY)) || "[]"); } catch { return []; }
}
async function saveInvites(list: TeamInvite[]): Promise<void> {
  await AsyncStorage.setItem(INVITES_KEY, JSON.stringify(list));
}

export async function loadTeams(): Promise<Team[]> {
  try { return JSON.parse((await AsyncStorage.getItem(TEAMS_KEY)) || "[]"); } catch { return []; }
}
export async function saveTeams(list: Team[]): Promise<void> {
  await AsyncStorage.setItem(TEAMS_KEY, JSON.stringify(list));
}

/**
 * Lokales Backend: erzeugt echte Tokens/Links und haelt Teams/Einladungen lokal.
 * Die geraeteuebergreifenden Teile (acceptInvite fremder Nutzer, pullSharedData)
 * sind bewusst No-Op/lokal – hier haengt spaeter der Server dran.
 */
export const LocalBackend: CollaborationBackend = {
  async createInvite(input) {
    const now = Date.now();
    const invite: TeamInvite = {
      token: await generateToken(),
      teamId: input.teamId,
      email: input.email,
      role: input.role,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + INVITE_TTL_DAYS * 86400_000).toISOString(),
      status: "pending",
    };
    const invites = await loadInvites();
    invites.push(invite);
    await saveInvites(invites);
    // SERVER-TODO: Einladung serverseitig anlegen, damit der Token auf FREMDEN
    // Geraeten eingeloest werden kann. Ohne Server ist der Token nur hier bekannt.
    return invite;
  },

  async acceptInvite(token, user) {
    const invites = await loadInvites();
    const invite = invites.find((i) => i.token === token);
    // SERVER-TODO: Token beim Server einloesen (der Ersteller ist i.d.R. ein
    // anderes Geraet). Lokal kann nur ein hier bekannter Token angenommen werden.
    if (!invite || invite.status !== "pending") return null;
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      invite.status = "expired";
      await saveInvites(invites);
      return null;
    }
    invite.status = "accepted";
    invite.acceptedAt = new Date().toISOString();
    await saveInvites(invites);

    const teams = await loadTeams();
    const team = teams.find((tm) => tm.id === invite.teamId);
    if (team && !team.members.some((m) => m.userId === user.userId)) {
      team.members.push({
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: invite.role,
        joinedAt: new Date().toISOString(),
      });
      await saveTeams(teams);
    }
    return { teamId: invite.teamId, role: invite.role };
  },

  async listMembers(teamId) {
    const teams = await loadTeams();
    return teams.find((tm) => tm.id === teamId)?.members ?? [];
  },

  async removeMember(teamId, userId) {
    const teams = await loadTeams();
    const team = teams.find((tm) => tm.id === teamId);
    if (team) {
      team.members = team.members.filter((m) => m.userId !== userId);
      await saveTeams(teams);
    }
    // SERVER-TODO: Mitgliedschaft serverseitig entziehen (Zugriff sperren).
  },

  async shareProject(projectId, teamId, permission) {
    const teams = await loadTeams();
    const team = teams.find((tm) => tm.id === teamId);
    if (team) {
      team.shares = (team.shares || []).filter((s) => s.projectId !== projectId);
      team.shares.push({ projectId, teamId, permission, sharedAt: new Date().toISOString() });
      await saveTeams(teams);
    }
    // SERVER-TODO: Projekt serverseitig fuer das Team freigeben, damit andere
    // Mitglieder die Daten (Maengel/Protokolle) tatsaechlich sehen.
  },

  async pullSharedData(_teamId) {
    // SERVER-TODO: geteilte Projekt-Daten vom Server ziehen und lokal mergen.
    // Ohne Server gibt es keine fremden Daten zum Ziehen -> No-Op.
    return;
  },
};

// ─── RemoteBackend (spaeter: hier den Server anbinden) ────────────────────────
//
// export const RemoteBackend: CollaborationBackend = {
//   createInvite: (i)   => trpc.team.createInvite.mutate(i),
//   acceptInvite: (t,u) => trpc.team.acceptInvite.mutate({ token: t, ...u }),
//   listMembers:  (id)  => trpc.team.listMembers.query({ teamId: id }),
//   removeMember: (id,u)=> trpc.team.removeMember.mutate({ teamId: id, userId: u }),
//   shareProject: (p,tm,perm) => trpc.team.shareProject.mutate({ projectId: p, teamId: tm, permission: perm }),
//   pullSharedData: (id) => trpc.team.pullSharedData.query({ teamId: id }).then(mergeIntoLocalStores),
// };

/**
 * Zentrale Instanz, die der Rest der App benutzt. Zum Aktivieren der echten
 * Zusammenarbeit spaeter einfach LocalBackend durch RemoteBackend ersetzen –
 * kein weiterer Code in den Screens muss geaendert werden.
 */
export const collaboration: CollaborationBackend = LocalBackend;
