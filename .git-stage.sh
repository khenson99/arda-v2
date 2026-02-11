#!/bin/bash
cd /Users/kylehenson/arda-v2
git add docs/spec/pwa/qr-payload-v2.md docs/spec/pwa/scan-ux.md docs/spec/printing/layout-specs.md docs/spec/workflows/exceptions.md
echo "Staged files:"
git diff --cached --name-only
