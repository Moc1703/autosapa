// ===== WHATSAPP BOT - SAAS MULTI-SESSION ARCHITECTURE =====
require("dotenv").config()

const express = require("express")
const Database = require("better-sqlite3")
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js")
const crypto = require("crypto")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const fs = require("fs")
const path = require("path")
const zlib = require("zlib")
const multer = require("multer")

const app = express()
app.use(express.json({ limit: "50mb" }))

// Clean URLs (tanpa .html)
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "landing.html"))
)
app.get("/scan", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "scan.html"))
)
app.get("/app", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "app.html"))
)

// DEV ONLY: Preview app without auth (disabled in production)
if (process.env.NODE_ENV !== "production") {
  app.get("/preview-app", (req, res) => {
    const html = fs.readFileSync(
      path.join(__dirname, "public", "app.html"),
      "utf8"
    )
    // Replace script.js with preview version that doesn't redirect
    const previewHtml = html.replace(
      '<script src="script.js"></script>',
      `<script>
            // Preview mode - skip auth checks
            const API_BASE = '';
            const userId = 'preview_user';
            let groups = [];
            let contacts = [];
            let autoreplies = [];
            let templates = [];
            let commands = [];
            let schedules = [];
            let settings = { queue: true, typing: true, auth: false };
            let selectedFile = null;
            let bulkMode = false;
            let selectedBulkGroups = new Set();

            function switchTab(tab) {
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                document.querySelectorAll('.sidebar-item, .mobile-menu-item').forEach(i => i.classList.remove('active'));
                document.getElementById('tab-' + tab).classList.add('active');
                document.querySelectorAll('[data-tab="' + tab + '"]').forEach(i => i.classList.add('active'));
            }

            function toggleMobileMenu() {
                document.getElementById('mobileMenu').classList.toggle('open');
                document.getElementById('mobileMenuOverlay').classList.toggle('open');
                document.getElementById('hamburgerBtn').classList.toggle('open');
            }

            function showToast(msg, type = 'info') {
                const container = document.getElementById('toastContainer');
                const toast = document.createElement('div');
                toast.className = 'toast ' + type;
                toast.textContent = msg;
                container.appendChild(toast);
                setTimeout(() => toast.remove(), 3000);
            }

            function closeModal(id) {
                document.getElementById(id).classList.add('hidden');
            }

            function showAddGroup() { document.getElementById('addGroupModal').classList.remove('hidden'); }
            function showAddContact() { document.getElementById('addContactModal').classList.remove('hidden'); }
            function showAddReply() { document.getElementById('addReplyModal').classList.remove('hidden'); }
            function showAddSchedule() { document.getElementById('addScheduleModal').classList.remove('hidden'); }
            function showAddTemplate() { document.getElementById('addTemplateModal').classList.remove('hidden'); }
            function showAddCommand() { document.getElementById('addCommandModal').classList.remove('hidden'); }
            function showAddQuickAction() { document.getElementById('addQuickActionModal').classList.remove('hidden'); }
            function showTemplateSelect() { document.getElementById('templateSelectModal').classList.remove('hidden'); }
            function showBlacklist() { document.getElementById('blacklistModal').classList.remove('hidden'); }

            function previewImage(e) {
                if (e.target.files[0]) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        document.getElementById('imagePreview').src = ev.target.result;
                        document.getElementById('imagePreview').classList.remove('hidden');
                        document.getElementById('removeImageBtn').classList.remove('hidden');
                        document.getElementById('uploadText').textContent = e.target.files[0].name;
                    };
                    reader.readAsDataURL(e.target.files[0]);
                }
            }
            
            function removeImage() {
                document.getElementById('imagePreview').classList.add('hidden');
                document.getElementById('removeImageBtn').classList.add('hidden');
                document.getElementById('uploadText').textContent = '📷 Click to add image (optional)';
                document.getElementById('imageInput').value = '';
            }

            function toggleSelectAll() {}
            function filterGroups() {}
            function toggleSetting(s) { showToast('Preview mode - settings not saved'); }
            function toggleDarkMode() { document.body.classList.toggle('dark'); }
            function sendBroadcast() { showToast('Preview mode - cannot send', 'warning'); }
            function syncGroups() { showToast('Preview mode - cannot sync', 'warning'); }
            function discoverGroups() { showToast('Preview mode - cannot discover', 'warning'); }
            function previewMessage() {}
            function saveDraft() { showToast('Draft saved (preview)', 'success'); }
            function loadDraft() { showToast('No draft found', 'info'); }
            function loadMedia() {}
            function exportGroups() {}
            function importGroups() {}
            function toggleBulkMode() { bulkMode = !bulkMode; showToast(bulkMode ? 'Bulk mode ON' : 'Bulk mode OFF'); }
            function filterByCategory() {}
            function exportCSV() {}
            function clearHistory() { showToast('History cleared (preview)', 'success'); }
            function downloadBackup() { showToast('Backup downloaded (preview)', 'success'); }
            function restoreBackup() {}
            function viewLogs() { document.getElementById('logsModal').classList.remove('hidden'); }
            function clearMessageLogs() { showToast('Logs cleared (preview)', 'success'); }
            function switchWhatsApp() { showToast('Preview mode - cannot switch', 'warning'); }
            function logout() { showToast('Preview mode - cannot logout', 'warning'); }
            function addBlacklist() { showToast('Number blocked (preview)', 'success'); }
            function saveGroup() { showToast('Group saved (preview)', 'success'); closeModal('addGroupModal'); }
            function saveContact() { showToast('Contact saved (preview)', 'success'); closeModal('addContactModal'); }
            function saveAutoReply() { showToast('Auto reply saved (preview)', 'success'); closeModal('addReplyModal'); }
            function saveSchedule() { showToast('Schedule saved (preview)', 'success'); closeModal('addScheduleModal'); }
            function saveTemplate() { showToast('Template saved (preview)', 'success'); closeModal('addTemplateModal'); }
            function saveCommand() { showToast('Command saved (preview)', 'success'); closeModal('addCommandModal'); }
            function saveQuickAction() { showToast('Quick action saved (preview)', 'success'); closeModal('addQuickActionModal'); }
            function previewReplyImage() {}
            function previewScheduleImage() {}
            function toggleScheduleSelectAll() {}
            function bulkDeleteGroups() {}
            function loadAnalytics() {}

            // Set status to preview mode
            document.addEventListener('DOMContentLoaded', () => {
                ['statusBadge', 'statusBadgeDesktop', 'statusBadgeMobile'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.classList.remove('disconnected');
                        el.classList.add('connected');
                    }
                });
                ['statusText', 'statusTextDesktop', 'statusTextMobile'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = 'Preview Mode';
                });
            });
        </script>`
    )
    res.send(previewHtml)
  })
}
app.get("/login", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "login.html"))
)
app.get("/register", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "register.html"))
)
app.get("/dashboard", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "dashboard.html"))
)
app.get("/forgot-password", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "forgot-password.html"))
)
app.get("/reset-password", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "reset-password.html"))
)
app.get("/admin", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "admin.html"))
)

app.use(express.static("public"))

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("X-XSS-Protection", "1; mode=block")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  next()
})

// Trust proxy for rate limiting (if behind nginx/cloudflare)
app.set("trust proxy", 1)

// ===== JWT SECRET =====
const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex")
if (!process.env.JWT_SECRET) {
  console.warn(
    "⚠️  WARNING: JWT_SECRET not set in .env! Using random secret (tokens will invalidate on restart)"
  )
}

// ===== SQLITE DATABASE SETUP =====
const DB_PATH = path.join(__dirname, "data", "database.sqlite")
const db = new Database(DB_PATH)

// Create users table
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        plan TEXT DEFAULT 'trial',
        trialEndsAt TEXT,
        subscriptionEndsAt TEXT,
        maxGroups INTEGER DEFAULT 3,
        maxBroadcastPerDay INTEGER DEFAULT 50,
        broadcastToday INTEGER DEFAULT 0,
        lastBroadcastDate TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
