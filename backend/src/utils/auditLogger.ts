import { PrismaClient } from "@prisma/client";
import { logger } from "../lib/logger";

const prisma = new PrismaClient();

/**
 * Utility to log administrative actions for audit purposes.
 * 
 * @param adminId - The ID of the admin performing the action
 * @param action - The name of the action (e.g., "SUSPEND_USER")
 * @param target - The ID or identifier of the target entity
 * @param metadata - Optional additional JSON metadata about the action
 */
export const logAdminAction = async (
    adminId: string,
    action: string,
    target: string,
    metadata?: any
) => {
    try {
        await prisma.auditLog.create({
            data: {
                adminId,
                action,
                target,
                metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
            },
        });
    } catch (error) {
        logger.error({ err: error }, "Failed to create audit log");
        // We don't throw here to avoid failing the main request if logging fails,
        // though in a production system we might want stricter guarantees.
    }
};
