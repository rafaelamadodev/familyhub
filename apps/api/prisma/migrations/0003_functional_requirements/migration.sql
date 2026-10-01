-- AlterTable
ALTER TABLE "User" ADD COLUMN     "consentPreferences" JSONB,
ADD COLUMN     "notificationPreferences" JSONB;

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "notificationPreferences" JSONB;

-- AlterTable
ALTER TABLE "FamilyMember" ADD COLUMN     "sensitivePermissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "occurrenceOf" TEXT;

-- AlterTable
ALTER TABLE "FamilyEvent" ADD COLUMN     "dateOnly" TEXT,
ADD COLUMN     "reminderMinutes" INTEGER;

-- AlterTable
ALTER TABLE "ChildProfile" ADD COLUMN     "blockedModules" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "HealthRecord" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "professional" TEXT,
ADD COLUMN     "specialty" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "documentDate" TIMESTAMP(3),
ADD COLUMN     "holder" TEXT;

-- AlterTable
ALTER TABLE "FinancialEntry" ADD COLUMN     "occurrenceOf" TEXT,
ADD COLUMN     "recurrence" TEXT;

-- CreateTable
CREATE TABLE "FamilyInvite" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "role" "FamilyRole" NOT NULL DEFAULT 'MEMBER',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailJob" (
    "id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scope" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectDeletionJob" (
    "id" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectDeletionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FamilyInvite_tokenHash_key" ON "FamilyInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "FamilyInvite_familyId_expiresAt_idx" ON "FamilyInvite"("familyId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_objectKey_key" ON "DocumentVersion"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupKey_key" ON "Notification"("dedupKey");

-- CreateIndex
CREATE INDEX "Notification_userId_scheduledAt_idx" ON "Notification"("userId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_token_key" ON "PushDevice"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Task_occurrenceOf_key" ON "Task"("occurrenceOf");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEntry_occurrenceOf_key" ON "FinancialEntry"("occurrenceOf");

-- AddForeignKey
ALTER TABLE "FamilyInvite" ADD CONSTRAINT "FamilyInvite_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing clients used reversible token encoding. Require a fresh login.
UPDATE "Session" SET "revokedAt" = CURRENT_TIMESTAMP, "tokenHash" = 'legacy-revoked:' || "id";
UPDATE "EmailVerificationToken" SET "usedAt" = CURRENT_TIMESTAMP, "tokenHash" = 'legacy-revoked:' || "id";
UPDATE "PasswordResetToken" SET "usedAt" = CURRENT_TIMESTAMP, "tokenHash" = 'legacy-revoked:' || "id";
