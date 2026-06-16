/**
 * Action Items Email Utility
 * Composes and sends action items extracted from protocols
 * to assigned team members via email.
 */
import { Platform, Linking } from "react-native";
// Using Linking fallback instead of expo-mail-composer

export type ActionItem = {
  task: string;
  assignee: string;
  priority: string;
  deadline: string;
};

/**
 * Generate email body HTML for action items
 */
export function generateActionItemsEmailBody(
  todos: ActionItem[],
  protocolTitle: string,
  protocolDate: string,
): string {
  const priorityEmoji: Record<string, string> = {
    hoch: "🔴",
    mittel: "🟡",
    niedrig: "🟢",
  };

  let body = `Aufgaben aus Protokoll: ${protocolTitle}\n`;
  body += `Datum: ${protocolDate}\n\n`;
  body += `---\n\n`;

  todos.forEach((todo, i) => {
    const emoji = priorityEmoji[todo.priority] || "⚪";
    body += `${i + 1}. ${emoji} ${todo.task}\n`;
    body += `   Zuständig: ${todo.assignee}\n`;
    body += `   Priorität: ${todo.priority}\n`;
    body += `   Frist: ${todo.deadline}\n\n`;
  });

  body += `---\nAutomatisch generiert von ProtoKI\n`;
  return body;
}

/**
 * Send action items via email using the device's mail client
 */
export async function sendActionItemsEmail(
  todos: ActionItem[],
  recipientEmail: string,
  protocolTitle: string,
  protocolDate: string,
): Promise<boolean> {
  const subject = `Aufgaben: ${protocolTitle} (${protocolDate})`;
  const body = generateActionItemsEmailBody(todos, protocolTitle, protocolDate);

  if (Platform.OS === "web") {
    // On web, use mailto link
    const mailtoUrl = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    await Linking.openURL(mailtoUrl);
    return true;
  }

  try {
    const mailtoUrl2 = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    await Linking.openURL(mailtoUrl2);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

/**
 * Send action items to multiple assignees (each gets their own tasks)
 */
export async function sendActionItemsToAssignees(
  todos: ActionItem[],
  emailMap: Record<string, string>, // assignee name -> email
  protocolTitle: string,
  protocolDate: string,
): Promise<{ sent: string[]; failed: string[] }> {
  const sent: string[] = [];
  const failed: string[] = [];

  // Group todos by assignee
  const byAssignee: Record<string, ActionItem[]> = {};
  todos.forEach(todo => {
    const key = todo.assignee || "Nicht zugewiesen";
    if (!byAssignee[key]) byAssignee[key] = [];
    byAssignee[key].push(todo);
  });

  for (const [assignee, assigneeTodos] of Object.entries(byAssignee)) {
    const email = emailMap[assignee];
    if (!email) continue;

    try {
      await sendActionItemsEmail(assigneeTodos, email, protocolTitle, protocolDate);
      sent.push(assignee);
    } catch {
      failed.push(assignee);
    }
  }

  return { sent, failed };
}
