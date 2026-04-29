-- AlterEnum
-- Rename Vote table to DisputeVote
ALTER TABLE "Vote" RENAME TO "DisputeVote";

-- AlterEnum
-- Update DisputeStatus enum
ALTER TYPE "DisputeStatus" RENAME TO "DisputeStatus_old";
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- AlterTable Dispute - Add new columns
ALTER TABLE "Dispute" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Dispute" ADD COLUMN "freelancerId" TEXT;

-- Populate clientId and freelancerId from Job
UPDATE "Dispute" d
SET "clientId" = j."clientId",
    "freelancerId" = j."freelancerId"
FROM "Job" j
WHERE d."jobId" = j.id;

-- Make clientId and freelancerId NOT NULL
ALTER TABLE "Dispute" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "Dispute" ALTER COLUMN "freelancerId" SET NOT NULL;

-- Rename contractDisputeId to onChainDisputeId
ALTER TABLE "Dispute" RENAME COLUMN "contractDisputeId" TO "onChainDisputeId";

-- Update status column to use new enum
ALTER TABLE "Dispute" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Dispute" ALTER COLUMN "status" TYPE "DisputeStatus" USING (
  CASE 
    WHEN "status"::text = 'OPEN' THEN 'OPEN'::DisputeStatus
    WHEN "status"::text = 'REVIEWING' THEN 'IN_PROGRESS'::DisputeStatus
    WHEN "status"::text = 'VOTING' THEN 'IN_PROGRESS'::DisputeStatus
    WHEN "status"::text = 'RESOLVED_CLIENT' THEN 'RESOLVED'::DisputeStatus
    WHEN "status"::text = 'RESOLVED_FREELANCER' THEN 'RESOLVED'::DisputeStatus
    WHEN "status"::text = 'OVERRIDDEN_BY_ADMIN' THEN 'RESOLVED'::DisputeStatus
    ELSE 'OPEN'::DisputeStatus
  END
);
ALTER TABLE "Dispute" ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- Drop old enum
DROP TYPE "DisputeStatus_old";

-- Drop deprecated columns
ALTER TABLE "Dispute" DROP COLUMN "respondentId";
ALTER TABLE "Dispute" DROP COLUMN "votesForClient";
ALTER TABLE "Dispute" DROP COLUMN "votesForFreelancer";
ALTER TABLE "Dispute" DROP COLUMN "minVotes";
ALTER TABLE "Dispute" DROP COLUMN "escalated";

-- Add foreign key constraints for new columns
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create indexes for new columns
CREATE INDEX "Dispute_clientId_idx" ON "Dispute"("clientId");
CREATE INDEX "Dispute_freelancerId_idx" ON "Dispute"("freelancerId");

-- Drop old index for respondentId
DROP INDEX IF EXISTS "Dispute_respondentId_idx";
