ALTER TABLE "User" ADD COLUMN "mfaSecretEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrivacyRequest" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "PrivacyRequest" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "PrivacyRequest" ADD COLUMN "resolutionNote" TEXT;
CREATE INDEX "PrivacyRequest_status_createdAt_idx" ON "PrivacyRequest"("status", "createdAt");
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
