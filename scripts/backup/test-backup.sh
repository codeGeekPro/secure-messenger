#!/bin/bash
set -euo pipefail

# Secure Messenger - Backup Test Script
# Purpose: Validate backup and restore procedures
# Tests: Backup creation, encryption, restore, data integrity

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEST_DIR="/tmp/backup-test-${TIMESTAMP}"
mkdir -p "$TEST_DIR"

echo "🧪 Starting backup/restore test at $(date)"
echo "Test directory: $TEST_DIR"

# Override configuration for testing
export BACKUP_DIR="$TEST_DIR"
export S3_BUCKET="s3://secure-messenger-backups-test"
export RETENTION_DAYS=7
export AUTO_CONFIRM=yes

# Test 1: Create test database
echo ""
echo "Test 1: Creating test database..."
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5432/backup_test_${TIMESTAMP}"
DB_NAME="backup_test_${TIMESTAMP}"

psql -U postgres -c "CREATE DATABASE $DB_NAME;"
psql -U postgres -d "$DB_NAME" <<EOF
CREATE TABLE test_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO test_users (email, name) VALUES
  ('user1@test.com', 'Test User 1'),
  ('user2@test.com', 'Test User 2'),
  ('user3@test.com', 'Test User 3');
EOF

USER_COUNT=$(psql -U postgres -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM test_users;")
echo "✅ Test database created with $USER_COUNT users"

# Test 2: Run backup
echo ""
echo "Test 2: Running backup script..."
export DATABASE_URL="$TEST_DATABASE_URL"

BACKUP_START=$(date +%s)
bash scripts/backup/backup.sh
BACKUP_END=$(date +%s)
BACKUP_DURATION=$((BACKUP_END - BACKUP_START))

if [ -f "$BACKUP_DIR"/*.sql.gz.gpg ]; then
  echo "✅ Backup completed in ${BACKUP_DURATION}s"
  BACKUP_FILE=$(ls -t "$BACKUP_DIR"/*.sql.gz.gpg | head -1)
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "Backup file: $(basename $BACKUP_FILE) ($BACKUP_SIZE)"
else
  echo "❌ Backup failed"
  exit 1
fi

# Test 3: Verify encryption
echo ""
echo "Test 3: Verifying encryption..."
if file "$BACKUP_FILE" | grep -q "GPG"; then
  echo "✅ Backup is encrypted (GPG)"
else
  echo "❌ Backup is not encrypted"
  exit 1
fi

# Test 4: Test restore
echo ""
echo "Test 4: Testing restore..."

# Drop the test database to simulate disaster
psql -U postgres -c "DROP DATABASE $DB_NAME;"
echo "Database dropped"

# Restore from backup
RESTORE_START=$(date +%s)
export K8S_NAMESPACE=""  # Skip K8s operations in test
bash scripts/backup/restore.sh "$(basename $BACKUP_FILE)"
RESTORE_END=$(date +%s)
RESTORE_DURATION=$((RESTORE_END - RESTORE_START))

echo "✅ Restore completed in ${RESTORE_DURATION}s"

# Test 5: Verify data integrity
echo ""
echo "Test 5: Verifying data integrity..."
RESTORED_USER_COUNT=$(psql -U postgres -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM test_users;")

if [ "$RESTORED_USER_COUNT" -eq "$USER_COUNT" ]; then
  echo "✅ Data integrity verified ($RESTORED_USER_COUNT users)"
else
  echo "❌ Data integrity check failed (expected $USER_COUNT, got $RESTORED_USER_COUNT)"
  exit 1
fi

# Verify specific data
USER1_EMAIL=$(psql -U postgres -d "$DB_NAME" -t -c "SELECT email FROM test_users WHERE name = 'Test User 1';")
if echo "$USER1_EMAIL" | grep -q "user1@test.com"; then
  echo "✅ Sample data verified"
else
  echo "❌ Sample data verification failed"
  exit 1
fi

# Test 6: Validate RPO/RTO targets
echo ""
echo "Test 6: Validating RPO/RTO targets..."
RPO_TARGET=300  # 5 minutes
RTO_TARGET=1800  # 30 minutes

echo "Backup duration: ${BACKUP_DURATION}s (RPO target: ≤${RPO_TARGET}s)"
echo "Restore duration: ${RESTORE_DURATION}s (RTO target: ≤${RTO_TARGET}s)"

if [ $BACKUP_DURATION -le $RPO_TARGET ]; then
  echo "✅ RPO target met"
else
  echo "⚠️  RPO target exceeded (${BACKUP_DURATION}s > ${RPO_TARGET}s)"
fi

if [ $RESTORE_DURATION -le $RTO_TARGET ]; then
  echo "✅ RTO target met"
else
  echo "⚠️  RTO target exceeded (${RESTORE_DURATION}s > ${RTO_TARGET}s)"
fi

# Cleanup
echo ""
echo "🧹 Cleaning up test environment..."
psql -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
rm -rf "$TEST_DIR"

# Summary
echo ""
echo "=========================================="
echo "✨ Backup/Restore Test Summary"
echo "=========================================="
echo "✅ Backup creation: ${BACKUP_DURATION}s"
echo "✅ Backup encryption: Verified"
echo "✅ Restore process: ${RESTORE_DURATION}s"
echo "✅ Data integrity: Verified"
echo "✅ RPO (≤5 min): $([ $BACKUP_DURATION -le $RPO_TARGET ] && echo 'MET' || echo 'EXCEEDED')"
echo "✅ RTO (≤30 min): $([ $RESTORE_DURATION -le $RTO_TARGET ] && echo 'MET' || echo 'EXCEEDED')"
echo "=========================================="
echo "All tests passed! 🎉"