`)

// ===== USER HELPER FUNCTIONS (SQLite) =====
const UserDB = {
  findOne: (query) => {
    if (query.email) {
      const row = db
        .prepare("SELECT * FROM users WHERE email = ?")
        .get(query.email.toLowerCase())
      return row ? UserDB._formatUser(row) : null
    }
    return null
  },

  findById: (id) => {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id)
    return row ? UserDB._formatUser(row) : null
  },

  find: () => {
    const rows = db.prepare("SELECT * FROM users ORDER BY createdAt DESC").all()
    return rows.map((row) => UserDB._formatUser(row))
  },

  create: (userData) => {
    const id = crypto.randomUUID()
    const stmt = db.prepare(`
            INSERT INTO users (id, email, password, name, plan, trialEndsAt, maxGroups, maxBroadcastPerDay, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
    stmt.run(
      id,
      userData.email.toLowerCase(),
      userData.password,
      userData.name,
      userData.plan || "trial",
      userData.trialEndsAt?.toISOString() || null,
      userData.limits?.maxGroups || 3,
      userData.limits?.maxBroadcastPerDay || 50,
      new Date().toISOString()
    )
    return UserDB.findById(id)
  },

  update: (id, updates) => {
    const fields = []
    const values = []

    if (updates.password !== undefined) {
      fields.push("password = ?")
      values.push(updates.password)
    }
    if (updates.plan !== undefined) {
      fields.push("plan = ?")
      values.push(updates.plan)
    }
    if (updates.trialEndsAt !== undefined) {
      fields.push("trialEndsAt = ?")
      values.push(updates.trialEndsAt?.toISOString?.() || updates.trialEndsAt)
    }
    if (updates.subscriptionEndsAt !== undefined) {
      fields.push("subscriptionEndsAt = ?")
      values.push(
        updates.subscriptionEndsAt?.toISOString?.() ||
          updates.subscriptionEndsAt
      )
    }
    if (updates.maxGroups !== undefined) {
      fields.push("maxGroups = ?")
      values.push(updates.maxGroups)
    }
    if (updates.maxBroadcastPerDay !== undefined) {
      fields.push("maxBroadcastPerDay = ?")
      values.push(updates.maxBroadcastPerDay)
    }
    if (updates.broadcastToday !== undefined) {
      fields.push("broadcastToday = ?")
      values.push(updates.broadcastToday)
    }
    if (updates.lastBroadcastDate !== undefined) {
      fields.push("lastBroadcastDate = ?")
      values.push(updates.lastBroadcastDate)
    }

    if (fields.length > 0) {
      values.push(id)
      db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(
        ...values
      )
    }
    return UserDB.findById(id)
  },

  _formatUser: (row) => ({
    _id: row.id,
    id: row.id,
    email: row.email,
    password: row.password,
    name: row.name,
    plan: row.plan,
    trialEndsAt: row.trialEndsAt ? new Date(row.trialEndsAt) : null,
    subscriptionEndsAt: row.subscriptionEndsAt
      ? new Date(row.subscriptionEndsAt)
      : null,
    limits: {
      maxGroups: row.maxGroups,
      maxBroadcastPerDay: row.maxBroadcastPerDay,
    },
    broadcastToday: row.broadcastToday,
    lastBroadcastDate: row.lastBroadcastDate,
    createdAt: row.createdAt ? new Date(row.createdAt) : null,
    save: async function () {
      UserDB.update(this.id, {
        password: this.password,
        plan: this.plan,
        trialEndsAt: this.trialEndsAt,
        subscriptionEndsAt: this.subscriptionEndsAt,
        maxGroups: this.limits?.maxGroups,
        maxBroadcastPerDay: this.limits?.maxBroadcastPerDay,
        broadcastToday: this.broadcastToday,
        lastBroadcastDate: this.lastBroadcastDate,
      })
    },
  }),
}

// ===== PLAN LIMITS =====
const PLAN_LIMITS = {
  trial: { 
    maxGroups: 3, 
    maxBroadcastPerDay: 50,
    maxAutoReplies: 3,
    maxSchedules: 10,
    maxTemplates: 5,
    maxCommands: 3
  },
  pro: { 
    maxGroups: 999, 
    maxBroadcastPerDay: 500,
    maxAutoReplies: 999,
    maxSchedules: 999,
    maxTemplates: 999,
    maxCommands: 999
  },
}

// Helper function to get user limits
function getUserLimits(userId) {
  const user = UserDB.findById(userId)
  if (!user) return PLAN_LIMITS.trial
  return PLAN_LIMITS[user.plan] || PLAN_LIMITS.trial
}

// ===== CONFIGURATION =====
const PORT = process.env.PORT || 3000

// ===== GLOBAL SESSION MANAGER =====
const sessions = new Map()
const qrCodes = new Map()
const qrTimestamps = new Map() // Track when QR was generated
const sessionStatuses = new Map()
const QR_EXPIRY_MS = 45000 // QR expires after 45 seconds

// ===== DATA DIRECTORIES =====
const DATA_DIR = path.join(__dirname, "data")
const UPLOADS_DIR = path.join(__dirname, "uploads")

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

// ===== HELPER FUNCTIONS =====
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function getUserDataPath(userId, filename) {
  const userDir = path.join(DATA_DIR, userId)
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true })
  return path.join(userDir, filename)
}

function readUserData(userId, filename, defaultValue = []) {
  try {
    const filePath = getUserDataPath(userId, filename)
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"))
    }
    return defaultValue
  } catch (e) {
    return defaultValue
  }
}

function writeUserData(userId, filename, data) {
  const filePath = getUserDataPath(userId, filename)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

// User-specific data readers/writers
const readGroups = (userId) => readUserData(userId, "groups.json", [])
const writeGroups = (userId, data) => writeUserData(userId, "groups.json", data)
const readAutoReplies = (userId) => readUserData(userId, "autoreplies.json", [])
const writeAutoReplies = (userId, data) =>
  writeUserData(userId, "autoreplies.json", data)
const readTemplates = (userId) => readUserData(userId, "templates.json", [])
const writeTemplates = (userId, data) =>
  writeUserData(userId, "templates.json", data)
const readSchedules = (userId) => readUserData(userId, "schedules.json", [])
const writeSchedules = (userId, data) =>
  writeUserData(userId, "schedules.json", data)
const readCommands = (userId) => readUserData(userId, "commands.json", [])
const writeCommands = (userId, data) =>
  writeUserData(userId, "commands.json", data)
const readContacts = (userId) => readUserData(userId, "contacts.json", [])
const writeContacts = (userId, data) =>
  writeUserData(userId, "contacts.json", data)
const readBlacklist = (userId) => readUserData(userId, "blacklist.json", [])
const writeBlacklist = (userId, data) =>
  writeUserData(userId, "blacklist.json", data)
const readHistory = (userId) => readUserData(userId, "history.json", [])
const writeHistory = (userId, data) =>
  writeUserData(userId, "history.json", data)
const readSettings = (userId) =>
  readUserData(userId, "settings.json", {
    auth: { enabled: false, username: "admin", password: "admin123" },
    queue: { enabled: true, delayMs: 2000 },
    typing: { enabled: true, durationMs: 1500 },
    webhook: { secret: "webhook-secret-key" },
  })
const writeSettings = (userId, data) =>
  writeUserData(userId, "settings.json", data)
const readQuickActions = (userId) =>
  readUserData(userId, "quickactions.json", [])
const writeQuickActions = (userId, data) =>
  writeUserData(userId, "quickactions.json", data)

// ===== MESSAGE VARIABLES PROCESSOR =====
function processMessageVariables(message) {
  if (!message) return ""
  const now = new Date()
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]
  const months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ]

  return message
    .replace(/{date}/g, now.toLocaleDateString("id-ID"))
    .replace(
      /{time}/g,
      now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    )
    .replace(/{day}/g, days[now.getDay()])
    .replace(/{month}/g, months[now.getMonth()])
    .replace(/{year}/g, now.getFullYear().toString())
}

// ===== ANTI-LOOP PROTECTION =====
const replyTracker = new Map()
const LOOP_PROTECTION = {
  maxRepliesPerMinute: 5,
  cooldownMs: 60000,
  selfReplyBlock: true,
}

function canAutoReply(chatId) {
  const key = `reply_${chatId}`
  const now = Date.now()
  const tracker = replyTracker.get(key) || {
    count: 0,
    resetAt: now + LOOP_PROTECTION.cooldownMs,
  }

  if (now > tracker.resetAt) {
    replyTracker.set(key, {
      count: 1,
      resetAt: now + LOOP_PROTECTION.cooldownMs,
    })
    return true
  }

  if (tracker.count >= LOOP_PROTECTION.maxRepliesPerMinute) {
    return false
  }

  tracker.count++
  replyTracker.set(key, tracker)
  return true
}

function isLikelyBot(messageBody) {
  const botPatterns = [/^\[.*BOT.*\]/i, /^🤖/, /\[AUTO.?REPLY\]/i, /^<.*>$/]
  return botPatterns.some((p) => p.test(messageBody))
}

