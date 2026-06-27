require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const {
  initDatabase,
  isDatabaseReady,
  getDatabaseInfo,
  addLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLeadById,
  createDocument,
  createAlert,
  updateAlertStatus,
  deleteAlertById,
  deleteAlerts,
  getAlertById,
  getAlerts,
  getDueAlerts,
  registerAgent,
  authenticateAgent,
  createPasswordResetToken,
  resetAgentPassword
} = require("./db");
const {
  generateRecommendation,
  landPackages,
  projectFeatures
} = require("./services/ruleEngine");
const {
  getEmailStatus,
  verifyEmailConnection,
  sendCustomerEmail
} = require("./services/emailService");

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));
app.use(express.json());
app.use(morgan("dev"));

const STATUSES = ["New", "Contacted", "Interested", "Site Visit", "Booking", "Payment"];
const ACTIVE_BOOKING_STATUSES = ["Site Visit", "Booking", "Payment"];
const BOOKING_BLOCKING_STATUSES = STATUSES;
const SLOT_OPTIONS = [
  "10:00 AM - Phone follow-up",
  "11:30 AM - Site visit discussion",
  "02:30 PM - Document verification",
  "04:00 PM - Package explanation",
  "05:30 PM - Booking confirmation"
];


function pad2(value) {
  return String(value).padStart(2, "0");
}

function todayLocalDate() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function getLeadDate(lead) {
  return String(lead.nextFollowUpDate || "").slice(0, 10);
}

function getLeadSlot(lead) {
  return String(lead.preferredSlot || "").trim();
}

async function getAvailabilityForDate(date, excludeLeadId = "") {
  const targetDate = String(date || "").slice(0, 10);
  if (!targetDate) {
    return { date: "", slots: SLOT_OPTIONS.map((time) => ({ time, available: true, bookedBy: null })) };
  }

  const leads = await getLeads();
  const bookedLeads = leads.filter((lead) =>
    lead.id !== excludeLeadId &&
    getLeadDate(lead) === targetDate &&
    getLeadSlot(lead) &&
    BOOKING_BLOCKING_STATUSES.includes(lead.status)
  );

  const slots = SLOT_OPTIONS.map((time) => {
    const booked = bookedLeads.find((lead) => getLeadSlot(lead) === time);
    return {
      time,
      available: !booked,
      bookedBy: booked ? { id: booked.id, name: booked.name, phone: booked.phone, status: booked.status } : null
    };
  });

  return { date: targetDate, slots, bookedCount: bookedLeads.length };
}

async function validateBookingConflict({ nextFollowUpDate, preferredSlot, excludeLeadId = "" }) {
  const targetDate = String(nextFollowUpDate || "").slice(0, 10);
  const targetSlot = String(preferredSlot || "").trim();

  if (!targetDate || !targetSlot) {
    return { valid: true, conflict: null, message: "No exact slot selected; conflict check skipped." };
  }

  const availability = await getAvailabilityForDate(targetDate, excludeLeadId);
  const selectedSlot = availability.slots.find((slot) => slot.time === targetSlot);

  if (!selectedSlot) {
    return { valid: false, conflict: null, message: "Selected slot is not available in the official slot list." };
  }

  if (!selectedSlot.available) {
    return {
      valid: false,
      conflict: selectedSlot.bookedBy,
      message: `Slot conflict: ${targetSlot} on ${targetDate} is already booked for ${selectedSlot.bookedBy.name}.`
    };
  }

  return { valid: true, conflict: null, message: "Slot is available for follow-up, site visit, or booking." };
}

function buildNotificationMessage(lead, type = "followup") {
  const packageName = lead.recommendation?.selectedPackage?.name || "suggested red sandal farm land package";
  const date = lead.nextFollowUpDate || "your selected date";
  const slot = lead.preferredSlot || "preferred slot";
  const amount = lead.payment?.amountPaid ? ` Payment received: ₹${lead.payment.amountPaid}.` : "";

  if (type === "confirmation") {
    return `Dear ${lead.name}, thank you for your enquiry with Lohitha Dharma Projects. We have saved your requirement for ${packageName}. Our team will contact you on ${date} at ${slot}.`;
  }

  if (type === "booking") {
    return `Dear ${lead.name}, your booking discussion for ${packageName} is scheduled on ${date} at ${slot}. Our agent will share document and payment details.${amount}`;
  }

  if (type === "payment") {
    return `Dear ${lead.name}, thank you for your payment update for ${packageName}.${amount} Our team will verify and update your booking status.`;
  }

  if (type === "reminder") {
    return `Reminder for ${lead.name}: follow up on ${date} at ${slot}. Discuss ${packageName}, update status, and record the next action in CRM.`;
  }

  return `Dear ${lead.name}, this is a follow-up reminder from Lohitha Dharma Projects. Your next follow-up is on ${date} at ${slot} for ${packageName}.`;
}


