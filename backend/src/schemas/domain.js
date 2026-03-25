const { z } = require("zod");

const zoneUpdateSchema = z.object({
  mode: z.enum(["auto", "manual"]).optional(),
  humidityThresholdMin: z.number().min(0).max(100).optional(),
  humidityThresholdMax: z.number().min(0).max(100).optional(),
  name: z.string().min(1).max(80).optional()
});

const irrigationStartSchema = z.object({
  triggeredBy: z.enum(["manual", "schedule", "auto-threshold"]).default("manual")
});

const irrigationStopSchema = z.object({
  volumeLiters: z.number().positive().max(100000).optional(),
  status: z.enum(["success", "cancelled", "error"]).default("success")
});

const scheduleCreateSchema = z.object({
  zoneId: z.string().uuid(),
  name: z.string().max(80).optional(),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  recurrence: z.enum(["daily", "weekly", "custom"]),
  recurrenceMeta: z.record(z.any()).optional(),
  active: z.boolean().default(true)
});

const scheduleUpdateSchema = z.object({
  name: z.string().max(80).optional(),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  recurrence: z.enum(["daily", "weekly", "custom"]).optional(),
  recurrenceMeta: z.record(z.any()).optional(),
  active: z.boolean().optional()
});

const sensorIngestSchema = z.object({
  zoneId: z.string().uuid(),
  humidity: z.number().min(0).max(100),
  temperature: z.number().min(-50).max(120),
  valveStatus: z.boolean(),
  flowRate: z.number().min(0).max(5000).optional(),
  recordedAt: z.string().datetime().optional()
});

module.exports = {
  zoneUpdateSchema,
  irrigationStartSchema,
  irrigationStopSchema,
  scheduleCreateSchema,
  scheduleUpdateSchema,
  sensorIngestSchema
};
