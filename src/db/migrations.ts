import { schemaMigrations, createTable } from '@nozbe/watermelondb/Schema/migrations';

// Migration history — add an addColumns/createTable entry here whenever
// DB_SCHEMA_VERSION increments. Version 1 is the initial schema so the
// migrations array starts empty for v1; fresh installs populate directly
// from schema.ts rather than running migrations.
export default schemaMigrations({
  migrations: [
    {
      // v1 → v2: add app_settings key-value store for persisted preferences.
      toVersion: 2,
      steps: [
        createTable({
          name: 'app_settings',
          columns: [
            { name: 'key',        type: 'string' },
            { name: 'value',      type: 'string' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
});
