#!/usr/bin/env bash
# Prueba las migraciones v2 en un Postgres 15+ local (sin Docker ni Supabase CLI).
# Requiere: psql y un servidor Postgres con btree_gist y pgcrypto.
# Usa las variables estándar de libpq: PGHOST, PGPORT, PGUSER, PGPASSWORD.
#   PGHOST=localhost PGUSER=postgres ./supabase/test/run_v2.sh
set -euo pipefail
cd "$(dirname "$0")/.."
psql -d postgres -q -X -c "drop database if exists gym_test" -c "create database gym_test"
Q="psql -d gym_test -v ON_ERROR_STOP=1 -q -X"
$Q -f test/stub_supabase.sql -f test/stub_supabase_v2.sql
for f in migrations/000[1-4]*.sql; do $Q -f "$f" >/dev/null 2>&1; done
# simula el admin que ya existe en producción
$Q -c "insert into auth.users (id,email,raw_user_meta_data) values ('aaaaaaaa-0000-0000-0000-000000000001','admin@test.com','{\"full_name\":\"Admin\"}')" >/dev/null
for f in migrations/000[5-9]*.sql migrations/00[1-9][0-9]*.sql; do $Q -f "$f" 2>&1 | grep -v 'NOTICE\|DETAIL\|drop cascades' || true; done
$Q -f test/scenario_v2.sql | grep -E '^ OK|PASARON|=|FALLO'
$Q -f test/scenario_admin.sql | grep -E '^ OK|PASARON|=|FALLO'
$Q -f test/scenario_stage1.sql | grep -E '^ OK|PASARON|=|FALLO'
$Q -f test/scenario_stage2.sql | grep -E '^ OK|PASARON|=|FALLO'
$Q -f test/scenario_padron.sql | grep -E '^ OK|PASARON|=|FALLO'
