-- Phase 7: Group Features Migration
-- CreateTable: GroupInvite
CREATE TABLE "group_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "max_uses" INTEGER,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "group_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PinnedMessage
CREATE TABLE "pinned_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "pinned_by" UUID NOT NULL,
    "pinned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinned_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GroupAuditLog
CREATE TABLE "group_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" UUID,
    "metadata" JSONB,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_invites_code_key" ON "group_invites"("code");
CREATE INDEX "group_invites_conversation_id_idx" ON "group_invites"("conversation_id");
CREATE INDEX "group_invites_created_by_idx" ON "group_invites"("created_by");

CREATE UNIQUE INDEX "pinned_messages_conversation_id_message_id_key" ON "pinned_messages"("conversation_id", "message_id");
CREATE INDEX "pinned_messages_conversation_id_idx" ON "pinned_messages"("conversation_id");
CREATE INDEX "pinned_messages_message_id_idx" ON "pinned_messages"("message_id");

CREATE INDEX "group_audit_logs_conversation_id_idx" ON "group_audit_logs"("conversation_id");
CREATE INDEX "group_audit_logs_actor_id_idx" ON "group_audit_logs"("actor_id");
CREATE INDEX "group_audit_logs_timestamp_idx" ON "group_audit_logs"("timestamp");

-- AddForeignKey
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pinned_messages" ADD CONSTRAINT "pinned_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pinned_messages" ADD CONSTRAINT "pinned_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pinned_messages" ADD CONSTRAINT "pinned_messages_pinned_by_fkey" FOREIGN KEY ("pinned_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_audit_logs" ADD CONSTRAINT "group_audit_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_audit_logs" ADD CONSTRAINT "group_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 8: Search Indexes
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at" DESC);
CREATE INDEX "messages_sender_id_created_at_idx" ON "messages"("sender_id", "created_at" DESC);
CREATE INDEX "messages_type_idx" ON "messages"("type");
