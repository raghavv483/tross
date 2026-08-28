import { defineConfig } from 'vitest/config';

/**
 * The suite runs entirely offline: no network, no live source. Failure modes
 * are driven by stub `ProfileSource` implementations injected into
 * `ProfileService`, never by network mocking.
 *
 * Note: Vitest 4 removed the `basic` reporter — the default reporter is used.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      // Silent means zero output. A server started under this looks dead but
      // is running — see CLAUDE.md.
      LOG_LEVEL: 'silent',
      PROFILE_SOURCE: 'fixture',
    },
  },
});
