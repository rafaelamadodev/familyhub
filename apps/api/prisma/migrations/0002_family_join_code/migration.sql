ALTER TABLE "Family" ADD COLUMN "joinCode" TEXT;

UPDATE "Family"
SET "joinCode" = 'FH-' || UPPER(SUBSTRING(MD5("id" || clock_timestamp()::text) FROM 1 FOR 8))
WHERE "joinCode" IS NULL;

ALTER TABLE "Family" ALTER COLUMN "joinCode" SET NOT NULL;
CREATE UNIQUE INDEX "Family_joinCode_key" ON "Family"("joinCode");
