#!/bin/bash
set -euo pipefail

# Secure Messenger - PostgreSQL Backup Script
# Purpose: Create encrypted backups with WAL archiving
# RPO Target: ≤ 5 minutes

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/backups}"
S3_BUCKET="${S3_BUCKET:-s3://secure-messenger-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-/secrets/backup-encryption-key}"
DATABASE_URL="${DATABASE_URL}"

# Parse database URL
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\(.*\):.*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\(.*\)/\1/p' | cut -d'?' -f1)
DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\(.*\):.*/\1/p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/.*:\(.*\)@.*/\1/p')

# Backup filename
BACKUP_FILE="secure-messenger_${TIMESTAMP}.sql.gz.gpg"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "🔒 Starting encrypted PostgreSQL backup at $(date)"
echo "Database: $DB_NAME on $DB_HOST:$DB_PORT"

# Create base backup with pg_dump
export PGPASSWORD="$DB_PASS"
pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=custom \
  --compress=9 \
  --verbose \
  --no-acl \
  --no-owner \
  | gpg \
    --symmetric \
    --cipher-algo AES256 \
    --batch \
    --passphrase-file "$ENCRYPTION_KEY" \
    --output "$BACKUP_PATH"

# Verify backup file was created
if [ ! -f "$BACKUP_PATH" ]; then
  echo "❌ Backup failed: file not created"
  exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
echo "✅ Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Upload to S3
echo "☁️  Uploading to S3..."
aws s3 cp "$BACKUP_PATH" "${S3_BUCKET}/database/${BACKUP_FILE}" \
  --storage-class STANDARD_IA \
  --metadata "timestamp=${TIMESTAMP},database=${DB_NAME}"

if [ $? -eq 0 ]; then
  echo "✅ Uploaded to S3: ${S3_BUCKET}/database/${BACKUP_FILE}"
else
  echo "❌ S3 upload failed"
  exit 1
fi

# Archive WAL files
echo "📦 Archiving WAL files..."
WAL_ARCHIVE_DIR="/var/lib/postgresql/wal_archive"
if [ -d "$WAL_ARCHIVE_DIR" ]; then
  tar czf "${BACKUP_DIR}/wal_${TIMESTAMP}.tar.gz" -C "$WAL_ARCHIVE_DIR" .
  aws s3 cp "${BACKUP_DIR}/wal_${TIMESTAMP}.tar.gz" "${S3_BUCKET}/wal/" \
    --metadata "timestamp=${TIMESTAMP}"
  echo "✅ WAL files archived"
fi

# Clean up old local backups
echo "🧹 Cleaning up old backups (retention: ${RETENTION_DAYS} days)..."
find "$BACKUP_DIR" -name "*.sql.gz.gpg" -mtime +${RETENTION_DAYS} -delete
find "$BACKUP_DIR" -name "wal_*.tar.gz" -mtime +${RETENTION_DAYS} -delete

# Clean up old S3 backups
aws s3 ls "${S3_BUCKET}/database/" | while read -r line; do
  BACKUP_DATE=$(echo "$line" | awk '{print $1}')
  BACKUP_NAME=$(echo "$line" | awk '{print $4}')
  AGE_DAYS=$(( ($(date +%s) - $(date -d "$BACKUP_DATE" +%s)) / 86400 ))
  
  if [ $AGE_DAYS -gt $RETENTION_DAYS ]; then
    echo "Deleting old backup: $BACKUP_NAME (${AGE_DAYS} days old)"
    aws s3 rm "${S3_BUCKET}/database/${BACKUP_NAME}"
  fi
done

# Record backup metadata
cat > "${BACKUP_DIR}/latest.json" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "filename": "${BACKUP_FILE}",
  "size": "${BACKUP_SIZE}",
  "database": "${DB_NAME}",
  "s3_path": "${S3_BUCKET}/database/${BACKUP_FILE}",
  "backup_type": "full",
  "completed_at": "$(date -Iseconds)"
}
EOF

aws s3 cp "${BACKUP_DIR}/latest.json" "${S3_BUCKET}/latest.json"

echo "✨ Backup completed successfully at $(date)"
echo "Backup file: $BACKUP_FILE"
echo "S3 location: ${S3_BUCKET}/database/${BACKUP_FILE}"

# Send notification
if [ -n "${SLACK_WEBHOOK:-}" ]; then
  curl -X POST "$SLACK_WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"✅ Database backup completed: ${BACKUP_FILE} (${BACKUP_SIZE})\"}"
fi
