const express = require("express");

const authRoutes = require("./auth");
const zoneRoutes = require("./zones");
const irrigationRoutes = require("./irrigation");
const scheduleRoutes = require("./schedules");
const historyRoutes = require("./history");
const sensorRoutes = require("./sensors");
const notificationRoutes = require("./notifications");
const dashboardRoutes = require("./dashboard");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/zones", zoneRoutes);
router.use("/zones", irrigationRoutes);
router.use("/schedules", scheduleRoutes);
router.use("/irrigation-events", historyRoutes);
router.use("/sensors", sensorRoutes);
router.use("/notifications", notificationRoutes);
router.use("/dashboard", dashboardRoutes);

module.exports = router;
