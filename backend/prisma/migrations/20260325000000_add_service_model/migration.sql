-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "deliveryDays" INTEGER NOT NULL,
    "skills" TEXT[],
    "freelancerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Service_freelancerId_idx" ON "Service"("freelancerId");

-- CreateIndex
CREATE INDEX "Service_category_idx" ON "Service"("category");

-- CreateIndex
CREATE INDEX "Service_createdAt_idx" ON "Service"("createdAt");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
