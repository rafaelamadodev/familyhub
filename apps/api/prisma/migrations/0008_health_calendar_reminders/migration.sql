ALTER TABLE "FamilyEvent" ADD COLUMN "healthRecordId" TEXT;

CREATE UNIQUE INDEX "FamilyEvent_healthRecordId_key" ON "FamilyEvent"("healthRecordId");

ALTER TABLE "FamilyEvent"
ADD CONSTRAINT "FamilyEvent_healthRecordId_fkey"
FOREIGN KEY ("healthRecordId") REFERENCES "HealthRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
