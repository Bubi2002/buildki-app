import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Account data rights architecture", () => {
  it("exports every account-owned database category without credential secrets", () => {
    const source = read("server/account-router.ts");
    for (const category of [
      "privacyChoices",
      "privacyChoiceEvents",
      "protocols",
      "projects",
      "defects",
      "attachments",
      "dailyReports",
    ]) {
      expect(source).toContain(`${category}:`);
    }
    expect(source).not.toContain("passwordHash: user.passwordHash");
    expect(source).not.toContain("verificationCode:");
    expect(source).not.toContain("resetCode:");
  });

  it("requires exact destructive confirmation and acknowledgement", () => {
    const server = read("server/account-router.ts");
    const client = read("components/data-rights-section.tsx");
    expect(server).toContain('z.literal(DELETE_CONFIRMATION)');
    expect(server).toContain('acknowledgeProviderResiduals: z.literal(true)');
    expect(client).toContain('const DELETE_CONFIRMATION = "KONTO ENDGÜLTIG LÖSCHEN"');
    expect(client).toContain("confirmation === DELETE_CONFIRMATION");
    expect(client).toContain("acknowledgeProviderResiduals");
  });

  it("deletes account-owned database tables transactionally and the user last", () => {
    const source = read("server/account-router.ts");
    expect(source).toContain("await db.transaction(async (tx) =>");
    const eventDelete = source.indexOf("tx.delete(privacyConsentEvents)");
    const attachmentDelete = source.indexOf("tx.delete(attachments)");
    const projectDelete = source.indexOf("tx.delete(projects)");
    const userDelete = source.indexOf("tx.delete(users)");
    expect(eventDelete).toBeGreaterThan(0);
    expect(attachmentDelete).toBeGreaterThan(eventDelete);
    expect(projectDelete).toBeGreaterThan(attachmentDelete);
    expect(userDelete).toBeGreaterThan(projectDelete);
  });

  it("does not falsely claim physical provider deletion", () => {
    const source = read("server/account-router.ts");
    expect(source).toContain("storageObjectsUnlinked");
    expect(source).toContain("Storage-API bietet keine physische Löschoperation");
    expect(source).toContain("stripeCustomerReferencePresent");
    expect(source).toContain("OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN");
  });

  it("exports all non-secret local stores and an on-device file manifest", () => {
    const source = read("lib/data-rights.ts");
    expect(source).toContain("AsyncStorage.getAllKeys()");
    expect(source).toContain("AsyncStorage.multiGet(exportableKeys)");
    expect(source).toContain("inventoryDirectory(FileSystem.documentDirectory)");
    expect(source).toContain("SECRET_KEY_PATTERN");
    expect(source).toContain("excludedStorageKeys");
  });

  it("removes local stores, files, caches and authentication artifacts", () => {
    const source = read("lib/data-rights.ts");
    expect(source).toContain("cancelDailySummary()");
    expect(source).toContain("disconnectDropbox()");
    expect(source).toContain("removeSessionToken()");
    expect(source).toContain("clearUserInfo()");
    expect(source).toContain("clearSession()");
    expect(source).toContain("clearDirectory(FileSystem.documentDirectory)");
    expect(source).toContain("clearDirectory(FileSystem.cacheDirectory)");
    expect(source).toContain("AsyncStorage.clear()");
  });

  it("exposes the data-rights router and the combined UI without the old local-only claim", () => {
    const routers = read("server/routers.ts");
    const legal = read("app/legal.tsx");
    const ui = read("components/data-rights-section.tsx");
    expect(routers).toContain("account: accountRouter");
    expect(legal).toContain("<DataRightsSection />");
    expect(legal).not.toContain("LOCAL_PARTIAL_REVIEW_EXPORT");
    expect(ui).toContain("trpc.account.exportData.useQuery");
    expect(ui).toContain("trpc.account.deleteAccount.useMutation");
  });
});
