import { playwright } from "vite-plus/test/browser-playwright";
import { defineConfig } from "vite-plus";

// website は termpic のビルド結果（dist）を読むため、
// test / build の前に依存パッケージの build を走らせる。
const afterDependencyBuild = [{ task: "build", from: "dependencies" }] as const;

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: "unit", include: ["tests/*.test.ts"] },
      },
      {
        test: {
          name: "browser",
          include: ["tests/browser/*.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            viewport: { width: 1280, height: 900 },
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
  run: {
    tasks: {
      build: { command: ["tsc", "vp build"], dependsOn: [...afterDependencyBuild] },
      test: { command: "vp test", dependsOn: [...afterDependencyBuild] },
    },
  },
});
