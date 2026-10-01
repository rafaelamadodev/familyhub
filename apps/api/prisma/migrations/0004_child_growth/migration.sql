CREATE TABLE "GrowthRecord" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "measuredOn" DATE NOT NULL,
  "weightKg" DECIMAL(6,2),
  "heightCm" DECIMAL(6,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthRecord_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GrowthRecord_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GrowthRecord_familyId_childId_measuredOn_idx" ON "GrowthRecord"("familyId", "childId", "measuredOn");
