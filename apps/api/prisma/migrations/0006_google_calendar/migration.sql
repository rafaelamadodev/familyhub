CREATE TYPE "GoogleSyncStatus" AS ENUM ('NOT_LINKED', 'PENDING', 'SYNCED', 'ERROR', 'REMOVED');

ALTER TABLE "FamilyEvent"
  ADD COLUMN "googleCalendarId" TEXT,
  ADD COLUMN "googleEventId" TEXT,
  ADD COLUMN "googleSyncStatus" "GoogleSyncStatus" NOT NULL DEFAULT 'NOT_LINKED',
  ADD COLUMN "googleSyncedAt" TIMESTAMP(3);

CREATE INDEX "FamilyEvent_familyId_googleSyncStatus_idx"
  ON "FamilyEvent"("familyId", "googleSyncStatus");
CREATE UNIQUE INDEX "FamilyEvent_googleCalendarId_googleEventId_key"
  ON "FamilyEvent"("googleCalendarId", "googleEventId");

CREATE TABLE "GoogleCalendarConnection" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "connectedById" TEXT NOT NULL,
  "calendarId" TEXT NOT NULL DEFAULT 'primary',
  "calendarSummary" TEXT,
  "accessTokenEncrypted" TEXT NOT NULL,
  "refreshTokenEncrypted" TEXT NOT NULL,
  "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoogleCalendarConnection_familyId_key"
  ON "GoogleCalendarConnection"("familyId");
CREATE INDEX "GoogleCalendarConnection_connectedById_idx"
  ON "GoogleCalendarConnection"("connectedById");
ALTER TABLE "GoogleCalendarConnection"
  ADD CONSTRAINT "GoogleCalendarConnection_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GoogleCalendarConnection_connectedById_fkey"
  FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GoogleOAuthState" (
  "id" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleOAuthState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoogleOAuthState_stateHash_key" ON "GoogleOAuthState"("stateHash");
CREATE INDEX "GoogleOAuthState_expiresAt_usedAt_idx" ON "GoogleOAuthState"("expiresAt", "usedAt");
ALTER TABLE "GoogleOAuthState"
  ADD CONSTRAINT "GoogleOAuthState_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GoogleOAuthState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
