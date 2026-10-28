#!/usr/bin/env bash
# Run schema.sql on a throwaway database, then the checks in test.sql.
# Needs psql and a Postgres 15+ server (PGHOST, PGUSER, PGPASSWORD).
set -euo pipefail
cd "$(dirname "$0")"
db=predikt_test
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $db" -c "create database $db"
psql -v ON_ERROR_STOP=1 -q -o /dev/null -d "$db" -f bootstrap.sql -f schema.sql -f test.sql
