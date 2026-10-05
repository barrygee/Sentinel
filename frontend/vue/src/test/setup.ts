// Global test setup, loaded before every test file (vitest setupFiles). The
// shared setup (jest-axe matcher, in-memory Web Storage, scrollIntoView stub)
// lives in @sentinel/web-config so the SPA and every web package test alike.
import '@sentinel/web-config/test-setup'
