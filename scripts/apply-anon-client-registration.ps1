# Apply migration: allow anon client registration
# Requires: SUPABASE_DB_PASSWORD (Database password from Supabase Dashboard → Settings → Database)

param(
  [string]$ProjectRef = "vlcxjizieelcfunausll",
  [string]$MigrationFile = "supabase/migrations/20260521120000_allow_anon_client_registration.sql"
)

$ErrorActionPreference = "Stop"

if (-not $env:SUPABASE_DB_PASSWORD) {
  Write-Error "Set SUPABASE_DB_PASSWORD first (Supabase Dashboard → Project Settings → Database → Database password)"
}

$encoded = [uri]::EscapeDataString($env:SUPABASE_DB_PASSWORD)
$dbUrl = "postgresql://postgres.${ProjectRef}:${encoded}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"

Write-Host "Applying migration to project: $ProjectRef"
npx supabase db query --db-url $dbUrl -f $MigrationFile

Write-Host "Done."
