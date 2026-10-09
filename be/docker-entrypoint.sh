#!/bin/sh
# Starts the API. With DEMO_MODE=1 and no database yet, first fills it with the FICTITIOUS demonstration data
# (38 generated students, one student guest, one teacher guest). Nothing real is ever seeded.
set -e
if [ "$DEMO_MODE" = "1" ] && [ ! -f "$DB_PATH" ]; then
  echo "DEMO_MODE=1 and no database at $DB_PATH: seeding the fictitious demonstration data"
  node --disable-warning=ExperimentalWarning scripts/seed-demo.ts
fi
exec "$@"