// ===== SESSION INITIALIZATION =====
async function initSession(userId, forceRestart = false, clearAuth = false) {
  // If clearAuth requested, always clear auth data first (for switching WA accounts)
  if (clearAuth) {
    console.log(`🔄 Clear auth requested for user: ${userId}`)
    await destroySession(userId, true)
  }
  // Check if session already exists
  else if (sessions.has(userId)) {
    const status = sessionStatuses.get(userId)

    // Force restart requested - destroy existing session first
    if (forceRestart) {
      console.log(`🔄 Force restart requested for user: ${userId}`)
      await destroySession(userId, false)
    } else {
      if (status === "connected") {
        return {
          success: true,
          message: "Session already connected",
          status: "connected",
        }
      }

      if (status === "qr") {
        const qr = qrCodes.get(userId)
        const qrTime = qrTimestamps.get(userId) || 0
        const isExpired = Date.now() - qrTime > QR_EXPIRY_MS

        // If QR is expired, we should wait for new one or restart
        if (isExpired && qr) {
          console.log(
            `⚠️ QR expired for user: ${userId}, waiting for new QR...`
          )
          return {
            success: true,
            message: "QR expired, waiting for new QR code...",
            status: "qr_expired",
          }
        }

        return {
          success: true,
          message: "Waiting for QR scan",
          status: "qr",
          qr,
        }
      }

      // If status is error, auth_failure or disconnected, allow reinit
      if (["error", "auth_failure", "disconnected"].includes(status)) {
        console.log(
          `🔄 Reinitializing failed session for user: ${userId} (was: ${status})`
        )
        await destroySession(userId)
      } else if (status === "initializing" || status === "authenticated") {
        // Still initializing, wait
        return { success: true, message: `Session is ${status}...`, status }
      }
    }
  }

  console.log(`🔄 Initializing session for user: ${userId}`)
  sessionStatuses.set(userId, "initializing")

  try {
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: userId,
        dataPath: path.join(__dirname, ".wwebjs_auth"),
      }),
      puppeteer: {
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || "/snap/bin/chromium",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
          "--disable-extensions",
          "--disable-plugins",
          "--disable-sync",
          "--disable-translate",
          "--disable-background-networking",
          "--disable-default-apps",
          "--mute-audio",
          "--no-default-browser-check",
          "--autoplay-policy=no-user-gesture-required",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-software-rasterizer",
          "--disable-features=TranslateUI",
          "--disable-ipc-flooding-protection",
          "--disable-hang-monitor",
          "--memory-pressure-off",
          "--max-old-space-size=256",
        ],
      },
    })

    // QR Code Event
    client.on("qr", (qr) => {
      console.log(`📱 [${userId}] QR Code generated`)
      qrCodes.set(userId, qr)
      qrTimestamps.set(userId, Date.now())
      sessionStatuses.set(userId, "qr")
    })

    // Debug: Track browser launch
    client.on("loading_screen", (percent, message) => {
      console.log(`⏳ [${userId}] Loading: ${percent}% - ${message}`)
    })

    // Ready Event
    client.on("ready", async () => {
      console.log(`✅ Client ready for user: ${userId}`)
      sessionStatuses.set(userId, "connected")
      qrCodes.delete(userId)

      // Get WhatsApp info
      try {
        const info = client.info
        console.log(`   📞 Connected as: ${info.pushname} (${info.wid.user})`)
      } catch (e) {}
    })

    // Authenticated Event - RESTORED FROM LOCAL STORAGE
    client.on("authenticated", () => {
      console.log(
        `🔐 Client authenticated for user: ${userId} (session restored from local storage)`
      )
      sessionStatuses.set(userId, "authenticated")
    })

    // Remote Session Saved
    client.on("remote_session_saved", () => {
      console.log(`💾 Remote session saved for user: ${userId}`)
    })

    // Disconnected Event
    client.on("disconnected", (reason) => {
      console.log(
        `❌ Client disconnected for user: ${userId}. Reason: ${reason}`
      )
      sessionStatuses.set(userId, "disconnected")
      sessions.delete(userId)
    })

    // Auth Failure Event
    client.on("auth_failure", (msg) => {
      console.error(`🚫 Auth failure for user: ${userId}. Message: ${msg}`)
      sessionStatuses.set(userId, "auth_failure")
      sessions.delete(userId)
    })

    // Message Event - Auto Reply & Commands
    client.on("message", async (msg) => {
      await handleIncomingMessage(userId, client, msg)
    })

    // Store client in sessions map
    sessions.set(userId, client)

    // Initialize client in background (non-blocking)
    client.initialize().catch((err) => {
      console.error(`❌ Initialize failed for user: ${userId}`, err.message)
      destroySession(userId)
      sessionStatuses.set(userId, "error")
    })

    // Return immediately - frontend will poll for QR/status
    return {
      success: true,
      message: "Session initialization started",
      status: "initializing",
    }
  } catch (error) {
    console.error(`❌ Failed to initialize session for user: ${userId}`, error)
    sessionStatuses.set(userId, "error")
    return { success: false, message: error.message, status: "error" }
  }
}

// ===== MESSAGE HANDLER =====
async function handleIncomingMessage(userId, client, msg) {
  try {
    // Skip status messages
    if (msg.isStatus) return

    // Skip own messages
    if (msg.fromMe) return

    const sender = msg.from
    const msgText = msg.body.toLowerCase()
    const chat = await msg.getChat()

    // Bot detection
    if (isLikelyBot(msg.body)) {
      console.log(`[${userId}] Ignoring likely bot message`)
      return
    }

    // Loop protection
    if (!canAutoReply(sender)) {
      console.log(`[${userId}] Rate limit reached for: ${sender}`)
      return
    }

    // Check blacklist
    const blacklist = readBlacklist(userId)
    const senderNumber = sender.replace("@c.us", "").replace("@g.us", "")
    if (blacklist.some((b) => senderNumber.includes(b.number))) {
      console.log(`[${userId}] Blocked message from blacklisted: ${sender}`)
      return
    }

    const settings = readSettings(userId)

    // Check Custom Commands first
    if (msg.body.startsWith("!")) {
      const commands = readCommands(userId)
      const cmdName = msg.body.split(" ")[0].toLowerCase()
      const cmd = commands.find(
        (c) => c.command === cmdName && c.enabled !== false
      )

      if (cmd) {
        // Show typing indicator
        if (settings.typing?.enabled) {
          await chat.sendStateTyping()
          await delay(settings.typing.durationMs || 1000)
        }

        const response = processMessageVariables(cmd.response)
        await msg.reply(response)
        console.log(`[${userId}] Command ${cmdName} executed`)
        return
      }
    }

    // Auto Replies
    const autoReplies = readAutoReplies(userId)
    const enabledReplies = autoReplies.filter((r) => r.enabled)

    for (const reply of enabledReplies) {
      let match = false
      const keyword = reply.keyword.toLowerCase()

      switch (reply.matchType) {
        case "exact":
          match = msgText === keyword
          break
        case "startswith":
          match = msgText.startsWith(keyword)
          break
        case "words":
          const keywordWords = keyword.split(/\s+/).filter((w) => w.length > 0)
          match = keywordWords.every((word) => msgText.includes(word))
          break
        case "anyword":
          const anyWords = keyword.split(/\s+/).filter((w) => w.length > 0)
          match = anyWords.some((word) => msgText.includes(word))
          break
        case "contains":
        default:
          match = msgText.includes(keyword)
          break
      }

      if (match) {
        // Random delay for more human-like behavior (1-3 seconds variation)
        const randomDelay = Math.floor(Math.random() * 2000) + 1000

        // Show typing indicator
        if (settings.typing?.enabled) {
          await chat.sendStateTyping()
          const typingDuration =
            (settings.typing.durationMs || 1500) + randomDelay
          await delay(typingDuration)
        } else {
          await delay(randomDelay)
        }

        // Support multiple responses separated by ||| (pick random one)
        let responseText = reply.response
        if (responseText.includes("|||")) {
          const responses = responseText
            .split("|||")
            .map((r) => r.trim())
            .filter((r) => r)
          responseText = responses[Math.floor(Math.random() * responses.length)]
        }

        const response = processMessageVariables(responseText)

        // Reply with image if set
        if (reply.imagePath) {
          try {
            const media = MessageMedia.fromFilePath(
              path.join(__dirname, reply.imagePath)
            )
            await msg.reply(media, undefined, { caption: response })
          } catch (e) {
            await msg.reply(response)
          }
        } else {
          await msg.reply(response)
        }

        console.log(
          `[${userId}] Auto-reply triggered for keyword: ${reply.keyword}`
        )
        break
      }
    }
  } catch (error) {
    console.error(`[${userId}] Error handling message:`, error)
  }
}

// ===== DESTROY SESSION =====
async function destroySession(userId, clearAuthData = false) {
  const client = sessions.get(userId)

  // Always clean up maps
  sessionStatuses.delete(userId)
  qrCodes.delete(userId)
  qrTimestamps.delete(userId)

  if (client) {
    try {
      // Check if browser exists before destroying
      if (client.pupBrowser) {
        await client.destroy()
        console.log(`🗑️ Client destroyed for user: ${userId}`)
      } else {
        console.log(`🗑️ Client cleanup for user: ${userId} (no browser)`)
      }
    } catch (error) {
      // Ignore destroy errors, just log
      console.log(`⚠️ Cleanup warning for user: ${userId}`, error.message)
    }
  }
  sessions.delete(userId)

  // Clear auth data if requested (for switching WhatsApp accounts)
  if (clearAuthData) {
    const authPath = path.join(__dirname, ".wwebjs_auth", `session-${userId}`)
    try {
      if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true })
        console.log(`🗑️ Auth data cleared for user: ${userId}`)
      }
    } catch (error) {
      console.error(`❌ Failed to clear auth data for user: ${userId}`, error)
    }
  }

  console.log(`🗑️ Session cleanup complete for user: ${userId}`)
  return {
    success: true,
    message: clearAuthData
      ? "Session and auth data cleared"
      : "Session cleaned up",
  }
}

// ===== MULTER UPLOAD CONFIG =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) =>
    cb(
      null,
      `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(
        file.originalname
      )}`
    ),
})
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } })

// =============================================
// ===== AUTH SECURITY =====
// =============================================

// Rate limiting for auth endpoints
const authAttempts = new Map()
const AUTH_LIMIT = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  blockDurationMs: 30 * 60 * 1000, // 30 minutes block
}

function checkAuthRateLimit(ip) {
  const now = Date.now()
  const record = authAttempts.get(ip)

  if (!record) {
    authAttempts.set(ip, { attempts: 1, firstAttempt: now, blocked: false })
    return { allowed: true }
  }

  // Check if blocked
  if (record.blocked && now < record.blockedUntil) {
    const minutesLeft = Math.ceil((record.blockedUntil - now) / 60000)
    return {
      allowed: false,
      message: `Too many attempts. Try again in ${minutesLeft} minutes.`,
    }
  }

  // Reset if window expired
  if (now - record.firstAttempt > AUTH_LIMIT.windowMs) {
    authAttempts.set(ip, { attempts: 1, firstAttempt: now, blocked: false })
    return { allowed: true }
  }

  // Increment attempts
  record.attempts++

  if (record.attempts > AUTH_LIMIT.maxAttempts) {
    record.blocked = true
    record.blockedUntil = now + AUTH_LIMIT.blockDurationMs
    authAttempts.set(ip, record)
    return {
      allowed: false,
      message: "Too many attempts. Account temporarily locked for 30 minutes.",
    }
  }

  authAttempts.set(ip, record)
  return { allowed: true }
}

function resetAuthAttempts(ip) {
  authAttempts.delete(ip)
}

