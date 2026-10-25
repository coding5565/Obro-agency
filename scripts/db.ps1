# OBRO' Panel — lokal PostgreSQL (loyiha ichidagi .pgdata, 5433-port).
# Ishlatish:  powershell -File scripts\db.ps1 start | stop | status
# Asosiy Postgres xizmatingizga (5432) tegmaydi. Parol backend\.env faylida.
param([ValidateSet('start', 'stop', 'status')][string]$Action = 'status')

$root = Split-Path -Parent $PSScriptRoot
$bin = 'C:\Program Files\PostgreSQL\17\bin'
$data = Join-Path $root '.pgdata'
$log = Join-Path $root '.pgdata.log'

switch ($Action) {
  'start'  { & "$bin\pg_ctl.exe" -D $data -l $log -o '-p 5433 -c listen_addresses=127.0.0.1' -w start }
  'stop'   { & "$bin\pg_ctl.exe" -D $data -m fast stop }
  'status' { & "$bin\pg_ctl.exe" -D $data status }
}
