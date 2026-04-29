-- Migration: Add PARTIALLY_PAID to MilestoneStatus enum
-- Issue #413: Support partial payment milestone status from escrow contract

ALTER TYPE "MilestoneStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';
