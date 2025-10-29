import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { User, UpsertUser } from "@shared/schema";
import { storage } from "../storage";

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Register a new user with email/password
 * Creates user with unverified email and sends verification token
 */
export async function registerUser(input: RegisterInput): Promise<{
  user: User;
  verificationToken: string;
}> {
  const { email, password, firstName, lastName } = input;

  // Validate email format
  if (!email || !email.includes("@")) {
    throw new Error("Invalid email address");
  }

  // Validate password strength (min 8 chars)
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  // Check if user already exists
  const existingUser = await storage.getUserByEmail(email);
  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Generate verification token (expires in 24 hours)
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Create user
  const userInput: UpsertUser = {
    email,
    password: hashedPassword,
    firstName: firstName || null,
    lastName: lastName || null,
    emailVerified: false,
    authProvider: "local",
    verificationToken,
    verificationTokenExpires,
  };

  const user = await storage.createUser(userInput);

  return {
    user,
    verificationToken,
  };
}

/**
 * Login user with email/password
 * Checks credentials and email verification status
 */
export async function loginUser(input: LoginInput): Promise<User> {
  const { email, password } = input;

  // Find user
  const user = await storage.getUserByEmail(email);
  if (!user) {
    throw new Error("Invalid email or password");
  }

  // Check if user registered with local auth
  if (user.authProvider !== "local" || !user.password) {
    throw new Error(`This account uses ${user.authProvider} login. Please use the ${user.authProvider} button.`);
  }

  // Verify password
  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    throw new Error("Invalid email or password");
  }

  // Check email verification
  if (!user.emailVerified) {
    throw new Error("Please verify your email before logging in. Check your inbox for the verification link.");
  }

  return user;
}

/**
 * Verify user email with token
 * Returns verified user or throws error
 */
export async function verifyEmail(token: string): Promise<User> {
  if (!token) {
    throw new Error("Verification token is required");
  }

  // Find user by token
  const user = await storage.getUserByVerificationToken(token);
  if (!user) {
    throw new Error("Invalid or expired verification token");
  }

  // Check token expiration
  if (user.verificationTokenExpires && user.verificationTokenExpires < new Date()) {
    throw new Error("Verification token has expired. Please request a new one.");
  }

  // Mark email as verified and clear token
  const updatedUser = await storage.updateUser(user.id, {
    emailVerified: true,
    verificationToken: null,
    verificationTokenExpires: null,
  });

  return updatedUser;
}

/**
 * Resend verification email
 * Generates new token and extends expiration
 */
export async function resendVerificationEmail(email: string): Promise<{
  user: User;
  verificationToken: string;
}> {
  const user = await storage.getUserByEmail(email);
  if (!user) {
    throw new Error("User not found");
  }

  if (user.emailVerified) {
    throw new Error("Email is already verified");
  }

  // Generate new verification token
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const updatedUser = await storage.updateUser(user.id, {
    verificationToken,
    verificationTokenExpires,
  });

  return {
    user: updatedUser,
    verificationToken,
  };
}
