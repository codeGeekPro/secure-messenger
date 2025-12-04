#!/bin/bash
set -euo pipefail

# Secure Messenger - PostgreSQL Restore Script
# Purpose: Restore from encrypted backups
# RTO Target: ≤ 30 minutes

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups}"
S3_BUCKET="${S3_BUCKET:-s3://secure-messenger-backups}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-/secrets/backup-encryption-key}"
DATABASE_URL="${DATABASE_URL}"
BACKUP_FILE="${1:-latest}"

# Parse database URL
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\(.*\):.*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\(.*\)/\1/p' | cut -d'?' -f1)
DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\(.*\):.*/\1/p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/.*:\(.*\)@.*/\1/p')

echo "🔓 Starting database restore at $(date)"
echo "Database: $DB_NAME on $DB_HOST:$DB_PORT"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# If "latest", get the latest backup filename
if [ "$BACKUP_FILE" = "latest" ]; then
  echo "📥 Fetching latest backup metadata..."
  aws s3 cp "${S3_BUCKET}/latest.json" "${BACKUP_DIR}/latest.json"
  BACKUP_FILE=$(jq -r '.filename' "${BACKUP_DIR}/latest.json")
  echo "Latest backup: $BACKUP_FILE"
fi

BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# Download from S3 if not present locally
if [ ! -f "$BACKUP_PATH" ]; then
  echo "📥 Downloading backup from S3..."
  aws s3 cp "${S3_BUCKET}/database/${BACKUP_FILE}" "$BACKUP_PATH"
  
  if [ ! -f "$BACKUP_PATH" ]; then
    echo "❌ Failed to download backup file"
    exit 1
  fi
  echo "✅ Downloaded: $BACKUP_FILE"
fi

# Verify backup file exists
if [ ! -f "$BACKUP_PATH" ]; then
  echo "❌ Backup file not found: $BACKUP_PATH"
  exit 1
fi

# Confirm restore (if not running in automated mode)
if [ -z "${AUTO_CONFIRM:-}" ]; then
  echo ""
  echo "⚠️  WARNING: This will overwrite the current database!"
  echo "Database: $DB_NAME"
  echo "Backup: $BACKUP_FILE"
  echo ""
  read -p "Continue with restore? (yes/no): " CONFIRM
  
  if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
  fi
fi

# Stop application pods to prevent connections during restore
if [ -n "${K8S_NAMESPACE:-}" ]; then
  echo "🛑 Scaling down application pods..."
  kubectl scale deployment backend --replicas=0 -n "$K8S_NAMESPACE" || true
  kubectl scale deployment web --replicas=0 -n "$K8S_NAMESPACE" || true
  sleep 10
fi

# Terminate existing connections
echo "🔌 Terminating existing database connections..."
export PGPASSWORD="$DB_PASS"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DB_NAME'
  AND pid <> pg_backend_pid();
EOF

# Drop and recreate database
echo "🗑️  Dropping existing database..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"

# Decrypt and restore
echo "📦 Decrypting and restoring backup..."
gpg \
  --decrypt \
  --batch \
  --passphrase-file "$ENCRYPTION_KEY" \
  "$BACKUP_PATH" \
  | pg_restore \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=custom \
    --verbose \
    --no-acl \
    --no-owner \
    --clean \
    --if-exists

if [ $? -eq 0 ]; then
  echo "✅ Database restored successfully"
else
  echo "❌ Restore failed"
  exit 1
fi

# Restore WAL files if needed
if [ -n "${RESTORE_WAL:-}" ]; then
  echo "📦 Restoring WAL files..."
  WAL_TIMESTAMP=$(echo "$BACKUP_FILE" | sed -n 's/.*_\([0-9]*_[0-9]*\).*/\1/p')
  WAL_FILE="wal_${WAL_TIMESTAMP}.tar.gz"
  
  aws s3 cp "${S3_BUCKET}/wal/${WAL_FILE}" "${BACKUP_DIR}/${WAL_FILE}"
  mkdir -p /var/lib/postgresql/wal_archive
  tar xzf "${BACKUP_DIR}/${WAL_FILE}" -C /var/lib/postgresql/wal_archive/
  echo "✅ WAL files restored"
fi

# Run migrations to ensure schema is up to date
echo "🔄 Running database migrations..."
cd /app/apps/backend
npx prisma migrate deploy

# Start application pods
if [ -n "${K8S_NAMESPACE:-}" ]; then
  echo "🚀 Scaling up application pods..."
  kubectl scale deployment backend --replicas=3 -n "$K8S_NAMESPACE"
  kubectl scale deployment web --replicas=2 -n "$K8S_NAMESPACE"
  
  echo "⏳ Waiting for pods to be ready..."
  kubectl wait --for=condition=available --timeout=5m deployment/backend -n "$K8S_NAMESPACE"
  kubectl wait --for=condition=available --timeout=5m deployment/web -n "$K8S_NAMESPACE"
fi

# Verify restore
echo "✓ Verifying restore..."
TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "Tables found: $TABLE_COUNT"

# Record restore metadata
RESTORE_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cat > "${BACKUP_DIR}/restore_${RESTORE_TIMESTAMP}.json" <<EOF
{
  "timestamp": "${RESTORE_TIMESTAMP}",
  "backup_file": "${BACKUP_FILE}",
  "database": "${DB_NAME}",
  "restored_at": "$(date -Iseconds)",
  "table_count": ${TABLE_COUNT}
}
EOF

echo "✨ Restore completed successfully at $(date)"
echo "Backup restored: $BACKUP_FILE"
echo "Total tables: $TABLE_COUNT"

# Calculate RTO
RESTORE_DURATION=$SECONDS
echo "⏱️  Restore duration: ${RESTORE_DURATION}s (Target: ≤1800s)"

if [ $RESTORE_DURATION -gt 1800 ]; then
  echo "⚠️  RTO target exceeded!"
else
  echo "✅ RTO target met"
fi

# Send notification
if [ -n "${SLACK_WEBHOOK:-}" ]; then
  curl -X POST "$SLACK_WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"✅ Database restored from ${BACKUP_FILE} in ${RESTORE_DURATION}s\"}"
fi
