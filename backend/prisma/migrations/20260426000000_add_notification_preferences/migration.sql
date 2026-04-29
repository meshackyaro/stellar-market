-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_RELEASED';

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailDisputeOpened" BOOLEAN NOT NULL DEFAULT true,
    "emailMilestoneApproved" BOOLEAN NOT NULL DEFAULT true,
    "emailPaymentReleased" BOOLEAN NOT NULL DEFAULT true,
    "emailApplicationAccepted" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
