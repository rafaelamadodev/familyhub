ALTER TABLE "User" ADD COLUMN "googleSubject" TEXT;
CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");

CREATE TABLE "GoogleAuthState" (
  "id" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "returnUrl" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleAuthState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoogleAuthState_stateHash_key" ON "GoogleAuthState"("stateHash");
CREATE INDEX "GoogleAuthState_expiresAt_usedAt_idx" ON "GoogleAuthState"("expiresAt", "usedAt");
