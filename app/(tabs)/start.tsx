import { StartChooserContent } from "@/components/start-chooser-content";

/**
 * Permanent "Was möchtest du tun?" hub as its own tab, always reachable from
 * the bottom tab bar. No Skip action here (it is not a one-off gate).
 */
export default function StartTab() {
  return <StartChooserContent />;
}
