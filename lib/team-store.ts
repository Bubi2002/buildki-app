import AsyncStorage from "@react-native-async-storage/async-storage";

const TEAM_MEMBERS_KEY = "team-members";
const PROJECT_SHARES_KEY = "project-shares";
const COMMENTS_KEY = "comments";

export type TeamMember = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: "bauleiter" | "polier" | "handwerker" | "architekt" | "auftraggeber" | "sonstige";
  color: string;
  createdAt: string;
};

export type ProjectShare = {
  id: string;
  projectId: string;
  memberId: string;
  permissions: "lesen" | "bearbeiten" | "admin";
  sharedAt: string;
};

export type Comment = {
  id: string;
  targetType: "protocol" | "defect" | "task" | "diary";
  targetId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
};

export const TEAM_ROLES = [
  { key: "bauleiter", label: "Bauleiter" },
  { key: "polier", label: "Polier" },
  { key: "handwerker", label: "Handwerker" },
  { key: "architekt", label: "Architekt" },
  { key: "auftraggeber", label: "Auftraggeber" },
  { key: "sonstige", label: "Sonstige" },
] as const;

export const MEMBER_COLORS = [
  "#E53935", "#D81B60", "#8E24AA", "#5C6BC0",
  "#1E88E5", "#00ACC1", "#00897B", "#43A047",
  "#7CB342", "#FB8C00", "#6D4C41", "#546E7A",
];

// Team Members
export async function getTeamMembers(): Promise<TeamMember[]> {
  try {
    const raw = await AsyncStorage.getItem(TEAM_MEMBERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveTeamMember(member: TeamMember): Promise<void> {
  const members = await getTeamMembers();
  const idx = members.findIndex((m) => m.id === member.id);
  if (idx >= 0) members[idx] = member;
  else members.push(member);
  await AsyncStorage.setItem(TEAM_MEMBERS_KEY, JSON.stringify(members));
}

export async function deleteTeamMember(memberId: string): Promise<void> {
  const members = await getTeamMembers();
  const filtered = members.filter((m) => m.id !== memberId);
  await AsyncStorage.setItem(TEAM_MEMBERS_KEY, JSON.stringify(filtered));
  // Also remove shares
  const shares = await getProjectShares();
  const filteredShares = shares.filter((s) => s.memberId !== memberId);
  await AsyncStorage.setItem(PROJECT_SHARES_KEY, JSON.stringify(filteredShares));
}

// Project Shares
export async function getProjectShares(projectId?: string): Promise<ProjectShare[]> {
  try {
    const raw = await AsyncStorage.getItem(PROJECT_SHARES_KEY);
    const shares: ProjectShare[] = raw ? JSON.parse(raw) : [];
    if (projectId) return shares.filter((s) => s.projectId === projectId);
    return shares;
  } catch {
    return [];
  }
}

export async function shareProject(share: ProjectShare): Promise<void> {
  const shares = await getProjectShares();
  const existing = shares.findIndex(
    (s) => s.projectId === share.projectId && s.memberId === share.memberId
  );
  if (existing >= 0) shares[existing] = share;
  else shares.push(share);
  await AsyncStorage.setItem(PROJECT_SHARES_KEY, JSON.stringify(shares));
}

export async function unshareProject(projectId: string, memberId: string): Promise<void> {
  const shares = await getProjectShares();
  const filtered = shares.filter(
    (s) => !(s.projectId === projectId && s.memberId === memberId)
  );
  await AsyncStorage.setItem(PROJECT_SHARES_KEY, JSON.stringify(filtered));
}

// Comments
export async function getComments(targetType: string, targetId: string): Promise<Comment[]> {
  try {
    const raw = await AsyncStorage.getItem(COMMENTS_KEY);
    const comments: Comment[] = raw ? JSON.parse(raw) : [];
    return comments
      .filter((c) => c.targetType === targetType && c.targetId === targetId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export async function addComment(comment: Comment): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(COMMENTS_KEY);
    const comments: Comment[] = raw ? JSON.parse(raw) : [];
    comments.push(comment);
    await AsyncStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
  } catch {
    // ignore
  }
}

export async function deleteComment(commentId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(COMMENTS_KEY);
    const comments: Comment[] = raw ? JSON.parse(raw) : [];
    const filtered = comments.filter((c) => c.id !== commentId);
    await AsyncStorage.setItem(COMMENTS_KEY, JSON.stringify(filtered));
  } catch {
    // ignore
  }
}

export async function getProjectTeam(projectId: string): Promise<Array<TeamMember & { permissions: string }>> {
  const shares = await getProjectShares(projectId);
  const members = await getTeamMembers();
  return shares.map((share) => {
    const member = members.find((m) => m.id === share.memberId);
    return member ? { ...member, permissions: share.permissions } : null;
  }).filter(Boolean) as Array<TeamMember & { permissions: string }>;
}
