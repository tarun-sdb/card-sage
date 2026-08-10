#!/bin/bash
cd /home/tarun/card-sage
git add -A
if ! git diff --cached --quiet; then
  git commit -m "chore: auto-sync $(date -u +%Y-%m-%dT%H:%MZ)"
  git push origin main
fi