// Input validation helpers
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function isStrongPassword(password) {
  // Minimum 6 characters
  return password && password.length >= 6
}

function sanitizeName(name) {
  // Remove HTML tags and trim
  return name
    .replace(/<[^>]*>/g, "")
    .trim()
    .substring(0, 100)
}

function isValidPhone(phone) {
  // Indonesian phone format: 08xxx or +628xxx, minimum 10 digits
  const cleaned = phone.replace(/\D/g, "")
  return cleaned.length >= 10 && cleaned.length <= 15
}

function normalizePhone(phone) {
  // Convert to standard format (remove leading 0, add 62)
  let cleaned = phone.replace(/\D/g, "")
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.substring(1)
  }
  if (!cleaned.startsWith("62")) {
    cleaned = "62" + cleaned
  }
  return cleaned
}

// =============================================
// ===== AUTH ROUTES =====
// =============================================

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress

    // Rate limit check
    const rateCheck = checkAuthRateLimit(ip)
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.message })
    }

    let { email, phone, password, name } = req.body

    // Must have email OR phone
    if ((!email && !phone) || !password || !name) {
      return res
        .status(400)
        .json({ error: "Email atau No HP, password, dan nama diperlukan" })
    }

    // Sanitize and validate
    name = sanitizeName(name)

    if (!isStrongPassword(password)) {
      return res
        .status(400)
        .json({ error: "Password minimal 6 karakter" })
    }

    if (name.length < 2) {
      return res
        .status(400)
        .json({ error: "Nama minimal 2 karakter" })
    }

    let identifier = null
    let identifierType = null

    // Validate email if provided
    if (email) {
      email = email.toLowerCase().trim()
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: "Format email tidak valid" })
      }
      identifier = email
      identifierType = "email"
    }

    // Validate phone if provided (and no email)
    if (phone && !email) {
      if (!isValidPhone(phone)) {
        return res.status(400).json({ error: "Format nomor HP tidak valid (min 10 digit)" })
      }
      phone = normalizePhone(phone)
      identifier = phone
      identifierType = "phone"
    }

    // Check if user exists (by email or phone)
    const existingByEmail = email ? UserDB.findOne({ email }) : null
    const existingByPhone = phone ? UserDB.findOne({ phone }) : null
    
    if (existingByEmail) {
      return res.status(400).json({ error: "Email sudah terdaftar" })
    }
    if (existingByPhone) {
      return res.status(400).json({ error: "No HP sudah terdaftar" })
    }

    // Hash password with higher cost factor
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user with 10-day trial
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 10)

    const userData = {
      password: hashedPassword,
      name,
      plan: "trial",
      trialEndsAt,
      limits: PLAN_LIMITS.trial,
    }
    
    if (email) userData.email = email
    if (phone) userData.phone = phone

    const user = UserDB.create(userData)

    // Generate token
    const token = jwt.sign(
      { userId: user._id, email: user.email || user.phone },
      JWT_SECRET,
      { expiresIn: "30d" }
    )

    res.json({
      success: true,
      message: "Registrasi berhasil! 10 hari trial gratis dimulai.",
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        plan: user.plan,
        trialEndsAt: user.trialEndsAt,
        limits: user.limits,
      },
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ error: "Registrasi gagal" })
  }
})

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress

    // Rate limit check
    const rateCheck = checkAuthRateLimit(ip)
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.message })
    }

    let { email, phone, password } = req.body

    // Must have email OR phone
    if ((!email && !phone) || !password) {
      return res.status(400).json({ error: "Email/No HP dan password diperlukan" })
    }

    let user = null

    // Try to find user by email
    if (email) {
      email = email.toLowerCase().trim()
      user = UserDB.findOne({ email })
    }
    
    // Try to find user by phone
    if (!user && phone) {
      phone = normalizePhone(phone)
      user = UserDB.findOne({ phone })
    }

    if (!user) {
      return res.status(401).json({ error: "Email/No HP atau password salah" })
    }

    // Check password
    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
      return res.status(401).json({ error: "Email/No HP atau password salah" })
    }

    // Reset rate limit on successful login
    resetAuthAttempts(ip)

    // Generate token
    const token = jwt.sign({ userId: user.id, email: user.email || user.phone }, JWT_SECRET, {
      expiresIn: "30d",
    })

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        plan: user.plan,
        trialEndsAt: user.trialEndsAt,
        subscriptionEndsAt: user.subscriptionEndsAt,
        limits: user.limits,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Login gagal" })
  }
})

// ===== PASSWORD RESET =====
const resetTokens = new Map()

// Forgot password - Generate reset token
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress

    // Rate limit check
    const rateCheck = checkAuthRateLimit(ip)
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.message })
    }

    let { email } = req.body

    if (!email) {
      return res.status(400).json({ error: "Email is required" })
    }

    email = email.toLowerCase().trim()

    const user = UserDB.findOne({ email })

    // Don't reveal if email exists (security best practice)
    if (!user) {
      return res.json({
        success: true,
        message: "If the email exists, a reset link has been sent",
      })
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex")
    const resetExpiry = Date.now() + 3600000 // 1 hour

    resetTokens.set(resetToken, {
      userId: user.id,
      email: user.email,
      expiry: resetExpiry,
    })

    // Reset link
    const resetLink = `${req.protocol}://${req.get(
      "host"
    )}/reset-password.html?token=${resetToken}`

    console.log(`🔑 Reset link for ${email}: ${resetLink}`)

    // TODO: Send email via nodemailer
    // For now, just log it (in production, send via email)

    res.json({
      success: true,
      message: "If the email exists, a reset link has been sent",
    })
  } catch (error) {
    console.error("Forgot password error:", error)
    res.status(500).json({ error: "Failed to process request" })
  }
})

// Reset password with token
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ error: "Token and new password are required" })
    }

    if (!isStrongPassword(newPassword)) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" })
    }

    const resetData = resetTokens.get(token)

    if (!resetData) {
      return res.status(400).json({ error: "Invalid or expired reset token" })
    }

    if (Date.now() > resetData.expiry) {
      resetTokens.delete(token)
      return res
        .status(400)
        .json({ error: "Reset token has expired. Please request a new one." })
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 12)
    UserDB.update(resetData.userId, { password: hashedPassword })

    // Delete used token
    resetTokens.delete(token)

    console.log(`✅ Password reset successfully for: ${resetData.email}`)

    res.json({
      success: true,
      message: "Password has been reset successfully. You can now login.",
    })
  } catch (error) {
    console.error("Reset password error:", error)
    res.status(500).json({ error: "Failed to reset password" })
  }
})

// Admin: Manual reset password
app.post("/api/admin/reset-user-password", async (req, res) => {
  const adminKey = req.headers["x-admin-key"]
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const { email, newPassword } = req.body

  try {
    const user = UserDB.findOne({ email: email.toLowerCase() })
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12)
    UserDB.update(user.id, { password: hashedPassword })

    res.json({ success: true, message: `Password reset for ${email}` })
  } catch (error) {
    res.status(500).json({ error: "Failed to reset password" })
  }
})

// Get current user
app.get("/api/auth/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "")
    if (!token) {
      return res.status(401).json({ error: "No token provided" })
    }

    const decoded = jwt.verify(token, JWT_SECRET)
    const user = UserDB.findById(decoded.userId)

    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    // Check subscription status
    const now = new Date()
    let isActive = false
    let daysLeft = 0

    if (user.plan === "trial") {
      isActive = user.trialEndsAt > now
      daysLeft = Math.ceil((user.trialEndsAt - now) / (1000 * 60 * 60 * 24))
    } else if (user.plan === "pro") {
      isActive = !user.subscriptionEndsAt || user.subscriptionEndsAt > now
      if (user.subscriptionEndsAt) {
        daysLeft = Math.ceil(
          (user.subscriptionEndsAt - now) / (1000 * 60 * 60 * 24)
        )
      } else {
        daysLeft = 999 // Lifetime
      }
    }

    // Reset daily broadcast count if new day
    const today = new Date().toDateString()
    if (user.lastBroadcastDate !== today) {
      UserDB.update(user.id, { broadcastToday: 0, lastBroadcastDate: today })
      user.broadcastToday = 0
      user.lastBroadcastDate = today
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        isActive,
        daysLeft: Math.max(0, daysLeft),
        trialEndsAt: user.trialEndsAt,
        subscriptionEndsAt: user.subscriptionEndsAt,
        limits: user.limits,
        broadcastToday: user.broadcastToday,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    res.status(401).json({ error: "Invalid token" })
  }
})

// Auth middleware
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "")
    if (!token) {
      return res.status(401).json({ error: "Authentication required" })
    }

    const decoded = jwt.verify(token, JWT_SECRET)
    const user = UserDB.findById(decoded.userId)

    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    // Check if subscription is active
    const now = new Date()
    let isActive = false

    if (user.plan === "trial") {
      isActive = user.trialEndsAt > now
    } else if (user.plan === "pro") {
      isActive = !user.subscriptionEndsAt || user.subscriptionEndsAt > now
    }

    if (!isActive) {
      return res
        .status(403)
        .json({ error: "Subscription expired", code: "SUBSCRIPTION_EXPIRED" })
    }

    req.user = user
    next()
  } catch (error) {
    res.status(401).json({ error: "Invalid token" })
  }
}

// =============================================
// ===== ADMIN ROUTES =====
// =============================================

const ADMIN_KEY = process.env.ADMIN_KEY || "admin-secret-key"
if (!process.env.ADMIN_KEY || process.env.ADMIN_KEY === "admin-secret-key") {
  console.warn(
    "⚠️  WARNING: ADMIN_KEY not set or using default! Set a strong key in .env"
  )
}

