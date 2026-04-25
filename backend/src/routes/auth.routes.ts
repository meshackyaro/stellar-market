import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { generateSecret, verifySync, generateURI } from "otplib";
import QRCode from "qrcode";
import { config } from "../config";
import { validate } from "../middleware/validation";
import { authenticate, AuthRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/error";
import { encrypt, decrypt } from "../utils/encryption";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailParamSchema,
  twoFactorVerifySchema,
  twoFactorDisableSchema,
  twoFactorValidateSchema,
} from "../schemas";
import { generateToken, hashToken } from "../utils/token";
import { sendPasswordResetEmail, sendVerificationEmail } from "../utils/email";

const router = Router();
/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */
const prisma = new PrismaClient();

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
/** Single-use recovery codes issued when 2FA is enabled or regenerated (bcrypt-hashed in DB). */
const RECOVERY_CODE_COUNT = 10;

async function generateRecoveryCodeSets(): Promise<{ plain: string[]; hashed: string[] }> {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = crypto.randomBytes(4).toString("hex");
    plain.push(code);
    hashed.push(await bcrypt.hash(code, 10));
  }
  return { plain, hashed };
}

// Register a new user
router.post(
  /**
   * @swagger
   * /auth/register:
   *   post:
   *     summary: Register a new user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RegisterRequest'
   *           examples:
   *             example:
   *               value:
   *                 email: user@example.com
   *                 password: password123
   *                 stellarAddress: GABCD123...
   *                 name: John Doe
   *                 role: FREELANCER
   *     responses:
   *       201:
   *         description: User registered successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/RegisterResponse'
   *       409:
   *         description: User already exists
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  /**
   * @swagger
   * /auth/login:
   *   post:
   *     summary: Login user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/LoginRequest'
   *           examples:
   *             example:
   *               value:
   *                 email: user@example.com
   *                 password: password123
   *     responses:
   *       200:
   *         description: Login successful
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/LoginResponse'
   *       401:
   *         description: Invalid credentials
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  "/register",
  validate({ body: registerSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { stellarAddress, email, name, password, role } = req.body;

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { walletAddress: stellarAddress },
          { username: name },
          ...(email ? [{ email }] : []),
        ],
      },
    });

    if (existingUser) {
      return res.status(409).json({ error: "User already exists." });
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    const rawToken = generateToken();
    const hashed = hashToken(rawToken);

    const user = await prisma.user.create({
      data: {
        walletAddress: stellarAddress,
        email,
        username: name,
        password: hashedPassword,
        role: role ?? "FREELANCER",
        emailVerified: false,
        emailVerificationToken: hashed,
      },
    });

    if (email) {
      await sendVerificationEmail(email, rawToken);
    }

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, {
      expiresIn: "7d",
    });

    res.status(201).json({
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        username: user.username,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      },
      token,
    });
  }),
);

// Login
router.post(
  "/login",
  validate({ body: loginSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.password) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // Check if user is suspended
    if (user.isSuspended) {
      return res.status(403).json({
        error: "Account suspended.",
        reason: user.suspendReason || "Your account has been suspended.",
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign(
        { userId: user.id, purpose: "2fa_pending" },
        config.jwtSecret,
        { expiresIn: "5m" },
      );
      return res.json({ requiresTwoFactor: true, tempToken });
    }

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, {
      expiresIn: "7d",
    });

    res.json({
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      token,
    });
  }),
);

// ─── 2FA Endpoints ──────────────────────────────────────────────────────────

// POST /2fa/setup — Generate TOTP secret and QR code
router.post(
  "/2fa/setup",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: "2FA is already enabled." });
    }

    const secret = generateSecret();
    const encryptedSecret = encrypt(secret);

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        twoFactorSecret: encryptedSecret,
        backupCodes: [],
      },
    });

    const otpAuthUrl = generateURI({
      strategy: "totp",
      secret,
      issuer: "StellarMarket",
      label: user.email || user.username,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    res.json({
      qrCode: qrCodeDataUrl,
      secret,
    });
  }),
);

// POST /2fa/verify — Verify TOTP code, enable 2FA, return one-time recovery codes
const twoFactorEnableHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  if (user.twoFactorEnabled) {
    return res.status(400).json({ error: "2FA is already enabled." });
  }

  if (!user.twoFactorSecret) {
    return res.status(400).json({ error: "2FA setup not initiated. Call /2fa/setup first." });
  }

  const secret = decrypt(user.twoFactorSecret);
  const result = verifySync({ token: req.body.code, secret });

  if (!result.valid) {
    return res.status(400).json({ error: "Invalid verification code." });
  }

  const { plain: recoveryCodes, hashed } = await generateRecoveryCodeSets();

  await prisma.user.update({
    where: { id: req.userId },
    data: { twoFactorEnabled: true, backupCodes: hashed },
  });

  res.json({
    message: "2FA has been enabled successfully.",
    recoveryCodes,
  });
});

router.post(
  "/2fa/verify",
  authenticate,
  validate({ body: twoFactorVerifySchema }),
  twoFactorEnableHandler,
);

// POST /2fa/enable — Alias for verify (TOTP confirmation + recovery codes on first enable)
router.post(
  "/2fa/enable",
  authenticate,
  validate({ body: twoFactorVerifySchema }),
  twoFactorEnableHandler,
);

// POST /2fa/regenerate — New recovery codes (requires current TOTP); invalidates existing codes
router.post(
  "/2fa/regenerate",
  authenticate,
  validate({ body: twoFactorVerifySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ error: "2FA is not enabled." });
    }

    const secret = decrypt(user.twoFactorSecret);
    const result = verifySync({ token: req.body.code, secret });
    if (!result.valid) {
      return res.status(400).json({ error: "Invalid verification code." });
    }

    const { plain: recoveryCodes, hashed } = await generateRecoveryCodeSets();

    await prisma.user.update({
      where: { id: req.userId },
      data: { backupCodes: hashed },
    });

    res.json({
      message: "Recovery codes have been regenerated. Store them securely; old codes no longer work.",
      recoveryCodes,
    });
  }),
);

// POST /2fa/disable — Disable 2FA (requires password)
router.post(
  "/2fa/disable",
  authenticate,
  validate({ body: twoFactorDisableSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ error: "2FA is not enabled." });
    }

    if (!user.password) {
      return res.status(400).json({ error: "Password not set for this account." });
    }

    const validPassword = await bcrypt.compare(req.body.password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid password." });
    }

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        backupCodes: [],
      },
    });

    res.json({ message: "2FA has been disabled." });
  }),
);

// POST /2fa/validate — Validate TOTP or recovery code during login
router.post(
  "/2fa/validate",
  validate({ body: twoFactorValidateSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { code, tempToken } = req.body;

    let decoded: { userId: string; purpose?: string };
    try {
      decoded = jwt.verify(tempToken, config.jwtSecret) as { userId: string; purpose?: string };
    } catch {
      return res.status(401).json({ error: "Invalid or expired temporary token." });
    }

    if (decoded.purpose !== "2fa_pending") {
      return res.status(401).json({ error: "Invalid token type." });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(401).json({ error: "Invalid request." });
    }

    const secret = decrypt(user.twoFactorSecret);

    // Try TOTP code first (6-digit)
    if (/^\d{6}$/.test(code)) {
      const result = verifySync({ token: code, secret });
      if (result.valid) {
        const token = jwt.sign({ userId: user.id }, config.jwtSecret, {
          expiresIn: "7d",
        });
        return res.json({
          user: {
            id: user.id,
            walletAddress: user.walletAddress,
            username: user.username,
            email: user.email,
            role: user.role,
          },
          token,
        });
      }
    }

    // Try recovery (backup) codes — 8-char hex, distinct from 6-digit TOTP
    const recoveryInput = code.trim().toLowerCase();
    for (let i = 0; i < user.backupCodes.length; i++) {
      const match = await bcrypt.compare(recoveryInput, user.backupCodes[i]);
      if (match) {
        // Consume the backup code
        const updatedCodes = [...user.backupCodes];
        updatedCodes.splice(i, 1);
        await prisma.user.update({
          where: { id: user.id },
          data: { backupCodes: updatedCodes },
        });

        const token = jwt.sign({ userId: user.id }, config.jwtSecret, {
          expiresIn: "7d",
        });
        return res.json({
          user: {
            id: user.id,
            walletAddress: user.walletAddress,
            username: user.username,
            email: user.email,
            role: user.role,
          },
          token,
        });
      }
    }

    return res.status(401).json({ error: "Invalid verification code." });
  }),
);

// ─── Password Reset & Email Verification ────────────────────────────────────

// Forgot password — generates hashed reset token, sends email
router.post(
  "/forgot-password",
  validate({ body: forgotPasswordSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: "If the email exists, a reset link has been sent." });
    }

    const rawToken = generateToken();
    const hashed = hashToken(rawToken);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashed,
        passwordResetExpiry: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
      },
    });

    await sendPasswordResetEmail(email, rawToken);

    res.json({ message: "If the email exists, a reset link has been sent." });
  }),
);

// Reset password — validates token + expiry, updates password
router.post(
  "/reset-password",
  validate({ body: resetPasswordSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = req.body;

    const hashed = hashToken(token);

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: hashed,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    res.json({ message: "Password has been reset successfully." });
  }),
);

// Send verification email — requires authentication
router.post(
  "/send-verification",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user || !user.email) {
      return res.status(400).json({ error: "No email address on account." });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: "Email is already verified." });
    }

    const rawToken = generateToken();
    const hashed = hashToken(rawToken);

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: hashed },
    });

    await sendVerificationEmail(user.email, rawToken);

    res.json({ message: "Verification email sent." });
  }),
);

// Verify email — validates token and marks email as verified
router.get(
  "/verify-email/:token",
  validate({ params: verifyEmailParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const token = req.params.token as string;

    const hashed = hashToken(token);

    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: hashed },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid verification token." });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
      },
    });

    res.json({ message: "Email verified successfully." });
  }),
);

export default router;
