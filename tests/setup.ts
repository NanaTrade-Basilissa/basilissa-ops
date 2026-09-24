// Runs before every test file. lib/env.ts validates these lazily (on first
// use, not on import), so setting them here — before any test body runs —
// is enough regardless of import order.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";
process.env.EMAIL_SERVER_URL ??= "https://nana-trade-server.vercel.app/email";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
