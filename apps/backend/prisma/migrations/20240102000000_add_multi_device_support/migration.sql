-- Phase 9: Multi-Device Support Migration
-- Alters Device and OneTimeKey models to properly support multi-device

-- AlterTable Device
ALTER TABLE devices DROP COLUMN IF EXISTS device_name;
ALTER TABLE devices DROP COLUMN IF EXISTS platform;
ALTER TABLE devices DROP COLUMN IF EXISTS push_token;
ALTER TABLE devices DROP COLUMN IF EXISTS signed_prekey;
ALTER TABLE devices DROP COLUMN IF EXISTS one_time_prekeys;
ALTER TABLE devices DROP COLUMN IF EXISTS is_active;
ALTER TABLE devices DROP COLUMN IF EXISTS last_active_at;
ALTER TABLE devices DROP COLUMN IF EXISTS identity_key;

-- Recreate with correct types
ALTER TABLE devices ADD COLUMN IF NOT EXISTS name VARCHAR(100) NOT NULL DEFAULT 'Device';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'WEB';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS identity_key BYTEA NOT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS signed_pre_key BYTEA NOT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS signature BYTEA NOT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create OneTimeKey table
CREATE TABLE IF NOT EXISTS one_time_keys (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    key BYTEA NOT NULL,
    device_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS devices_user_id_idx ON devices(user_id);
CREATE INDEX IF NOT EXISTS one_time_keys_device_id_idx ON one_time_keys(device_id);

-- Add read_sync message type if not exists
-- (Assuming we extend the MessageType enum in the schema)