// Admin: List all users
app.get("/api/admin/users", (req, res) => {
  const adminKey = req.headers["x-admin-key"]
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const users = UserDB.find().map((u) => {
    const { password, ...userWithoutPassword } = u
    return userWithoutPassword
  })
  res.json({ success: true, users })
})

// Admin: Activate Pro subscription
app.post("/api/admin/activate", async (req, res) => {
  const adminKey = req.headers["x-admin-key"]
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const { email, months } = req.body

  try {
    const user = UserDB.findOne({ email })
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Set subscription end date
    const subscriptionEndsAt = new Date()
    subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + (months || 1))

    UserDB.update(user.id, {
      plan: "pro",
      subscriptionEndsAt,
      maxGroups: PLAN_LIMITS.pro.maxGroups,
      maxBroadcastPerDay: PLAN_LIMITS.pro.maxBroadcastPerDay,
    })

    res.json({
      success: true,
      message: `Pro subscription activated for ${email} until ${subscriptionEndsAt.toDateString()}`,
      user: {
        email: user.email,
        plan: user.plan,
        subscriptionEndsAt: user.subscriptionEndsAt,
      },
    })
  } catch (error) {
    res.status(500).json({ error: "Failed to activate subscription" })
  }
})

// Admin: Delete user
app.delete("/api/admin/users/:id", (req, res) => {
  const adminKey = req.headers["x-admin-key"]
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const { id } = req.params
  
  try {
    // Delete user from database
    UserDB.delete(parseInt(id))
    
    // Also destroy their session if exists
    if (userSessions.has(id)) {
      const session = userSessions.get(id)
      if (session.client) {
        session.client.destroy().catch(() => {})
      }
      userSessions.delete(id)
    }
    
    res.json({ success: true, message: "User deleted" })
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" })
  }
})

// Admin: Clear all sessions
app.post("/api/admin/sessions/clear", async (req, res) => {
  const adminKey = req.headers["x-admin-key"]
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: "Forbidden" })
  }

  try {
    const sessionCount = userSessions.size
    
    // Destroy all clients
    for (const [userId, session] of userSessions) {
      if (session.client) {
        try {
          await session.client.destroy()
        } catch (e) {
          console.error(`Error destroying session ${userId}:`, e)
        }
      }
    }
    
    // Clear all sessions
    userSessions.clear()
    
    res.json({ success: true, message: `Cleared ${sessionCount} sessions` })
  } catch (error) {
    res.status(500).json({ error: "Failed to clear sessions" })
  }
})

// =============================================
// ===== API ENDPOINTS - SESSION MANAGEMENT =====
// =============================================


// Start a new session (requires auth, user can only start their own session)
app.post("/api/session/start", requireUserAuth, async (req, res) => {
  const { userId, forceRestart, clearAuth } = req.body

  if (!userId) {
    return res.status(400).json({ error: "userId is required" })
  }

  // Verify user is starting their own session
  if (userId !== req.authUserId) {
    return res
      .status(403)
      .json({ error: "You can only start your own session" })
  }

  // clearAuth = true means user wants to link a different WhatsApp account
  const result = await initSession(
    userId,
    forceRestart === true,
    clearAuth === true
  )
  res.json(result)
})

// Get QR Code for a session (requires auth, user can only see their own QR)
app.get("/api/session/qr/:userId", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const qr = qrCodes.get(userId)
  const status = sessionStatuses.get(userId)

  if (status === "connected") {
    return res.json({
      success: true,
      status: "connected",
      message: "Already connected, no QR needed",
    })
  }

  if (!qr) {
    return res.json({
      success: false,
      status: status || "unknown",
      message: "QR not available yet",
    })
  }

  res.json({ success: true, status: "qr", qr })
})

// Request pairing code for phone number linking
const pairingCodes = new Map()

app.post("/api/session/pairing-code", requireUserAuth, async (req, res) => {
  const { userId, phoneNumber } = req.body

  if (!userId || !phoneNumber) {
    return res.status(400).json({ error: "userId and phoneNumber are required" })
  }

  // Verify user is starting their own session
  if (userId !== req.authUserId) {
    return res.status(403).json({ error: "You can only use your own session" })
  }

  // Normalize phone number (remove +, spaces, etc)
  let normalizedPhone = phoneNumber.replace(/\D/g, "")
  if (normalizedPhone.startsWith("0")) {
    normalizedPhone = "62" + normalizedPhone.substring(1)
  }
  if (!normalizedPhone.startsWith("62")) {
    normalizedPhone = "62" + normalizedPhone
  }

  try {
    // Make sure session is started first
    if (!sessions.has(userId)) {
      await initSession(userId, false, false)
      // Wait a bit for client to initialize
      await new Promise(resolve => setTimeout(resolve, 3000))
    }

    const client = sessions.get(userId)
    if (!client) {
      return res.status(400).json({ error: "Session not ready. Try again." })
    }

    // Request pairing code
    const pairingCode = await client.requestPairingCode(normalizedPhone)
    
    // Store pairing code for polling
    pairingCodes.set(userId, {
      code: pairingCode,
      phone: normalizedPhone,
      createdAt: Date.now()
    })

    console.log(`📱 Pairing code generated for user ${userId}: ${pairingCode}`)

    res.json({
      success: true,
      pairingCode: pairingCode,
      phone: normalizedPhone,
      message: "Masukkan kode ini di WhatsApp: Linked Devices > Link with phone number"
    })
  } catch (error) {
    console.error(`❌ Pairing code error for ${userId}:`, error)
    res.status(500).json({ 
      error: "Gagal generate pairing code. " + (error.message || "Coba lagi."),
      details: error.message
    })
  }
})

// Get session status (requires auth, user can only check their own status)
app.get("/api/session/status/:userId", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const status = sessionStatuses.get(userId) || "not_found"
  const hasSession = sessions.has(userId)

  res.json({
    success: true,
    userId,
    status,
    active: hasSession,
    hasQR: qrCodes.has(userId),
  })
})

// List all active sessions (ADMIN ONLY)
app.get("/api/sessions", (req, res) => {
  const adminKey = req.headers["x-admin-key"]
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: "Admin access required" })
  }

  const sessionList = []

  sessions.forEach((client, oderId) => {
    sessionList.push({
      oderId,
      status: sessionStatuses.get(oderId) || "unknown",
      hasQR: qrCodes.has(oderId),
    })
  })

  res.json({ success: true, sessions: sessionList, count: sessionList.length })
})

// Destroy a session (requires auth, user can only destroy their own session)
app.delete("/api/session/:userId", requireUserAuth, async (req, res) => {
  const { userId } = req.params
  const result = await destroySession(userId)
  res.json(result)
})

// Logout a session (requires auth, user can only logout their own session)
app.post("/api/session/logout/:userId", requireUserAuth, async (req, res) => {
  const { userId } = req.params

  if (!sessions.has(userId)) {
    return res.json({ success: false, message: "Session not found" })
  }

  try {
    const client = sessions.get(userId)
    await client.logout()
    sessions.delete(userId)
    sessionStatuses.delete(userId)
    qrCodes.delete(userId)

    res.json({ success: true, message: "Logged out successfully" })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// =============================================
// ===== API ENDPOINTS - PER-USER FEATURES =====
// =============================================

// Middleware to verify user owns the resource (SECURITY FIX)
async function requireUserAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "")
    if (!token) {
      return res.status(401).json({ error: "Authentication required" })
    }

    const decoded = jwt.verify(token, JWT_SECRET)
    const requestedUserId = req.params.userId

    // Verify the user is accessing their own data
    if (requestedUserId && decoded.userId !== requestedUserId) {
      return res
        .status(403)
        .json({ error: "Access denied. You can only access your own data." })
    }

    req.authUserId = decoded.userId
    next()
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" })
  }
}

// Middleware to check session (also verifies auth)
function requireSession(req, res, next) {
  const userId = req.params.userId || req.body.userId || req.query.userId

  if (!userId) {
    return res.status(400).json({ error: "userId is required" })
  }

  // Verify auth first
  const token = req.headers.authorization?.replace("Bearer ", "")
  if (!token) {
    return res.status(401).json({ error: "Authentication required" })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    if (decoded.userId !== userId) {
      return res.status(403).json({ error: "Access denied" })
    }
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" })
  }

  if (!sessions.has(userId)) {
    return res
      .status(404)
      .json({ error: "Session not found. Please start a session first." })
  }

  const status = sessionStatuses.get(userId)
  if (status !== "connected") {
    return res
      .status(400)
      .json({ error: `Session not connected. Current status: ${status}` })
  }

  req.userId = userId
  req.client = sessions.get(userId)
  next()
}

// ===== CATEGORIES (placeholder) =====
app.get("/api/:userId/categories", requireUserAuth, (req, res) => {
  res.json([])
})

// ===== GROUPS =====
app.get("/api/:userId/groups", requireUserAuth, (req, res) => {
  const groups = readGroups(req.params.userId)
  res.json(groups)
})

app.post("/api/:userId/groups", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const { name, id } = req.body

  if (!name || !id) {
    return res.status(400).json({ error: "Name and ID are required" })
  }

  const groups = readGroups(userId)

  // No limit on saving groups - limit is only on broadcast selection

  groups.push({
    id: Date.now().toString(),
    name,
    groupId: id,
    addedAt: new Date().toISOString(),
  })
  writeGroups(userId, groups)

  res.json({ success: true })
})

