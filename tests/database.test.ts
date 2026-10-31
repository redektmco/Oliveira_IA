import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL migration is repeatable; real SQL enforces RLS, owner links, quota and atomic handoff', async () => {
  const db = new PGlite();
  try {
    // Supabase supplies these in production. The test intentionally simulates
    // only the database auth interface, not real JWT verification or network I/O.
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $body$
        select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
      $body$;
      create function auth.role() returns text language sql stable as $body$
        select current_setting('request.jwt.claims', true)::jsonb ->> 'role'
      $body$;
      grant usage on schema auth, public to anon, authenticated, service_role;
    `);
    const migration = await readFile(new URL('../supabase/migrations/202610200001_initial.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(await readFile(new URL('../supabase/migrations/202610300002_whatsapp.sql', import.meta.url), 'utf8'));
    const crmMigration = await readFile(new URL('../supabase/migrations/202610300003_crm_triage.sql', import.meta.url), 'utf8');
    await db.exec(crmMigration);
    await db.exec(crmMigration);
    const tables = await db.query<{ tablename: string; rowsecurity: boolean; forcerowsecurity: boolean }>(`
      select tablename, rowsecurity, c.relforcerowsecurity as forcerowsecurity
      from pg_tables t join pg_class c on c.relname = t.tablename
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
      where schemaname = 'public' and tablename in
        ('contacts', 'agents', 'knowledge', 'deals', 'conversations', 'messages', 'meetings', 'ai_usage')
    `);
    assert.equal(tables.rows.length, 8);
    assert.ok(tables.rows.every((table) => table.rowsecurity && table.forcerowsecurity));
    const securityChecks = await readFile(new URL('../supabase/tests/security.sql', import.meta.url), 'utf8');
    // DO-block assertions raise on failure. The SQL also verifies server-only RPC
    // grants, persisted attempt limits and rejections without half-written turns.
    await db.exec(securityChecks);
    await db.exec(await readFile(new URL('../supabase/tests/triage.sql', import.meta.url), 'utf8'));
    const remaining = await db.query<{ count: number }>('select count(*)::integer as count from public.contacts');
    assert.equal(remaining.rows[0].count, 0, 'security checks must roll back their fixtures');
  } finally {
    await db.close();
  }
});
