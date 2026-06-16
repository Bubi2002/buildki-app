import AsyncStorage from "@react-native-async-storage/async-storage";

export type AgendaItem = {
  id: string;
  title: string;
  source: "previous_protocol" | "open_task" | "recurring" | "manual";
  sourceProtocolId?: string;
  sourceProtocolTitle?: string;
  priority: "hoch" | "mittel" | "niedrig";
  estimatedMinutes: number;
  notes?: string;
};

export type PreparedAgenda = {
  id: string;
  meetingTitle: string;
  meetingDate: string;
  items: AgendaItem[];
  createdAt: string;
};

export async function generateAgendaSuggestions(projectId?: string): Promise<AgendaItem[]> {
  const suggestions: AgendaItem[] = [];
  try {
    const protocols = JSON.parse(await AsyncStorage.getItem("protocols") || "[]");
    
    // Filter by project if specified
    const relevantProtocols = projectId 
      ? protocols.filter((p: any) => p.projectId === projectId)
      : protocols;
    
    // Sort by date (newest first)
    relevantProtocols.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // 1. Open tasks from recent protocols
    const recentProtocols = relevantProtocols.slice(0, 5);
    for (const protocol of recentProtocols) {
      if (protocol.todos) {
        const openTodos = protocol.todos.filter((t: any) => !t.done);
        for (const todo of openTodos.slice(0, 3)) {
          suggestions.push({
            id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            title: `Offene Aufgabe: ${todo.task}`,
            source: "open_task",
            sourceProtocolId: protocol.id,
            sourceProtocolTitle: protocol.templateName || "Protokoll",
            priority: todo.priority || "mittel",
            estimatedMinutes: 5,
          });
        }
      }
    }
    
    // 2. Topics from last protocol that need follow-up
    if (recentProtocols.length > 0) {
      const lastProtocol = recentProtocols[0];
      const text = lastProtocol.protocol || "";
      
      // Extract sections that mention "nächstes Mal", "Folgetermin", "offen", etc.
      const followUpPatterns = [
        /(?:nächstes? Mal|Folgetermin|beim nächsten|zu klären|offen geblieben)[^.]*\./gi,
        /(?:TODO|OFFEN|NACHVERFOLGEN)[:\s]+([^\n]+)/gi,
      ];
      
      for (const pattern of followUpPatterns) {
        const matches = text.match(pattern);
        if (matches) {
          for (const match of matches.slice(0, 2)) {
            suggestions.push({
              id: `followup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              title: match.trim().slice(0, 100),
              source: "previous_protocol",
              sourceProtocolId: lastProtocol.id,
              sourceProtocolTitle: lastProtocol.templateName || "Letztes Protokoll",
              priority: "mittel",
              estimatedMinutes: 10,
            });
          }
        }
      }
    }
    
    // 3. Recurring items based on patterns
    const templateCounts: Record<string, number> = {};
    for (const p of relevantProtocols.slice(0, 10)) {
      const name = p.templateName || "Standard";
      templateCounts[name] = (templateCounts[name] || 0) + 1;
    }
    
    // If a template is used frequently, suggest standard agenda items
    for (const [templateName, count] of Object.entries(templateCounts)) {
      if (count >= 3) {
        suggestions.push({
          id: `recurring-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          title: `Regelmäßig: ${templateName} - Status-Update`,
          source: "recurring",
          priority: "niedrig",
          estimatedMinutes: 15,
          notes: `Basierend auf ${count} vorherigen ${templateName}-Protokollen`,
        });
      }
    }
  } catch (error) {
    console.error("Error generating agenda suggestions:", error);
  }
  
  return suggestions;
}

export async function saveAgenda(agenda: PreparedAgenda): Promise<void> {
  const stored = await AsyncStorage.getItem("prepared-agendas");
  const agendas = stored ? JSON.parse(stored) : [];
  agendas.unshift(agenda);
  await AsyncStorage.setItem("prepared-agendas", JSON.stringify(agendas.slice(0, 50)));
}

export async function getSavedAgendas(): Promise<PreparedAgenda[]> {
  const stored = await AsyncStorage.getItem("prepared-agendas");
  return stored ? JSON.parse(stored) : [];
}

export async function deleteAgenda(agendaId: string): Promise<void> {
  const stored = await AsyncStorage.getItem("prepared-agendas");
  if (stored) {
    const agendas = JSON.parse(stored).filter((a: PreparedAgenda) => a.id !== agendaId);
    await AsyncStorage.setItem("prepared-agendas", JSON.stringify(agendas));
  }
}

export function formatAgendaAsText(agenda: PreparedAgenda): string {
  let text = `AGENDA: ${agenda.meetingTitle}\n`;
  text += `Datum: ${agenda.meetingDate}\n`;
  text += `${"=".repeat(40)}\n\n`;
  
  let totalMinutes = 0;
  agenda.items.forEach((item, index) => {
    const priorityIcon = item.priority === "hoch" ? "🔴" : item.priority === "mittel" ? "🟡" : "🟢";
    text += `${index + 1}. ${priorityIcon} ${item.title} (${item.estimatedMinutes} Min.)\n`;
    if (item.notes) text += `   Hinweis: ${item.notes}\n`;
    totalMinutes += item.estimatedMinutes;
  });
  
  text += `\n${"=".repeat(40)}\n`;
  text += `Geschätzte Gesamtdauer: ${totalMinutes} Minuten\n`;
  
  return text;
}
