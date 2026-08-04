#!/bin/bash
echo "Stopping Giftly..."

kill_port() {
  local port=$1
  local pid
  # Use PowerShell to find the PID reliably on Windows
  pid=$(powershell.exe -NoProfile -Command \
    "Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess" \
    2>/dev/null | tr -d '\r')
  if [ -n "$pid" ] && [ "$pid" != "" ]; then
    echo "Killing PID $pid on port $port"
    powershell.exe -NoProfile -Command "Stop-Process -Id $pid -Force" 2>/dev/null
  else
    echo "Nothing found on port $port"
  fi
}

kill_port 3001  # backend
kill_port 5173  # frontend

echo "Done."