// Debug endpoint - check all chats
app.get("/api/:userId/debug/chats", requireSession, async (req, res) => {
  try {
    const chats = await req.client.getChats()
    const summary = {
      totalChats: chats.length,
      groups: chats.filter((c) => c.isGroup).length,
      private: chats.filter((c) => !c.isGroup).length,
      groupNames: chats.filter((c) => c.isGroup).map((c) => c.name),
    }
    console.log("Debug chats:", summary)
    res.json(summary)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Cache for group sync (5 minutes)
const groupSyncCache = new Map()
const GROUP_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Sync groups from WhatsApp (MUST be before /:groupId route)
app.post("/api/:userId/groups/sync", requireSession, async (req, res) => {
  try {
    const { userId } = req.params
    const forceRefresh = req.query.force === "true"

    // Check cache first (unless force refresh)
    const cached = groupSyncCache.get(userId)
    if (
      !forceRefresh &&
      cached &&
      Date.now() - cached.timestamp < GROUP_CACHE_TTL
    ) {
      console.log(
        `[${userId}] Using cached groups (${cached.groups.length} groups)`
      )
      return res.json({
        success: true,
        added: 0,
        removed: 0,
        total: cached.groups.length,
        cached: true,
        message: "Using cached data. Add ?force=true to refresh.",
      })
    }

    console.log(`[${userId}] Fetching groups from WhatsApp...`)
    const chats = await req.client.getChats()

    console.log(`[${userId}] Total chats: ${chats.length}`)

    const waGroups = chats
      .filter((chat) => chat.isGroup)
      .map((chat) => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        groupId: chat.id._serialized,
        name: chat.name,
        participants: chat.participants?.length || 0,
        addedAt: new Date().toISOString(),
      }))

    console.log(`[${userId}] Groups found: ${waGroups.length}`)

    const savedGroups = readGroups(userId)
    const savedGroupIds = savedGroups.map((g) => g.groupId || g.id)

    const newGroups = waGroups.filter((g) => !savedGroupIds.includes(g.groupId))
    const waGroupIds = waGroups.map((g) => g.groupId)
    const removedCount = savedGroups.filter(
      (g) => !waGroupIds.includes(g.groupId || g.id)
    ).length

    let updatedGroups = [
      ...savedGroups.filter((g) => waGroupIds.includes(g.groupId || g.id)),
      ...newGroups,
    ]

    // No limit on saving groups - limit is only on broadcast selection

    writeGroups(userId, updatedGroups)

    // Save to cache
    groupSyncCache.set(userId, {
      groups: updatedGroups,
      timestamp: Date.now(),
    })

    res.json({
      success: true,
      added: newGroups.length,
      removed: removedCount,
      total: updatedGroups.length,
      cached: false,
    })
  } catch (error) {
    console.error(`[${userId}] Sync error:`, error)
    res.status(500).json({ error: error.message })
  }
})

app.delete("/api/:userId/groups/:groupId", requireUserAuth, (req, res) => {
  const { userId, groupId } = req.params
  let groups = readGroups(userId)
  groups = groups.filter((g) => g.id !== groupId && g.groupId !== groupId)
  writeGroups(userId, groups)
  res.json({ success: true })
})

// Discover WhatsApp groups
app.get("/api/:userId/whatsapp-groups", requireSession, async (req, res) => {
  try {
    const chats = await req.client.getChats()
    const groups = chats
      .filter((chat) => chat.isGroup)
      .map((chat) => ({
        id: chat.id._serialized,
        name: chat.name,
        participants: chat.participants?.length || 0,
      }))
    res.json(groups)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ===== BROADCAST =====
app.post("/api/:userId/broadcast", requireSession, async (req, res) => {
  const { userId } = req.params
  const { message, groups, image } = req.body

  if (!message && !image) {
    return res.status(400).json({ error: "Message or image is required" })
  }

  if (!groups || groups.length === 0) {
    return res.status(400).json({ error: "At least one group is required" })
  }

  // Check broadcast daily limit
  const user = UserDB.findById(userId)
  const limits = getUserLimits(userId)
  const today = new Date().toDateString()

  // Check group selection limit (maxGroups = max groups per broadcast)
  if (groups.length > limits.maxGroups) {
    return res.status(403).json({
      error: `Trial hanya bisa broadcast ke ${limits.maxGroups} grup sekaligus. Upgrade ke Pro untuk unlimited.`,
      code: "GROUP_SELECTION_LIMIT",
      limit: limits.maxGroups,
      selected: groups.length
    })
  }
  
  // Reset counter if new day
  let broadcastToday = user?.broadcastToday || 0
  if (user?.lastBroadcastDate !== today) {
    broadcastToday = 0
  }

  // Check if limit reached
  if (broadcastToday + groups.length > limits.maxBroadcastPerDay) {
    const remaining = limits.maxBroadcastPerDay - broadcastToday
    return res.status(403).json({
      error: `Limit broadcast harian tercapai. Sisa quota: ${remaining}/${limits.maxBroadcastPerDay}. Upgrade ke Pro untuk 500/hari.`,
      code: "BROADCAST_LIMIT_REACHED",
      limit: limits.maxBroadcastPerDay,
      used: broadcastToday,
      remaining: remaining
    })
  }

  const settings = readSettings(userId)
  const processedMessage = processMessageVariables(message || "")
  const results = []

  // Handle image if provided
  let media = null
  if (image && image.startsWith("data:")) {
    const matches = image.match(/^data:(.+);base64,(.+)$/)
    if (matches) {
      media = new MessageMedia(matches[1], matches[2])
    }
  }

  for (let i = 0; i < groups.length; i++) {
    const groupId = groups[i]

    try {
      // Show typing indicator
      if (settings.typing?.enabled) {
        const chat = await req.client.getChatById(groupId)
        await chat.sendStateTyping()
        await delay(settings.typing.durationMs || 1500)
      }

      // Send message
      if (media) {
        await req.client.sendMessage(groupId, media, {
          caption: processedMessage,
        })
      } else {
        await req.client.sendMessage(groupId, processedMessage)
      }

      results.push({ groupId, success: true })
      console.log(`[${userId}] Message sent to: ${groupId}`)

      // Queue delay
      if (settings.queue?.enabled && i < groups.length - 1) {
        await delay(settings.queue.delayMs || 2000)
      }
    } catch (error) {
      results.push({ groupId, success: false, error: error.message })
      console.error(`[${userId}] Failed to send to ${groupId}:`, error.message)
    }
  }

  // Save to history
  const history = readHistory(userId)
  history.push({
    id: Date.now().toString(),
    type: media ? "image" : "text",
    message: processedMessage.substring(0, 100),
    groupCount: groups.length,
    successCount: results.filter((r) => r.success).length,
    failCount: results.filter((r) => !r.success).length,
    timestamp: new Date().toISOString(),
  })
  writeHistory(userId, history)

  // Update broadcast counter
  const successCount = results.filter((r) => r.success).length
  if (successCount > 0 && user) {
    UserDB.update(userId, {
      broadcastToday: broadcastToday + successCount,
      lastBroadcastDate: today
    })
  }

  res.json({
    success: successCount,
    failed: results.filter((r) => !r.success).length,
    results,
  })
})

// ===== AUTO REPLIES =====
app.get("/api/:userId/autoreplies", requireUserAuth, (req, res) => {
  res.json(readAutoReplies(req.params.userId))
})

app.post("/api/:userId/autoreplies", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const { keyword, response, matchType, enabled, image } = req.body

  if (!keyword || !response) {
    return res.status(400).json({ error: "Keyword and response are required" })
  }

  const replies = readAutoReplies(userId)
  const limits = getUserLimits(userId)

  // Check auto-reply limit
  if (replies.length >= limits.maxAutoReplies) {
    return res.status(403).json({
      error: `Limit auto-reply tercapai (${limits.maxAutoReplies}). Upgrade ke Pro untuk unlimited.`,
      code: "LIMIT_REACHED",
      limit: limits.maxAutoReplies
    })
  }

  replies.push({
    id: Date.now().toString(),
    keyword: keyword.toLowerCase(),
    response,
    matchType: matchType || "contains",
    enabled: enabled !== false,
    imagePath: image || null,
    createdAt: new Date().toISOString(),
  })
  writeAutoReplies(userId, replies)

  res.json({ success: true })
})

app.put("/api/:userId/autoreplies/:id", requireUserAuth, (req, res) => {
  const { userId, id } = req.params
  const updates = req.body

  let replies = readAutoReplies(userId)
  const index = replies.findIndex((r) => r.id === id)

  if (index === -1) {
    return res.status(404).json({ error: "Auto reply not found" })
  }

  replies[index] = { ...replies[index], ...updates }
  writeAutoReplies(userId, replies)

  res.json({ success: true })
})

app.delete("/api/:userId/autoreplies/:id", requireUserAuth, (req, res) => {
  const { userId, id } = req.params
  let replies = readAutoReplies(userId)
  replies = replies.filter((r) => r.id !== id)
  writeAutoReplies(userId, replies)
  res.json({ success: true })
})

// ===== TEMPLATES =====
app.get("/api/:userId/templates", requireUserAuth, (req, res) => {
  res.json(readTemplates(req.params.userId))
})

app.post("/api/:userId/templates", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const { name, message } = req.body

  if (!name || !message) {
    return res.status(400).json({ error: "Name and message are required" })
  }

  const templates = readTemplates(userId)
  const limits = getUserLimits(userId)

  // Check template limit
  if (templates.length >= limits.maxTemplates) {
    return res.status(403).json({
      error: `Limit template tercapai (${limits.maxTemplates}). Upgrade ke Pro untuk unlimited.`,
      code: "LIMIT_REACHED",
      limit: limits.maxTemplates
    })
  }

  templates.push({
    id: Date.now().toString(),
    name,
    message,
    createdAt: new Date().toISOString(),
  })
  writeTemplates(userId, templates)

  res.json({ success: true })
})

app.put("/api/:userId/templates/:id", requireUserAuth, (req, res) => {
  const { userId, id } = req.params
  const { name, message } = req.body

  let templates = readTemplates(userId)
  const index = templates.findIndex((t) => t.id === id)

  if (index === -1) {
    return res.status(404).json({ error: "Template not found" })
  }

  templates[index] = { ...templates[index], name, message }
  writeTemplates(userId, templates)

  res.json({ success: true })
})

app.delete("/api/:userId/templates/:id", requireUserAuth, (req, res) => {
  const { userId, id } = req.params
  let templates = readTemplates(userId)
  templates = templates.filter((t) => t.id !== id)
  writeTemplates(userId, templates)
  res.json({ success: true })
})

// ===== SCHEDULES =====
app.get("/api/:userId/schedules", requireUserAuth, (req, res) => {
  res.json(readSchedules(req.params.userId))
})

app.post("/api/:userId/schedules", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const {
    name,
    message,
    groupIds,
    groups,
    scheduledTime,
    recurring,
    repeat,
    image,
  } = req.body

  // Support both 'groupIds' and 'groups' from frontend
  const targetGroups = groupIds || groups

  if (!scheduledTime || !targetGroups || targetGroups.length === 0) {
    return res
      .status(400)
      .json({ error: "Scheduled time and groups are required" })
  }

  const schedules = readSchedules(userId)
  const limits = getUserLimits(userId)

  // Check schedule limit (only count pending schedules)
  const pendingSchedules = schedules.filter(s => s.status === 'pending')
  if (pendingSchedules.length >= limits.maxSchedules) {
    return res.status(403).json({
      error: `Limit schedule tercapai (${limits.maxSchedules}). Upgrade ke Pro untuk unlimited.`,
      code: "LIMIT_REACHED",
      limit: limits.maxSchedules
    })
  }

  schedules.push({
    id: Date.now().toString(),
    name:
      name || `Schedule ${new Date(scheduledTime).toLocaleDateString("id-ID")}`,
    type: image ? "image" : "text",
    message,
    image: image || null,
    groupIds: targetGroups,
    scheduledTime,
    recurring: recurring || repeat || "none",
    status: "pending",
    createdAt: new Date().toISOString(),
  })
  writeSchedules(userId, schedules)

  res.json({ success: true })
})

app.delete("/api/:userId/schedules/:id", requireUserAuth, (req, res) => {
  const { userId, id } = req.params
  let schedules = readSchedules(userId)
  schedules = schedules.filter((s) => s.id !== id)
  writeSchedules(userId, schedules)
  res.json({ success: true })
})

// ===== COMMANDS =====
app.get("/api/:userId/commands", requireUserAuth, (req, res) => {
  res.json(readCommands(req.params.userId))
})

app.post("/api/:userId/commands", requireUserAuth, (req, res) => {
  const { userId } = req.params
  let { command, response } = req.body

  if (!command || !response) {
    return res.status(400).json({ error: "Command and response are required" })
  }

  if (!command.startsWith("!")) command = "!" + command

  const commands = readCommands(userId)
  const limits = getUserLimits(userId)

  // Check command limit
  if (commands.length >= limits.maxCommands) {
    return res.status(403).json({
      error: `Limit command tercapai (${limits.maxCommands}). Upgrade ke Pro untuk unlimited.`,
      code: "LIMIT_REACHED",
      limit: limits.maxCommands
    })
  }

  commands.push({
    id: Date.now().toString(),
    command: command.toLowerCase(),
    response,
    enabled: true,
    createdAt: new Date().toISOString(),
  })
  writeCommands(userId, commands)

  res.json({ success: true })
})

app.put("/api/:userId/commands/:id", requireUserAuth, (req, res) => {
  const { userId, id } = req.params
  let commands = readCommands(userId)
  const index = commands.findIndex((c) => c.id === id)

  if (index === -1) {
    return res.status(404).json({ error: "Command not found" })
  }

  commands[index] = { ...commands[index], ...req.body }
  writeCommands(userId, commands)

  res.json({ success: true })
})

app.delete("/api/:userId/commands/:id", requireUserAuth, (req, res) => {
  const { userId, id } = req.params
  let commands = readCommands(userId)
  commands = commands.filter((c) => c.id !== id)
  writeCommands(userId, commands)
  res.json({ success: true })
})

// ===== CONTACTS =====
app.get("/api/:userId/contacts", requireUserAuth, (req, res) => {
  res.json(readContacts(req.params.userId))
})

app.post("/api/:userId/contacts", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const { name, number, notes } = req.body

  if (!name || !number) {
    return res.status(400).json({ error: "Name and number are required" })
  }

  const contacts = readContacts(userId)
  contacts.push({
    id: Date.now().toString(),
    name,
    number: number.replace(/\D/g, ""),
    notes: notes || "",
    createdAt: new Date().toISOString(),
  })
  writeContacts(userId, contacts)

  res.json({ success: true })
})

