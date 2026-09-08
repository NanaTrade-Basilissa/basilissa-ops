// Vitest stand-in for the `server-only` package.
//
// The real package ships a "react-server" export condition and throws when
// resolved outside a Server Component. Vitest resolves the throwing branch, so
// every module guarded with `import "server-only"` fails to load in tests. The
// guard is a build-time boundary we still want in the app, so we alias it to
// this no-op for tests rather than removing it from the source.
export {};
