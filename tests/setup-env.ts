const TEST_ENVIRONMENT = {
  EXPO_APPLE_ID: "testflight@example.invalid",
  EXPO_APPLE_APP_SPECIFIC_PASSWORD: "test-test-test-test",
  EXPO_APPLE_TEAM_ID: "TESTTEAM01",
  ASC_API_KEY_ISSUER_ID: "00000000-0000-4000-8000-000000000000",
  ASC_API_KEY_ID: "TESTKEY001",
  DROPBOX_APP_KEY: "testdropboxkey",
  DROPBOX_APP_SECRET: "testdropboxsecret",
  MATTERPORT_TOKEN_ID: "testmatterporttoken",
  MATTERPORT_TOKEN_SECRET: "testmatterportsecret",
  MATTERPORT_SDK_KEY: "testmatterportsdkkey",
} as const;

for (const [name, value] of Object.entries(TEST_ENVIRONMENT)) {
  process.env[name] = value;
}
