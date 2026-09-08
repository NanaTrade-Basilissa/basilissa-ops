-- Append-only audit log.
--
-- The table is ordinary; the immutability is the point. Two triggers reject
-- UPDATE and DELETE outright, so an application bug, a careless script, or a
-- well-meaning "just fix this one row" cannot quietly rewrite history. An
-- audit log that the application can edit is not an audit log.
--
-- Why a trigger rather than REVOKE UPDATE, DELETE ON audit_logs FROM <role>:
-- the grant approach needs the deployment's database role name, which differs
-- between local Postgres, Neon, and a self-hosted server. Per ADR 0001 nothing
-- should assume a particular platform, and a trigger is enforced identically
-- everywhere with no configuration.
--
-- A superuser can still drop the trigger. That is intentional and unavoidable:
-- the threat this guards against is our own code, not someone with the
-- database owner's credentials.

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_occurredAt_idx" ON "audit_logs"("entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_occurredAt_idx" ON "audit_logs"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_occurredAt_idx" ON "audit_logs"("occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_occurredAt_idx" ON "audit_logs"("action", "occurredAt");

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
-- Written generically so attendance_events can reuse it in Phase 1, where the
-- same guarantee is required: raw attendance events are evidence, and the
-- derived day record is what gets corrected.

CREATE OR REPLACE FUNCTION append_only_guard()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        USING
            ERRCODE = 'restrict_violation',
            MESSAGE = format('%I is append-only; %s is not permitted', TG_TABLE_NAME, TG_OP),
            HINT    = 'Record a correcting entry instead. Retention purges must drop this trigger deliberately and restore it afterwards.';
    -- Unreachable: RAISE EXCEPTION always throws. Present so plpgsql cannot
    -- complain about control reaching the end of the function.
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_no_update"
    BEFORE UPDATE ON "audit_logs"
    FOR EACH ROW EXECUTE FUNCTION append_only_guard();

CREATE TRIGGER "audit_logs_no_delete"
    BEFORE DELETE ON "audit_logs"
    FOR EACH ROW EXECUTE FUNCTION append_only_guard();