app.delete("/api/:userId/contacts/:id", requireUserAuth, (req, res) => {
  const { userId, id } = req.params
  let contacts = readContacts(userId)
  contacts = contacts.filter((c) => c.id !== id)
  writeContacts(userId, contacts)
  res.json({ success: true })
})

// ===== BLACKLIST =====
app.get("/api/:userId/blacklist", requireUserAuth, (req, res) => {
  res.json(readBlacklist(req.params.userId))
})

app.post("/api/:userId/blacklist", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const { number, reason } = req.body

  if (!number) {
    return res.status(400).json({ error: "Number is required" })
  }

  const blacklist = readBlacklist(userId)
  blacklist.push({
    id: Date.now().toString(),
    number: number.replace(/\D/g, ""),
    reason: reason || "",
    createdAt: new Date().toISOString(),
  })
  writeBlacklist(userId, blacklist)

  res.json({ success: true })
})

app.delete("/api/:userId/blacklist/:id", requireUserAuth, (req, res) => {
  const { userId, id } = req.params
  let blacklist = readBlacklist(userId)
  blacklist = blacklist.filter((b) => b.id !== id)
  writeBlacklist(userId, blacklist)
  res.json({ success: true })
})

// ===== HISTORY =====
app.get("/api/:userId/history", requireUserAuth, (req, res) => {
  res.json(readHistory(req.params.userId))
})

app.delete("/api/:userId/history", requireUserAuth, (req, res) => {
  writeHistory(req.params.userId, [])
  res.json({ success: true })
})

// ===== SETTINGS =====
app.get("/api/:userId/settings", requireUserAuth, (req, res) => {
  const settings = readSettings(req.params.userId)
  // Mask password
  settings.auth = { ...settings.auth, password: "********" }
  res.json(settings)
})

app.put("/api/:userId/settings", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const current = readSettings(userId)
  const updates = req.body

  const newSettings = {
    auth: { ...current.auth, ...updates.auth },
    queue: { ...current.queue, ...updates.queue },
    typing: { ...current.typing, ...updates.typing },
    webhook: { ...current.webhook, ...updates.webhook },
  }

  // Don't update password if masked
  if (updates.auth?.password === "********") {
    newSettings.auth.password = current.auth.password
  }

  writeSettings(userId, newSettings)
  res.json({ success: true })
})

// ===== QUICK ACTIONS =====
app.get("/api/:userId/quickactions", requireUserAuth, (req, res) => {
  res.json(readQuickActions(req.params.userId))
})

app.post("/api/:userId/quickactions", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const { name, message, icon, groups } = req.body

  if (!name) {
    return res.status(400).json({ error: "Name is required" })
  }

  const actions = readQuickActions(userId)
  actions.push({
    id: Date.now().toString(),
    name,
    message: message || "",
    icon: icon || "⚡",
    groupIds: groups || [],
    createdAt: new Date().toISOString(),
  })
  writeQuickActions(userId, actions)

  res.json({ success: true })
})

app.post(
  "/api/:userId/quickactions/:id/execute",
  requireSession,
  async (req, res) => {
    const { userId, id } = req.params
    const actions = readQuickActions(userId)
    const action = actions.find((a) => a.id === id)

    if (!action) {
      return res.status(404).json({ error: "Quick action not found" })
    }

    const settings = readSettings(userId)
    const processedMessage = processMessageVariables(action.message)
    const results = []

    for (let i = 0; i < action.groupIds.length; i++) {
      const groupId = action.groupIds[i]

      try {
        if (settings.typing?.enabled) {
          const chat = await req.client.getChatById(groupId)
          await chat.sendStateTyping()
          await delay(settings.typing.durationMs || 1500)
        }

        await req.client.sendMessage(groupId, processedMessage)
        results.push({ groupId, success: true })

        if (settings.queue?.enabled && i < action.groupIds.length - 1) {
          await delay(settings.queue.delayMs || 2000)
        }
      } catch (error) {
        results.push({ groupId, success: false, error: error.message })
      }
    }

    res.json({
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    })
  }
)

app.delete("/api/:userId/quickactions/:id", requireUserAuth, (req, res) => {
  const { userId, id } = req.params
  let actions = readQuickActions(userId)
  actions = actions.filter((a) => a.id !== id)
  writeQuickActions(userId, actions)
  res.json({ success: true })
})