function buildEmailSubject(lead, type = "followup") {
  const packageName = lead.recommendation?.selectedPackage?.name || "CRM enquiry";
  if (type === "confirmation") return `Enquiry confirmation - ${packageName}`;
  if (type === "booking") return `Booking / site visit confirmation - ${packageName}`;
  if (type === "payment") return `Payment update confirmation - ${packageName}`;
  if (type === "followup") return `Follow-up reminder - ${packageName}`;
  return `CRM update - ${packageName}`;
}

function shouldSendCustomerEmail(item) {
  return ["confirmation", "booking", "payment", "followup"].includes(item.type);
}

async function getEmailStatusForPlanItem(lead, item) {
  if (!shouldSendCustomerEmail(item)) return { status: "Agent Reminder", emailResult: null };
  if (!lead.email) return { status: "No Customer Email", emailResult: null };

  try {
    const emailResult = await sendCustomerEmail({
      to: lead.email,
      subject: buildEmailSubject(lead, item.type),
      text: item.message
    });
    return { status: emailResult.status || "Email Sent", emailResult };
  } catch (error) {
    return { status: "Email Failed", emailResult: { sent: false, error: error.message } };
  }
}

function buildAutomatedMessagePlan(lead, trigger = "manual") {
  const plan = [];
  const status = lead.status || "New";
  const dueAt = lead.nextFollowUpDate || null;

  if (["created", "manual", "process"].includes(trigger)) {
    plan.push({
      type: "confirmation",
      channel: "WhatsApp/Email Preview",
      message: buildNotificationMessage(lead, "confirmation"),
      dueAt: null
    });
  }

  if (lead.nextFollowUpDate) {
    plan.push({
      type: "reminder",
      channel: "Agent Reminder",
      message: buildNotificationMessage(lead, "reminder"),
      dueAt
    });
    plan.push({
      type: "followup",
      channel: "WhatsApp/Email Preview",
      message: buildNotificationMessage(lead, "followup"),
      dueAt
    });
  }

  if (["Site Visit", "Booking"].includes(status) || trigger === "booking") {
    plan.push({
      type: "booking",
      channel: "WhatsApp/Email Preview",
      message: buildNotificationMessage(lead, "booking"),
      dueAt
    });
  }

  if (status === "Payment" || trigger === "payment" || lead.payment?.status && lead.payment.status !== "Pending") {
    plan.push({
      type: "payment",
      channel: "WhatsApp/Email Preview",
      message: buildNotificationMessage(lead, "payment"),
      dueAt: null
    });
  }

  const seen = new Set();
  return plan.filter((item) => {
    const key = `${item.type}|${item.channel}|${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function createAutomatedMessagesForLead(leadId, trigger = "manual") {
  const lead = await getLeadById(leadId);
  if (!lead) return { lead: null, alerts: [] };

  const plan = buildAutomatedMessagePlan(lead, trigger);
  const alerts = [];
  for (const item of plan) {
    const emailStatus = await getEmailStatusForPlanItem(lead, item);
    const alert = await createAlert(lead.id, {
      ...item,
      channel: shouldSendCustomerEmail(item) ? "Email API + WhatsApp Preview" : item.channel,
      status: emailStatus.status || "Automated"
    });
    alerts.push({ ...alert, emailResult: emailStatus.emailResult });
  }

  return { lead, alerts };
}

function required(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidGmail(value) {
  return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(String(value || "").trim());
}

function isStrongPassword(value) {
  return String(value || "").length >= 6;
}

function isValidPhone(value) {
  return /^\d{10}$/.test(String(value || "").trim());
}

function validateLead(body) {
  const errors = [];
  const phone = cleanPhone(body.phone);
  if (!required(body.name)) errors.push("Name is required");
  if (!required(body.phone)) errors.push("Phone is required");
  if (required(body.phone) && !isValidPhone(phone)) errors.push("Phone number must contain exactly 10 digits");
  if (required(body.email) && !isValidEmail(body.email)) errors.push("Valid email address is required");
  if (!required(body.status)) errors.push("Status is required");
  if (!STATUSES.includes(body.status)) errors.push("Invalid status");
  if (!required(body.nextFollowUpDate)) errors.push("Next follow-up date is required");
  return errors;
}

function sanitizeLeadPayload(body, recommendation, now) {
  return {
    name: String(body.name || "").trim(),
    phone: cleanPhone(body.phone),
    email: String(body.email || "").trim(),
    budget: body.budget || "",
    area: body.area || "",
    timeline: body.timeline || "",
    source: body.source || "Manual Entry",
    status: body.status || "New",
    interestLevel: body.interestLevel || "Medium",
    preferredPackageId: body.preferredPackageId || "",
    nextFollowUpDate: body.nextFollowUpDate,
    preferredSlot: body.preferredSlot || "",
    notes: body.notes || "",
    documentTitle: body.documentTitle || "",
    documentUrl: body.documentUrl || "",
    documentType: body.documentType || "Customer Document",
    recommendation,
    leadScore: recommendation.leadScore,
    priority: recommendation.priority,
    payment: { status: "Pending" },
    updatedAt: now
  };
}

function csvEscape(value) {
  const safe = value === undefined || value === null ? "" : String(value);
  if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function toCsv(leads) {
  const headers = ["Name", "Phone", "Email", "Budget", "Area", "Timeline", "Status", "Priority", "Score", "Follow-up Date", "Preferred Slot", "Source", "Created At"];
  const rows = leads.map((lead) => [
    lead.name,
    lead.phone,
    lead.email,
    lead.budget,
    lead.area,
    lead.timeline,
    lead.status,
    lead.priority,
    lead.leadScore,
    lead.nextFollowUpDate,
    lead.preferredSlot,
    lead.source,
    lead.createdAt
  ]);
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Agent Follow-up CRM Backend is running",
    database: "PostgreSQL",
    databaseInfo: getDatabaseInfo(),
    aiLayer: "Rule-based recommendation engine with OpenAI/Gemini-ready integration point",
    portals: ["agent", "admin"],
    technologyStack: [
      {
        layer: "Frontend",
        technology: "HTML, CSS, React",
        role: "Booking calendar, availability screen, customer form, confirmation page, admin booking list"
      },
      {
        layer: "Backend",
        technology: "Node.js Express",
        role: "Availability APIs, booking validation, conflict prevention for all scheduled leads, payment/status tracking, notification logic"
      },
      {
        layer: "AI Layer",
        technology: "Rule-based prompts / OpenAI-Gemini ready",
        role: "Suggests suitable slots/packages and generates booking confirmation messages"
      },
      {
        layer: "Database",
        technology: "PostgreSQL",
        role: "Stores leads, buyers, enquiries, budgets, areas, timelines, documents, scores, alerts, payments, and follow-up history"
      },
      {
        layer: "Messaging/Reports",
        technology: "Email API / WhatsApp preview plus CSV export",
        role: "Automated reminders, confirmations, and follow-up messages are generated and email is sent when SMTP is configured"
      }
    ]
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: isDatabaseReady() ? "ok" : "database-not-connected",
    database: getDatabaseInfo(),
    emailApi: getEmailStatus(),
    time: new Date().toISOString()
  });
});

app.get("/api/email/status", (req, res) => {
  res.json({ success: true, emailApi: getEmailStatus() });
});

app.post("/api/email/test", async (req, res) => {
  try {
    await verifyEmailConnection();
    const to = req.body?.to || process.env.SMTP_USER;
    const emailResult = await sendCustomerEmail({
      to,
      subject: "Agent Follow-up CRM Email API Test",
      text: "Email API is connected successfully. Automated confirmations, reminders, and follow-up messages can now be sent from the CRM."
    });
    res.json({ success: true, message: "Test email sent successfully", emailResult });
  } catch (error) {
    res.status(500).json({ success: false, message: "Test email failed", error: error.message, emailApi: getEmailStatus() });
  }
});

app.post("/api/email/alerts/:id/send", async (req, res) => {
  try {
    const alert = await getAlertById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: "Alert not found" });
    if (!alert.leadEmail) return res.status(400).json({ success: false, message: "Customer email is missing for this lead" });

    const emailResult = await sendCustomerEmail({
      to: alert.leadEmail,
      subject: req.body?.subject || `CRM ${alert.type} message`,
      text: alert.message
    });
    const updatedAlert = await updateAlertStatus(alert.id, emailResult.status || "Email Sent");
    res.json({ success: true, message: "Email sent successfully", emailResult, alert: updatedAlert });
  } catch (error) {
    await updateAlertStatus(req.params.id, "Email Failed").catch(() => null);
    res.status(500).json({ success: false, message: "Email send failed", error: error.message });
  }
});

app.post("/api/auth/agent-register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!required(name) || !required(email) || !required(password)) {
      return res.status(400).json({ success: false, message: "Name, Gmail, and password are required" });
    }

    if (!isValidGmail(email)) {
      return res.status(400).json({ success: false, message: "Only Gmail addresses are allowed, example: name@gmail.com" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const agent = await registerAgent({ name, email, password });

    res.status(201).json({
      success: true,
      role: "agent",
      agent,
      message: "Agent registered successfully"
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Registration failed" });
  }
});

app.post("/api/auth/agent-login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!required(email) || !required(password)) {
      return res.status(400).json({ success: false, message: "Gmail and password are required" });
    }

    if (!isValidGmail(email)) {
      return res.status(400).json({ success: false, message: "Only Gmail addresses are allowed, example: name@gmail.com" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const agent = await authenticateAgent({ email, password });

    res.json({
      success: true,
      role: "agent",
      agent,
      message: "Agent login successful"
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Login failed" });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!required(email)) {
      return res.status(400).json({ success: false, message: "Gmail address is required" });
    }

    if (!isValidGmail(email)) {
      return res.status(400).json({ success: false, message: "Only Gmail addresses are allowed, example: name@gmail.com" });
    }

    const reset = await createPasswordResetToken(email);
    const resetLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}?resetToken=${encodeURIComponent(reset.token)}`;
    let emailResult = { sent: false, status: "Email Disabled" };

    try {
      emailResult = await sendCustomerEmail({
        to: reset.agent.email,
        subject: "Reset your CRM password",
        text: `Hello ${reset.agent.name},\n\nUse this link to reset your password. The link expires in 30 minutes:\n${resetLink}\n\nIf you did not request this, you can ignore this email.`
      });
    } catch (emailError) {
      emailResult = { sent: false, status: "Email Failed", error: emailError.message };
    }

    res.json({
      success: true,
      message: emailResult.sent
        ? "Password reset link sent to your Gmail."
        : "Email is disabled/not configured. Use the development reset link shown below.",
      emailResult,
      resetLink: emailResult.sent ? undefined : resetLink,
      expiresAt: reset.expiresAt
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Forgot password failed" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body || {};

    if (!required(token) || !required(password)) {
      return res.status(400).json({ success: false, message: "Reset token and new password are required" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const agent = await resetAgentPassword({ token, password });
    res.json({ success: true, agent, message: "Password reset successful. Please login with your new password." });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Password reset failed" });
  }
});

app.post("/api/auth/customer-login", (req, res) => {
  res.status(410).json({ success: false, message: "Customer portal has been removed. Use Agent/Admin login and Lead Entry form." });
});

app.get("/api/packages", (req, res) => {
  res.json({ success: true, packages: landPackages, features: projectFeatures });
});

app.get("/api/availability", async (req, res) => {
  try {
    const date = req.query.date || todayLocalDate();
    const availability = await getAvailabilityForDate(date, req.query.excludeLeadId || "");
    res.json({ success: true, ...availability });
  } catch (error) {
    res.status(500).json({ success: false, message: "Availability check failed", error: error.message });
  }
});

app.post("/api/bookings/validate", async (req, res) => {
  try {
    const result = await validateBookingConflict({
      nextFollowUpDate: req.body.nextFollowUpDate,
      preferredSlot: req.body.preferredSlot,
      excludeLeadId: req.body.leadId || ""
    });
    res.status(result.valid ? 200 : 409).json({ success: result.valid, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: "Booking validation failed", error: error.message });
  }
});

app.post("/api/notifications/preview", async (req, res) => {
  try {
    const lead = await getLeadById(req.body.leadId);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const messageText = buildNotificationMessage(lead, req.body.type || "followup");
    const alert = await createAlert(lead.id, {
      channel: req.body.channel || "WhatsApp/Email Preview",
      type: req.body.type || "followup",
      message: messageText,
      status: "Previewed",
      dueAt: lead.nextFollowUpDate || null
    });
    res.json({ success: true, channel: req.body.channel || "WhatsApp/Email Preview", message: messageText, alert });
  } catch (error) {
    res.status(500).json({ success: false, message: "Notification preview failed", error: error.message });
  }
});

app.post("/api/automation/messages/:id", async (req, res) => {
  try {
    const result = await createAutomatedMessagesForLead(req.params.id, req.body?.trigger || "manual");
    if (!result.lead) return res.status(404).json({ success: false, message: "Lead not found" });
    res.json({
      success: true,
      message: `${result.alerts.length} automated reminder/confirmation/follow-up messages generated`,
      count: result.alerts.length,
      alerts: result.alerts
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Automated message generation failed", error: error.message });
  }
});

app.get("/api/reminders/due", async (req, res) => {
  try {
    const date = req.query.date || todayLocalDate();
    const alerts = await getDueAlerts(date);
    res.json({ success: true, date, count: alerts.length, alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Due reminders failed", error: error.message });
  }
});

app.get("/api/alerts", async (req, res) => {
  try {
    const alerts = await getAlerts({ status: req.query.status, type: req.query.type, date: req.query.date });
    res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Alerts fetch failed", error: error.message });
  }
});

app.post("/api/ai/recommend", (req, res) => {
  try {
    const recommendation = generateRecommendation(req.body || {});
    res.json({ success: true, recommendation });
  } catch (error) {
    res.status(500).json({ success: false, message: "Recommendation failed", error: error.message });
  }
});

app.post("/api/leads", async (req, res) => {
  try {
    const errors = validateLead(req.body);
    if (errors.length) {
      return res.status(400).json({ success: false, message: "Validation failed", errors });
    }

    const bookingCheck = await validateBookingConflict({
      nextFollowUpDate: req.body.nextFollowUpDate,
      preferredSlot: req.body.preferredSlot
    });

    if (!bookingCheck.valid) {
      return res.status(409).json({
        success: false,
        message: bookingCheck.message,
        conflict: bookingCheck.conflict
      });
    }

    const recommendation = generateRecommendation(req.body);
    const now = new Date().toISOString();

    const leadData = {
      ...sanitizeLeadPayload(req.body, recommendation, now),
      history: [
        {
          action: "Lead Created",
          status: req.body.status,
          note: `Lead added from ${req.body.source || "Manual Entry"} and recommendation generated`,
          date: now
        }
      ],
      createdAt: now
    };

    const id = await addLead(leadData);
    const savedLead = await getLeadById(id);
    await createAutomatedMessagesForLead(id, "created");
    const lead = await getLeadById(id);

    res.status(201).json({
      success: true,
      message: "Lead created successfully",
      id,
      lead
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Server error", error: error.message });
  }
});

app.get("/api/leads", async (req, res) => {
  try {
    let leads = await getLeads();
    const { status, priority, search } = req.query;

    if (status) leads = leads.filter((lead) => lead.status === status);
    if (priority) leads = leads.filter((lead) => lead.priority === priority);
    if (search) {
      const term = String(search).toLowerCase();
      leads = leads.filter((lead) =>
        [lead.name, lead.phone, lead.email, lead.area, lead.source, lead.timeline]
          .join(" ")
          .toLowerCase()
          .includes(term)
      );
    }

    res.json({ success: true, count: leads.length, leads });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

app.get("/api/customer/leads", (req, res) => {
  res.status(410).json({ success: false, message: "Customer portal has been removed." });
});

app.put("/api/customer/leads/:id", (req, res) => {
  res.status(410).json({ success: false, message: "Customer portal has been removed." });
});

app.post("/api/leads/:id/process", async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const bookingCheck = await validateBookingConflict({
      nextFollowUpDate: req.body.nextFollowUpDate || lead.nextFollowUpDate,
      preferredSlot: req.body.preferredSlot || lead.preferredSlot,
      excludeLeadId: req.params.id
    });

    if (!bookingCheck.valid) {
      return res.status(409).json({ success: false, message: bookingCheck.message, conflict: bookingCheck.conflict });
    }

    const recommendation = generateRecommendation({ ...lead, ...req.body });
    const now = new Date().toISOString();
    const history = lead.history || [];
    const processResult = {
      recommendation,
      bookingValidation: bookingCheck,
      notificationPreview: buildNotificationMessage({ ...lead, ...req.body, recommendation }, "followup"),
      processedAt: now
    };

    await updateLead(req.params.id, {
      recommendation,
      leadScore: recommendation.leadScore,
      priority: recommendation.priority,
      processResult,
      updatedAt: now,
      history: [
        ...history,
        {
          action: "Lead Processed",
          status: req.body.status || lead.status,
          note: `${recommendation.suggestedAction}. ${bookingCheck.message}`,
          date: now
        }
      ]
    });

    const automation = await createAutomatedMessagesForLead(req.params.id, "process");

    res.json({ success: true, message: "Lead processed successfully and automated messages generated", processResult, automatedMessages: automation.alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Processing failed", error: error.message });
  }
});

app.put("/api/leads/:id/payment", async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const now = new Date().toISOString();
    const history = lead.history || [];
    const payment = {
      status: req.body.paymentStatus || "Pending",
      amountPaid: req.body.amountPaid || "",
      mode: req.body.paymentMode || "Not selected",
      receiptNote: req.body.receiptNote || "",
      updatedAt: now
    };

    const nextStatus = ["Paid", "Advance Paid", "Verified"].includes(payment.status) ? "Payment" : lead.status;

    await updateLead(req.params.id, {
      payment,
      status: nextStatus,
      updatedAt: now,
      history: [
        ...history,
        {
          action: "Payment Tracking Updated",
          status: nextStatus,
          note: `Payment status: ${payment.status}; amount: ${payment.amountPaid || "not added"}; mode: ${payment.mode}`,
          date: now
        }
      ]
    });

    await createAutomatedMessagesForLead(req.params.id, "payment");

    res.json({ success: true, message: "Payment tracking updated and payment message generated", lead: await getLeadById(req.params.id) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: "Payment update failed", error: error.message });
  }
});

app.post("/api/leads/:id/documents", async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    const document = await createDocument(req.params.id, req.body || {});
    res.status(201).json({ success: true, message: "Document saved", document });
  } catch (error) {
    res.status(500).json({ success: false, message: "Document save failed", error: error.message });
  }
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const leads = await getLeads();
    const stats = {
      total: leads.length,
      new: leads.filter((lead) => lead.status === "New").length,
      contacted: leads.filter((lead) => lead.status === "Contacted").length,
      interested: leads.filter((lead) => lead.status === "Interested").length,
      siteVisit: leads.filter((lead) => lead.status === "Site Visit").length,
      booking: leads.filter((lead) => lead.status === "Booking").length,
      payment: leads.filter((lead) => lead.status === "Payment").length,
      highPriority: leads.filter((lead) => lead.priority === "High").length,
      followupsToday: leads.filter((lead) => lead.nextFollowUpDate === todayLocalDate()).length
    };
    res.json({ success: true, stats, recentLeads: leads.slice(0, 8) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

app.get("/api/reports/summary", async (req, res) => {
  try {
    const leads = await getLeads();
    const byStatus = STATUSES.reduce((acc, status) => {
      acc[status] = leads.filter((lead) => lead.status === status).length;
      return acc;
    }, {});
    const byPriority = ["High", "Medium", "Low"].reduce((acc, priority) => {
      acc[priority] = leads.filter((lead) => lead.priority === priority).length;
      return acc;
    }, {});
    const dueAlerts = await getDueAlerts(todayLocalDate());
    res.json({
      success: true,
      total: leads.length,
      byStatus,
      byPriority,
      activeBookings: leads.filter((lead) => ACTIVE_BOOKING_STATUSES.includes(lead.status)).length,
      dueReminders: dueAlerts.length,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Report summary failed", error: error.message });
  }
});

app.get("/api/reports/leads.csv", async (req, res) => {
  try {
    const leads = await getLeads();
    res.header("Content-Type", "text/csv");
    res.attachment(`agent-followup-crm-leads-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(toCsv(leads));
  } catch (error) {
    res.status(500).json({ success: false, message: "CSV export failed", error: error.message });
  }
});

app.get("/api/leads/:id", async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    res.json({ success: true, lead });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

app.put("/api/leads/:id/status", async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Valid status is required" });
    }

    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    if (ACTIVE_BOOKING_STATUSES.includes(status)) {
      const bookingCheck = await validateBookingConflict({
        nextFollowUpDate: lead.nextFollowUpDate,
        preferredSlot: lead.preferredSlot,
        excludeLeadId: req.params.id
      });
      if (!bookingCheck.valid) {
        return res.status(409).json({ success: false, message: bookingCheck.message, conflict: bookingCheck.conflict });
      }
    }

    const now = new Date().toISOString();
    const history = lead.history || [];
    const recommendation = generateRecommendation({ ...lead, status });

    await updateLead(req.params.id, {
      status,
      recommendation,
      leadScore: recommendation.leadScore,
      priority: recommendation.priority,
      updatedAt: now,
      history: [
        ...history,
        {
          action: "Status Updated",
          status,
          note: note || `Status changed to ${status}`,
          date: now
        }
      ]
    });

    const trigger = ["Site Visit", "Booking"].includes(status) ? "booking" : "status";
    const automation = await createAutomatedMessagesForLead(req.params.id, trigger);

    res.json({ success: true, message: "Status updated successfully and required messages generated", recommendation, automatedMessages: automation.alerts });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Server error", error: error.message });
  }
});

app.post("/api/leads/:id/followup", async (req, res) => {
  try {
    const { note, nextFollowUpDate } = req.body;
    if (!required(note)) {
      return res.status(400).json({ success: false, message: "Follow-up note is required" });
    }

    const lead = await getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const now = new Date().toISOString();
    const history = lead.history || [];

    await updateLead(req.params.id, {
      nextFollowUpDate: nextFollowUpDate || lead.nextFollowUpDate,
      updatedAt: now,
      history: [
        ...history,
        {
          action: "Follow-up Added",
          status: lead.status,
          note,
          date: now
        }
      ]
    });

    await createAutomatedMessagesForLead(req.params.id, "followup");

    res.json({ success: true, message: "Follow-up added successfully and reminder generated" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Server error", error: error.message });
  }
});

app.delete("/api/leads/:id", async (req, res) => {
  try {
    const deleted = await deleteLeadById(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    res.json({ success: true, message: "Lead deleted successfully", deleted });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lead delete failed", error: error.message });
  }
});

app.delete("/api/alerts/:id", async (req, res) => {
  try {
    const deleted = await deleteAlertById(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Notification/reminder not found" });
    }
    res.json({ success: true, message: "Notification/reminder deleted successfully", deleted });
  } catch (error) {
    res.status(500).json({ success: false, message: "Notification/reminder delete failed", error: error.message });
  }
});

app.delete("/api/alerts", async (req, res) => {
  try {
    const deleted = await deleteAlerts({
      status: req.query.status,
      type: req.query.type,
      dueBefore: req.query.dueBefore
    });
    res.json({ success: true, message: "Notification/reminder history cleared", deletedCount: deleted.length, deleted });
  } catch (error) {
    res.status(500).json({ success: false, message: "Notification/reminder history clear failed", error: error.message });
  }
});

app.delete("/api/leads/:id/alerts", async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    const deleted = await deleteAlerts({ leadId: req.params.id });
    res.json({ success: true, message: "Lead notification/reminder history cleared", deletedCount: deleted.length, deleted });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lead notification/reminder history clear failed", error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

initDatabase()
  .then(() => {
    console.log("PostgreSQL connected and tables are ready");
  })
  .catch((error) => {
    console.error("PostgreSQL connection failed:", error.message);
    console.error("Check backend/.env PostgreSQL settings, then restart the backend.");
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
      console.log("Gmail register/login enabled. Register an agent from the frontend first.");
    });
  });
