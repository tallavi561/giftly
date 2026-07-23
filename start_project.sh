#!/bin/bash
echo "Starting Giftly..."

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Backend
cd "$ROOT/backend" && npm run dev &
BACK_PID=$!
echo "Backend started (PID $BACK_PID)"

# Frontend
cd "$ROOT/frontend" && npm run dev &
FRONT_PID=$!
echo "Frontend started (PID $FRONT_PID)"

echo ""
echo "Backend:  http://localhost:3001"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both."

# Stop both on Ctrl+C
trap "kill $BACK_PID $FRONT_PID 2>/dev/null; exit" INT
wait