// ===== BACKUP =====
app.get("/api/:userId/backup", requireUserAuth, (req, res) => {
  const { userId } = req.params

  const backup = {
    exportedAt: new Date().toISOString(),
    userId,
    groups: readGroups(userId),
    templates: readTemplates(userId),
    schedules: readSchedules(userId),
    autoReplies: readAutoReplies(userId),
    commands: readCommands(userId),
    quickActions: readQuickActions(userId),
    contacts: readContacts(userId),
    blacklist: readBlacklist(userId),
    settings: readSettings(userId),
  }

  res.json(backup)
})

app.post("/api/:userId/backup/restore", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const backup = req.body

  try {
    if (backup.groups) writeGroups(userId, backup.groups)
    if (backup.templates) writeTemplates(userId, backup.templates)
    if (backup.schedules) writeSchedules(userId, backup.schedules)
    if (backup.autoReplies) writeAutoReplies(userId, backup.autoReplies)
    if (backup.commands) writeCommands(userId, backup.commands)
    if (backup.quickActions) writeQuickActions(userId, backup.quickActions)
    if (backup.contacts) writeContacts(userId, backup.contacts)
    if (backup.blacklist) writeBlacklist(userId, backup.blacklist)
    if (backup.settings) writeSettings(userId, backup.settings)

    res.json({ success: true, message: "Backup restored successfully" })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ===== STATISTICS =====
app.get("/api/:userId/stats", requireUserAuth, (req, res) => {
  const { userId } = req.params

  const history = readHistory(userId)
  const groups = readGroups(userId)
  const autoReplies = readAutoReplies(userId)

  const today = new Date().toDateString()
  const todayHistory = history.filter(
    (h) => new Date(h.timestamp).toDateString() === today
  )

  const totalSent = history.reduce((sum, h) => sum + (h.successCount || 0), 0)
  const todaySent = todayHistory.reduce(
    (sum, h) => sum + (h.successCount || 0),
    0
  )

  res.json({
    totalGroups: groups.length,
    totalAutoReplies: autoReplies.length,
    totalSent,
    todaySent,
    historyCount: history.length,
  })
})

// ===== MEDIA LIBRARY =====
app.get("/api/:userId/media", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const userUploadsDir = path.join(UPLOADS_DIR, userId)

  if (!fs.existsSync(userUploadsDir)) {
    fs.mkdirSync(userUploadsDir, { recursive: true })
    return res.json([])
  }

  try {
    const files = fs.readdirSync(userUploadsDir)
    const mediaFiles = files
      .filter((f) => /\.(jpg|jpeg|png|gif|webp|mp4|mp3|pdf|doc|docx)$/i.test(f))
      .map((f) => ({
        filename: f,
        url: `/uploads/${userId}/${f}`,
        size: fs.statSync(path.join(userUploadsDir, f)).size,
        createdAt: fs.statSync(path.join(userUploadsDir, f)).birthtime,
      }))
    res.json(mediaFiles)
  } catch (e) {
    res.json([])
  }
})

app.post(
  "/api/:userId/media",
  requireUserAuth,
  upload.single("file"),
  (req, res) => {
    const { userId } = req.params
    const userUploadsDir = path.join(UPLOADS_DIR, userId)

    if (!fs.existsSync(userUploadsDir)) {
      fs.mkdirSync(userUploadsDir, { recursive: true })
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    // Move file to user's upload directory
    const oldPath = req.file.path
    const newPath = path.join(userUploadsDir, req.file.filename)
    fs.renameSync(oldPath, newPath)

    res.json({
      success: true,
      filename: req.file.filename,
      url: `/uploads/${userId}/${req.file.filename}`,
    })
  }
)

app.delete("/api/:userId/media/:filename", requireUserAuth, (req, res) => {
  const { userId, filename } = req.params

  // Security: Sanitize filename to prevent path traversal
  const sanitizedFilename = path.basename(filename)
  if (sanitizedFilename !== filename || filename.includes("..")) {
    return res.status(400).json({ error: "Invalid filename" })
  }

  const filePath = path.join(UPLOADS_DIR, userId, sanitizedFilename)

  // Security: Verify the resolved path is still within UPLOADS_DIR
  const resolvedPath = path.resolve(filePath)
  const uploadsBase = path.resolve(UPLOADS_DIR)
  if (!resolvedPath.startsWith(uploadsBase)) {
    return res.status(400).json({ error: "Invalid path" })
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    res.json({ success: true })
  } else {
    res.status(404).json({ error: "File not found" })
  }
})

// Serve user uploads
app.use("/uploads", express.static(UPLOADS_DIR))

// ===== LEGACY ENDPOINTS (for backward compatibility) =====
app.get("/api/status", (req, res) => {
  // Return first connected session status or disconnected
  let status = "disconnected"

  sessions.forEach((client, oderId) => {
    if (sessionStatuses.get(oderId) === "connected") {
      status = "connected"
    }
  })

  res.json({ status })
})

// ===== SCHEDULE CHECKER =====
async function checkSchedules() {
  const now = new Date()

  // Check schedules for all active sessions
  sessions.forEach(async (client, userId) => {
    if (sessionStatuses.get(userId) !== "connected") return

    const schedules = readSchedules(userId)
    const settings = readSettings(userId)

    for (const schedule of schedules) {
      if (schedule.status === "sent") continue

      const scheduledTime = new Date(schedule.scheduledTime)
      if (now >= scheduledTime) {
        console.log(`[${userId}] Executing scheduled broadcast: ${schedule.id}`)

        let successCount = 0
        let failCount = 0

        for (const groupId of schedule.groupIds) {
          try {
            if (settings.typing?.enabled) {
              const chat = await client.getChatById(groupId)
              await chat.sendStateTyping()
              await delay(settings.typing.durationMs || 1500)
            }

            const message = processMessageVariables(schedule.message || "")

            // Send with image if available
            if (schedule.image && schedule.image.startsWith("data:")) {
              const matches = schedule.image.match(/^data:(.+);base64,(.+)$/)
              if (matches) {
                const media = new MessageMedia(matches[1], matches[2])
                await client.sendMessage(groupId, media, { caption: message })
              } else {
                await client.sendMessage(groupId, message)
              }
            } else {
              await client.sendMessage(groupId, message)
            }
            successCount++

            if (settings.queue?.enabled) {
              await delay(settings.queue.delayMs || 2000)
            }
          } catch (error) {
            failCount++
            console.error(
              `[${userId}] Failed to send scheduled message to ${groupId}:`,
              error.message
            )
          }
        }

        // Update schedule status
        schedule.status = "sent"
        schedule.sentAt = new Date().toISOString()
        writeSchedules(userId, schedules)

        // Add to history
        const history = readHistory(userId)
        history.push({
          id: Date.now().toString(),
          type: "text",
          message: schedule.message.substring(0, 100),
          groupCount: schedule.groupIds.length,
          successCount,
          failCount,
          scheduled: true,
          timestamp: new Date().toISOString(),
        })
        writeHistory(userId, history)

        console.log(
          `[${userId}] Scheduled broadcast completed: ${successCount} success, ${failCount} failed`
        )
      }
    }
  })
}

// Run schedule checker every minute
setInterval(checkSchedules, 60000)

// ===== START SERVER =====
async function startServer() {
  console.log("🚀 Starting WhatsApp Bot SaaS Server...")
  console.log("✅ Using SQLite database at:", DB_PATH)

  // Start Express server
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`)
    console.log("")
    console.log("📌 Session Management Endpoints:")
    console.log(
      `   POST /api/session/start     - Start a new session (body: { userId })`
    )
    console.log(`   GET  /api/session/qr/:userId - Get QR code for scanning`)
    console.log(`   GET  /api/session/status/:userId - Get session status`)
    console.log(`   GET  /api/sessions          - List all active sessions`)
    console.log(`   DELETE /api/session/:userId - Destroy a session`)
    console.log("")
    console.log("📌 Per-User API Endpoints:")
    console.log(`   GET/POST /api/:userId/groups`)
    console.log(`   POST /api/:userId/broadcast`)
    console.log(`   GET/POST /api/:userId/autoreplies`)
    console.log(`   GET/POST /api/:userId/templates`)
    console.log(`   GET/POST /api/:userId/schedules`)
    console.log(`   GET/POST /api/:userId/commands`)
    console.log(`   GET/POST /api/:userId/settings`)
    console.log(`   GET /api/:userId/stats`)
    console.log("")
  })
}

// ===== GRACEFUL SHUTDOWN =====
async function gracefulShutdown(signal) {
  console.log(`\n⚠️ ${signal} received. Starting graceful shutdown...`)

  // Save all active sessions before exit
  if (sessions.size > 0) {
    console.log(`💾 Saving ${sessions.size} active session(s)...`)

    for (const [userId, client] of sessions) {
      try {
        if (client && sessionStatuses.get(userId) === "connected") {
          console.log(`   Saving session for: ${userId}`)
          // LocalAuth saves sessions automatically to filesystem
        }
      } catch (error) {
        console.error(`   Failed to save session for ${userId}:`, error.message)
      }
    }

    // Wait a bit for LocalAuth to save
    console.log("⏳ Waiting for session save (3 seconds)...")
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  // Close SQLite connection
  try {
    db.close()
    console.log("✅ SQLite database closed")
  } catch (error) {
    console.error("❌ Error closing SQLite:", error.message)
  }

  console.log("👋 Shutdown complete")
  process.exit(0)
}

// Handle shutdown signals (PM2 restart, Ctrl+C, etc)
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))

// Handle uncaught errors (prevent crash without saving)
process.on("uncaughtException", async (error) => {
  console.error("❌ Uncaught Exception:", error)
  await gracefulShutdown("UNCAUGHT_EXCEPTION")
})

process.on("unhandledRejection", async (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason)
  // Don't exit on unhandled rejection, just log it
})

// Start the server
startServer()
