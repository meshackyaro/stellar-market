-- AlterTable: add milestoneId column to Attachment
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "milestoneId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attachment_milestoneId_idx" ON "Attachment"("milestoneId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_milestoneId_fkey"
    FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
