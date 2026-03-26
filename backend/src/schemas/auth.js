const { z } = require("zod");

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30),
  password: z.string().min(8).max(100),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  phone: z.string().max(30).optional(),
  language: z.enum(["fr", "en", "ar"]).default("fr"),
  notificationPreference: z.enum(["all", "important", "none"]).default("all")
});

const loginSchema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100)
});

const profileUpdateSchema = z.object({
  firstName: z.string().min(1).max(60).optional(),
  lastName: z.string().min(1).max(60).optional(),
  phone: z.string().max(30).nullable().optional(),
  language: z.enum(["fr", "en", "ar"]).optional(),
  notificationPreference: z.enum(["all", "important", "none"]).optional()
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  profileUpdateSchema
};
