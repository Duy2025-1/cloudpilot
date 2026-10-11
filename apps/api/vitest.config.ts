import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    env: {
      NODE_ENV: "test",
      PORT: "4000",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/cloudpilot",
      ENCRYPTION_MASTER_KEY:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      JWT_SECRET: "test_jwt_secret_12345678",
      SESSION_SECRET: "test_session_secret_at_least_32_chars_long",
      REDIS_URL: "redis://localhost:6379",
    },
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
});
