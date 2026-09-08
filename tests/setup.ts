// Runs before every test file. lib/env.ts validates these lazily (on first
// use, not on import), so setting them here — before any test body runs —
// is enough regardless of import order.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";
process.env.RESEND_API_KEY ??= "re_test_placeholder";
process.env.RESEND_FROM_EMAIL ??= "feedback@basilissa.gh";
process.env.FEEDBACK_NOTIFICATION_EMAILS ??= "ceo@example.com,ops@example.com,manager@example.com";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
