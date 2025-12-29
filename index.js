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

const JWT_SECRET = process.env.JWT_SECRET || "personal-secret-key-" + crypto.randomBytes(16).toString("hex")
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123"
const zlib = require("zlib")
const multer = require("multer")
const cron = require("node-cron")

const app = express()

// Security: Reduce payload limit (prevent DoS)
app.use(express.json({ limit: "10mb" }))

// Security: Add security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  // Content Security Policy - restrict script sources
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://cdn.socket.io; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' ws: wss: https://unpkg.com https://cdn.socket.io;")
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
})

// Clean URLs (tanpa .html)
// Main App Route (Promotional Landing)
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "landing.html"))
)
app.get("/scan", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "scan.html"))
)
app.get("/login", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "login.html"))
)
app.get("/app", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "app.html"))
)

// Simplified Auth Middleware for Personal App
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "")
    if (!token) return res.status(401).json({ error: "Authentication required" })

    const decoded = jwt.verify(token, JWT_SECRET)
    if (decoded.userId !== "owner") return res.status(403).json({ error: "Access denied" })

    req.authUserId = "owner"
    next()
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" })
  }
}

// Global requireUserAuth (same as requireAuth for personal)
const requireUserAuth = requireAuth;

// Middleware that requires an active WhatsApp session and attaches client to req
async function requireSession(req, res, next) {
  try {
    // First verify authentication
    const token = req.headers.authorization?.replace("Bearer ", "")
    if (!token) return res.status(401).json({ error: "Authentication required" })

    const decoded = jwt.verify(token, JWT_SECRET)
    if (decoded.userId !== "owner") return res.status(403).json({ error: "Access denied" })

    req.authUserId = "owner"

    // Get userId from params
    const userId = req.params.userId || "owner"

    // Check if session exists and is connected
    const client = sessions.get(userId)
    const status = sessionStatuses.get(userId)

    if (!client) {
      return res.status(400).json({
        error: "No WhatsApp session found. Please scan QR code first.",
        needsReconnect: true
      })
    }

    if (status !== "connected") {
      return res.status(400).json({
        error: `WhatsApp session is ${status || 'not ready'}. Please reconnect.`,
        status: status,
        needsReconnect: true
      })
    }

    // Attach client to request
    req.client = client
    next()
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" })
  }
}

// Simple Login Endpoint
app.post("/api/auth/login", async (req, res) => {
  try {
    const { password } = req.body
    const owner = UserDB.findById("owner")

    if (!owner) return res.status(404).json({ error: "System error: Owner not initialized" })

    const isMatch = await bcrypt.compare(password, owner.password)
    if (!isMatch) return res.status(401).json({ error: "Password salah!" })

    const token = jwt.sign({ userId: "owner" }, JWT_SECRET, { expiresIn: "30d" })
    res.json({ success: true, token, user: { id: "owner", name: owner.name } })
  } catch (error) {
    res.status(500).json({ error: "Login failed" })
  }
})

// Auth check endpoint
app.get("/api/auth/me", requireAuth, (req, res) => {
  const owner = UserDB.findById("owner")
  res.json({ success: true, user: { ...owner, isActive: true } })
})

// Password change endpoint
app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Password lama dan baru harus diisi" })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password baru minimal 6 karakter" })
    }

    const owner = UserDB.findById("owner")
    if (!owner) return res.status(404).json({ error: "User tidak ditemukan" })

    const isMatch = await bcrypt.compare(oldPassword, owner.password)
    if (!isMatch) {
      return res.status(401).json({ error: "Password lama salah!" })
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10)
    db.prepare("UPDATE users SET password = ? WHERE id = 'owner'").run(hashedPassword)

    res.json({ success: true, message: "Password berhasil diubah!" })
  } catch (error) {
    console.error("Password change error:", error)
    res.status(500).json({ error: "Gagal mengubah password" })
  }
})

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
            let autoreplies = [];
            let templates = [];
            let commands = [];
            let schedules = [];
            let crmContacts = [];
            let crmSequences = [];
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

            function showAddSequence() {
                Swal.fire({
                    title: '⚡ Create Sequence',
                    html: '<div style=\"text-align:left;\">' +
                            '<label style=\"display:block; margin-bottom:4px; color:#8696a0;\">📛 Sequence Name</label>' +
                            '<input class=\"swal2-input\" placeholder=\"Follow-up Sequence\" style=\"width:100%; margin:0 0 12px 0;\">' +
                            '<div style=\"display:flex; gap:10px;\">' +
                                '<div style=\"flex:1;\">' +
                                    '<label style=\"display:block; margin-bottom:4px; color:#8696a0;\">🔄 Max Follow-ups</label>' +
                                    '<select class=\"swal2-select\" style=\"width:100%; margin:0 0 12px 0;\">' +
                                        '<option value=\"3\" selected>3</option>' +
                                    '</select>' +
                                '</div>' +
                                '<div style=\"flex:1;\">' +
                                    '<label style=\"display:block; margin-bottom:4px; color:#8696a0;\">⏰ Delay (days)</label>' +
                                    '<input type=\"number\" class=\"swal2-input\" value=\"3\" min=\"1\" style=\"width:100%; margin:0 0 12px 0;\">' +
                                '</div>' +
                            '</div>' +
                            '<label style=\"display:block; margin-bottom:4px; color:#8696a0;\">⚡ Trigger Keywords</label>' +
                            '<input class=\"swal2-input\" placeholder=\"halo, info\" style=\"width:100%; margin:0 0 12px 0;\">' +
                            '<label style=\"display:block; margin-bottom:4px; color:#8696a0;\">🛑 Stop Keywords</label>' +
                            '<input class=\"swal2-input\" placeholder=\"stop, dnc\" style=\"width:100%; margin:0 0 12px 0;\">' +
                        '</div>',
                    background: '#1f2c34',
                    color: '#e9edef'
                });
            }

            function showAddCrmContact() {
                Swal.fire({
                    title: '➕ Add CRM Contact',
                    html: '<div style=\"text-align:left;\">' +
                            '<label style=\"display:block; margin-bottom:4px; color:#8696a0;\">📱 Phone Number</label>' +
                            '<input class=\"swal2-input\" placeholder=\"628123456789\" style=\"width:100%; margin:0 0 12px 0;\">' +
                            '<label style=\"display:block; margin-bottom:4px; color:#8696a0;\">👤 Name</label>' +
                            '<input class=\"swal2-input\" placeholder=\"John Doe\" style=\"width:100%; margin:0 0 12px 0;\">' +
                            '<label style=\"display:block; margin-bottom:4px; color:#8696a0;\">🏷️ Tags</label>' +
                            '<input class=\"swal2-input\" placeholder=\"vip, lead\" style=\"width:100%; margin:0 0 12px 0;\">' +
                        '</div>',
                    background: '#1f2c34',
                    color: '#e9edef'
                });
            }

            window.switchCrmView = function(mode) {
                const kv = document.getElementById('crmKanbanView');
                const lv = document.getElementById('crmListView');
                if (kv) kv.classList.toggle('hidden', mode !== 'kanban');
                if (lv) lv.classList.toggle('hidden', mode !== 'list');
            };

            window.escapeHtml = function(str) {
                const div = document.createElement('div');
                div.textContent = str || '';
                return div.innerHTML;
            };

            window.showCrmContactActions = function(id) {
                const contact = crmContacts.find(c => c.id === id);
                if (!contact) return;
                crmCurrentContactId = id;
                const info = document.getElementById('crmContactActionsInfo');
                if (info) info.textContent = 'Actions for ' + (contact.name || contact.phone);
                const modal = document.getElementById('crmContactActionsModal');
                if (modal) modal.classList.remove('hidden');
            };

            window.renderCrmContacts = function() {
                const list = document.getElementById('crmContactsList');
                if (!list) return;
                list.innerHTML = crmContacts.map(c => 
                    '<div class=\"card-list-item\">' +
                        '<div class=\"card-info\">' +
                            '<div class=\"card-title\">' + escapeHtml(c.name || c.phone) + '</div>' +
                            '<div class=\"card-subtitle\">' + escapeHtml(c.phone) + (c.sequenceId ? ' • In Sequence' : '') + '</div>' +
                        '</div>' +
                        '<div class=\"flex gap-2\">' +
                            '<button class=\"btn btn-sm btn-secondary\" onclick=\"window.showCrmContactActions(\'' + c.id + '\')\">⚡</button>' +
                        '</div>' +
                    '</div>'
                ).join('');
            };

            window.renderCrmKanban = function() {
                const stages = ['new', 'offered', 'interested', 'closed', 'dnc'];
                stages.forEach(stage => {
                    const list = document.getElementById('list-' + stage);
                    if (!list) return;
                    const count = document.getElementById('count-' + stage);
                    const contacts = crmContacts.filter(c => c.stage === stage);
                    if (count) count.textContent = contacts.length;
                    
                    if (contacts.length === 0) {
                        list.innerHTML = '<div class=\"empty-state\" style=\"padding:10px; font-size:11px; opacity:0.5;\">No contacts</div>';
                        return;
                    }
                    list.innerHTML = contacts.map(c => 
                        '<div class=\"kanban-card\">' +
                            '<div class=\"kanban-card-title\">' + escapeHtml(c.name || 'No Name') + '</div>' +
                            '<div class=\"kanban-card-phone\">' + c.phone + '</div>' +
                            '<div class=\"kanban-card-footer\">' +
                                '<span class=\"kanban-tag\">' + (c.sequenceId ? '⚡ Active' : 'Idle') + '</span>' +
                                '<button class=\"btn btn-sm btn-icon\" onclick=\"window.showCrmContactActions(\'' + c.id + '\')\">⋮</button>' +
                            '</div>' +
                        '</div>'
                    ).join('');
                });
            };

            let crmCurrentContactId = null;
            function crmActionChangeStage() { showToast('Preview: Opening stage selector'); closeModal('crmContactActionsModal'); }
            function crmActionStartSequence() { showToast('Preview: Opening sequence selector'); closeModal('crmContactActionsModal'); }
            function crmActionStopSequence() { showToast('Sequence stopped (preview)', 'success'); closeModal('crmContactActionsModal'); }
            function crmActionMarkAs(s) { showToast('Marked as ' + s + ' (preview)', 'success'); closeModal('crmContactActionsModal'); }

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

                // Render some dummy activity
                const activityContainer = document.getElementById('recentActivity');
                if (activityContainer) {
                    activityContainer.innerHTML = '<div class=\"activity-item\">' +
                            '<div class=\"activity-icon-small\">🔑</div>' +
                            '<div class=\"activity-content\">' +
                                '<div class=\"activity-text\">Login successful</div>' +
                                '<div class=\"activity-time\">Just now</div>' +
                            '</div>' +
                        '</div>' +
                        '<div class=\"activity-item\">' +
                            '<div class=\"activity-icon-small\">⚡</div>' +
                            '<div class=\"activity-content\">' +
                                '<div class=\"activity-text\">Trigger detected: halo</div>' +
                                '<div class=\"activity-time\">5 minutes ago</div>' +
                            '</div>' +
                        '</div>';
                }

                // Mock CRM Data for Preview
                crmContacts = [
                    { id: 'mock1', name: 'Ayu', phone: '6285939459783', stage: 'new', tags: 'VIP', sequenceId: null },
                    { id: 'mock2', name: 'Budi', phone: '628123456789', stage: 'offered', tags: 'Hot Lead', sequenceId: 'seq1' }
                ];
                renderCrmContacts();
                renderCrmKanban();
            });
        </script>`
    )
    res.send(previewHtml)
  })
}
app.use(express.static("public"))

// Trust proxy for rate limiting (if behind nginx/cloudflare)
app.set("trust proxy", 1)

// JWT_SECRET defined at top of file

// ===== ADMIN KEY =====
const ADMIN_KEY = process.env.ADMIN_KEY || "admin-secret-key"
if (!process.env.ADMIN_KEY || process.env.ADMIN_KEY === "admin-secret-key") {
  console.warn(
    "⚠️  WARNING: ADMIN_KEY not set or using default! Set a strong key in .env"
  )
}

// ===== SQLITE DATABASE SETUP =====
const DB_PATH = path.join(__dirname, "data", "database.sqlite")
const db = new Database(DB_PATH)

// Create users table
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        phone TEXT UNIQUE,
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

// Add phone column if not exists (for existing databases)
try {
  db.exec(`ALTER TABLE users ADD COLUMN phone TEXT UNIQUE`)
  console.log("✅ Added phone column to users table")
} catch (e) {
  // Column already exists, ignore
}

// Add suspension columns if not exists
try {
  db.exec(`ALTER TABLE users ADD COLUMN suspended INTEGER DEFAULT 0`)
  db.exec(`ALTER TABLE users ADD COLUMN suspendedAt TEXT`)
  db.exec(`ALTER TABLE users ADD COLUMN suspendReason TEXT`)
  console.log("✅ Added suspension columns to users table")
} catch (e) {
  // Columns already exist, ignore
}

// Create activity_logs table
db.exec(`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    action TEXT NOT NULL,
    details TEXT,
    targetCount INTEGER DEFAULT 0,
    ip TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)

// Create index for faster queries
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_userId ON activity_logs(userId)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_action ON activity_logs(action)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_createdAt ON activity_logs(createdAt)`)
} catch (e) {
  // Indexes already exist
}

// ===== CRM AUTOMATION TABLES =====
// Contacts table for CRM pipeline
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_contacts (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    phone TEXT NOT NULL,
    name TEXT,
    stage TEXT DEFAULT 'new',
    sequenceId TEXT,
    sequenceStep INTEGER DEFAULT 0,
    lastContactedAt TEXT,
    nextFollowUpAt TEXT,
    followUpCount INTEGER DEFAULT 0,
    notes TEXT,
    tags TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)

// Sequences table for automation workflows
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_sequences (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    steps TEXT NOT NULL,
    triggerKeywords TEXT,
    stopKeywords TEXT,
    maxFollowUps INTEGER DEFAULT 3,
    isActive INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)

// Create indexes for CRM tables
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_contacts_userId ON crm_contacts(userId)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_contacts_stage ON crm_contacts(stage)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_contacts_nextFollowUp ON crm_contacts(nextFollowUpAt)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_crm_sequences_userId ON crm_sequences(userId)`)
} catch (e) {
  // Indexes already exist
}

console.log("✅ CRM Automation tables initialized")

// Initialize owner user if not exists
try {
  const owner = db.prepare("SELECT * FROM users WHERE id = 'owner'").get()
  const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10)

  if (!owner) {
    db.prepare(`
            INSERT INTO users (id, email, name, password, plan, maxGroups, maxBroadcastPerDay)
            VALUES ('owner', 'owner@autosapa.tool', 'Owner', ?, 'pro', 999, 999)
        `).run(hashedPassword)
    console.log("👤 Created default owner user")
  } else {
    // Update password if env changed or to ensure it's hashed correctly
    db.prepare("UPDATE users SET password = ? WHERE id = 'owner'").run(hashedPassword)
  }
} catch (e) {
  console.error("❌ Failed to initialize owner user:", e.message)
}

// ===== USER HELPER FUNCTIONS (SQLite) =====
const UserDB = {
  findOne: (query) => {
    if (query.email) {
      const row = db
        .prepare("SELECT * FROM users WHERE email = ?")
        .get(query.email.toLowerCase())
      return row ? UserDB._formatUser(row) : null
    }
    if (query.phone) {
      const row = db
        .prepare("SELECT * FROM users WHERE phone = ?")
        .get(query.phone)
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
    phone: row.phone,
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
    suspended: row.suspended || 0,
    suspendedAt: row.suspendedAt,
    suspendReason: row.suspendReason,
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

  delete: (id) => {
    db.prepare("DELETE FROM users WHERE id = ?").run(id)
  },
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

// Helper function to get user limits (Unlimited for personal app)
function getUserLimits(userId) {
  return PLAN_LIMITS.pro
}

// ===== ACTIVITY LOGGING =====
const ActivityLog = {
  // Log an activity
  log: (userId, action, details = null, targetCount = 0, ip = null) => {
    try {
      const stmt = db.prepare(`
        INSERT INTO activity_logs (userId, action, details, targetCount, ip, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      stmt.run(userId, action, details, targetCount, ip, new Date().toISOString())
    } catch (e) {
      console.error("Failed to log activity:", e.message)
    }
  },

  // Get logs with pagination
  getLogs: (options = {}) => {
    const { userId, action, limit = 100, offset = 0 } = options
    let query = "SELECT * FROM activity_logs WHERE 1=1"
    const params = []

    if (userId) {
      query += " AND userId = ?"
      params.push(userId)
    }
    if (action) {
      query += " AND action = ?"
      params.push(action)
    }

    query += " ORDER BY createdAt DESC LIMIT ? OFFSET ?"
    params.push(limit, offset)

    return db.prepare(query).all(...params)
  },

  // Get activity stats for a user (last 24 hours)
  getUserStats: (userId) => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const stats = db.prepare(`
      SELECT action, COUNT(*) as count, SUM(targetCount) as totalTargets
      FROM activity_logs 
      WHERE userId = ? AND createdAt > ?
      GROUP BY action
    `).all(userId, yesterday)

    return stats.reduce((acc, s) => {
      acc[s.action] = { count: s.count, targets: s.totalTargets || 0 }
      return acc
    }, {})
  },

  // Clean old logs (older than 30 days)
  cleanup: () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    db.prepare("DELETE FROM activity_logs WHERE createdAt < ?").run(thirtyDaysAgo)
  }
}

// ===== SPAM DETECTION =====
const SPAM_THRESHOLDS = {
  broadcastsPerDay: 100,      // Max broadcasts per day
  autoRepliesPerHour: 50,     // Max auto-replies per hour
  messagesPerMinute: 20,      // Max messages per minute
  suspiciousKeywords: [
    "judi", "togel", "slot", "casino", "betting",
    "pinjol", "pinjaman online", "gestun",
    "invest bodong", "money game", "ponzi",
    "narkoba", "drugs", "ganja"
  ]
}

function checkSuspiciousActivity(userId) {
  const stats = ActivityLog.getUserStats(userId)
  const issues = []
  let riskScore = 0

  // Check broadcast volume
  if (stats.broadcast && stats.broadcast.targets > SPAM_THRESHOLDS.broadcastsPerDay) {
    issues.push(`High broadcast volume: ${stats.broadcast.targets} messages/day`)
    riskScore += 30
  }

  // Check auto-reply frequency (need to calculate hourly)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recentReplies = db.prepare(`
    SELECT COUNT(*) as count FROM activity_logs 
    WHERE userId = ? AND action = 'auto_reply' AND createdAt > ?
  `).get(userId, oneHourAgo)

  if (recentReplies && recentReplies.count > SPAM_THRESHOLDS.autoRepliesPerHour) {
    issues.push(`High auto-reply rate: ${recentReplies.count}/hour`)
    riskScore += 25
  }

  // Check for suspicious keywords in recent messages
  const recentLogs = db.prepare(`
    SELECT details FROM activity_logs 
    WHERE userId = ? AND action IN ('broadcast', 'schedule_sent') 
    AND createdAt > datetime('now', '-1 day')
    LIMIT 50
  `).all(userId)

  for (const log of recentLogs) {
    if (log.details) {
      const lowerDetails = log.details.toLowerCase()
      for (const keyword of SPAM_THRESHOLDS.suspiciousKeywords) {
        if (lowerDetails.includes(keyword)) {
          issues.push(`Suspicious keyword detected: "${keyword}"`)
          riskScore += 20
          break
        }
      }
    }
  }

  return {
    isSpam: riskScore >= 50,
    isSuspicious: riskScore >= 25,
    riskScore: Math.min(riskScore, 100),
    issues
  }
}

// Get all suspicious users
function getSuspiciousUsers() {
  const users = UserDB.find()
  const suspicious = []

  for (const user of users) {
    const check = checkSuspiciousActivity(user.id)
    if (check.isSuspicious) {
      suspicious.push({
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        plan: user.plan,
        suspended: user.suspended,
        ...check
      })
    }
  }

  return suspicious.sort((a, b) => b.riskScore - a.riskScore)
}

// Run log cleanup daily
setInterval(() => {
  ActivityLog.cleanup()
  console.log("🧹 Old activity logs cleaned up")
}, 24 * 60 * 60 * 1000)

// ===== CRM HELPER FUNCTIONS =====
// Stage mapping: new stages to old stages for filter
const STAGE_FILTER_MAP = {
  'lead': ['new', 'lead'],
  'in_progress': ['offered', 'interested', 'in_progress'],
  'done': ['closed', 'dnc', 'done']
}

const CRM = {
  // Contacts
  getContacts: (userId, filters = {}) => {
    let query = "SELECT * FROM crm_contacts WHERE userId = ?"
    const params = [userId]

    if (filters.stage) {
      // Check if stage is a mapped stage (lead, in_progress, done)
      const mappedStages = STAGE_FILTER_MAP[filters.stage]
      if (mappedStages) {
        // Use IN clause for mapped stages
        const placeholders = mappedStages.map(() => '?').join(', ')
        query += ` AND stage IN (${placeholders})`
        params.push(...mappedStages)
      } else {
        // Exact match for old stages
        query += " AND stage = ?"
        params.push(filters.stage)
      }
    }
    if (filters.sequenceId) {
      query += " AND sequenceId = ?"
      params.push(filters.sequenceId)
    }

    query += " ORDER BY createdAt DESC"
    return db.prepare(query).all(...params)
  },

  getContact: (userId, contactId) => {
    return db.prepare("SELECT * FROM crm_contacts WHERE userId = ? AND id = ?").get(userId, contactId)
  },

  createContact: (userId, data) => {
    const id = crypto.randomUUID()
    const stmt = db.prepare(`
      INSERT INTO crm_contacts (id, userId, phone, name, stage, notes, tags, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const now = new Date().toISOString()
    stmt.run(id, userId, data.phone, data.name || null, data.stage || 'lead', data.notes || null, data.tags || null, now, now)
    return CRM.getContact(userId, id)
  },

  updateContact: (userId, contactId, data) => {
    const updates = []
    const params = []

    if (data.name !== undefined) { updates.push("name = ?"); params.push(data.name) }
    if (data.phone !== undefined) { updates.push("phone = ?"); params.push(data.phone) }
    if (data.stage !== undefined) { updates.push("stage = ?"); params.push(data.stage) }
    if (data.sequenceId !== undefined) { updates.push("sequenceId = ?"); params.push(data.sequenceId) }
    if (data.sequenceStep !== undefined) { updates.push("sequenceStep = ?"); params.push(data.sequenceStep) }
    if (data.lastContactedAt !== undefined) { updates.push("lastContactedAt = ?"); params.push(data.lastContactedAt) }
    if (data.nextFollowUpAt !== undefined) { updates.push("nextFollowUpAt = ?"); params.push(data.nextFollowUpAt) }
    if (data.followUpCount !== undefined) { updates.push("followUpCount = ?"); params.push(data.followUpCount) }
    if (data.notes !== undefined) { updates.push("notes = ?"); params.push(data.notes) }
    if (data.tags !== undefined) { updates.push("tags = ?"); params.push(data.tags) }

    updates.push("updatedAt = ?")
    params.push(new Date().toISOString())
    params.push(userId, contactId)

    db.prepare(`UPDATE crm_contacts SET ${updates.join(", ")} WHERE userId = ? AND id = ?`).run(...params)
    return CRM.getContact(userId, contactId)
  },

  deleteContact: (userId, contactId) => {
    db.prepare("DELETE FROM crm_contacts WHERE userId = ? AND id = ?").run(userId, contactId)
  },

  // Get contacts that need follow-up
  getContactsForFollowUp: () => {
    const now = new Date().toISOString()
    return db.prepare(`
      SELECT c.*, s.steps, s.maxFollowUps 
      FROM crm_contacts c
      LEFT JOIN crm_sequences s ON c.sequenceId = s.id
      WHERE c.nextFollowUpAt IS NOT NULL 
        AND c.nextFollowUpAt <= ?
        AND c.stage NOT IN ('closed', 'dnc', 'done')
    `).all(now)
  },

  // Sequences
  getSequences: (userId) => {
    const rows = db.prepare("SELECT * FROM crm_sequences WHERE userId = ? ORDER BY createdAt DESC").all(userId)
    return rows.map(row => ({
      ...row,
      steps: JSON.parse(row.steps || '[]'),
      triggerKeywords: row.triggerKeywords ? JSON.parse(row.triggerKeywords) : [],
      stopKeywords: row.stopKeywords ? JSON.parse(row.stopKeywords) : []
    }))
  },

  getSequence: (userId, sequenceId) => {
    const row = db.prepare("SELECT * FROM crm_sequences WHERE userId = ? AND id = ?").get(userId, sequenceId)
    if (!row) return null
    return {
      ...row,
      steps: JSON.parse(row.steps || '[]'),
      triggerKeywords: row.triggerKeywords ? JSON.parse(row.triggerKeywords) : [],
      stopKeywords: row.stopKeywords ? JSON.parse(row.stopKeywords) : []
    }
  },

  createSequence: (userId, data) => {
    const id = crypto.randomUUID()
    const stmt = db.prepare(`
      INSERT INTO crm_sequences (id, userId, name, description, steps, triggerKeywords, stopKeywords, maxFollowUps, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const now = new Date().toISOString()
    stmt.run(
      id, userId, data.name, data.description || null,
      JSON.stringify(data.steps || []),
      JSON.stringify(data.triggerKeywords || []),
      JSON.stringify(data.stopKeywords || ['stop', 'unsubscribe', 'jangan hubungi']),
      data.maxFollowUps || 3,
      now, now
    )
    return CRM.getSequence(userId, id)
  },

  updateSequence: (userId, sequenceId, data) => {
    const updates = []
    const params = []

    if (data.name !== undefined) { updates.push("name = ?"); params.push(data.name) }
    if (data.description !== undefined) { updates.push("description = ?"); params.push(data.description) }
    if (data.steps !== undefined) { updates.push("steps = ?"); params.push(JSON.stringify(data.steps)) }
    if (data.triggerKeywords !== undefined) { updates.push("triggerKeywords = ?"); params.push(JSON.stringify(data.triggerKeywords)) }
    if (data.stopKeywords !== undefined) { updates.push("stopKeywords = ?"); params.push(JSON.stringify(data.stopKeywords)) }
    if (data.maxFollowUps !== undefined) { updates.push("maxFollowUps = ?"); params.push(data.maxFollowUps) }
    if (data.isActive !== undefined) { updates.push("isActive = ?"); params.push(data.isActive ? 1 : 0) }

    updates.push("updatedAt = ?")
    params.push(new Date().toISOString())
    params.push(userId, sequenceId)

    db.prepare(`UPDATE crm_sequences SET ${updates.join(", ")} WHERE userId = ? AND id = ?`).run(...params)
    return CRM.getSequence(userId, sequenceId)
  },

  deleteSequence: (userId, sequenceId) => {
    // Remove sequence from all contacts first
    db.prepare("UPDATE crm_contacts SET sequenceId = NULL, sequenceStep = 0, nextFollowUpAt = NULL WHERE userId = ? AND sequenceId = ?").run(userId, sequenceId)
    db.prepare("DELETE FROM crm_sequences WHERE userId = ? AND id = ?").run(userId, sequenceId)
  },

  // Start a sequence for a contact
  startSequence: (userId, contactId, sequenceId) => {
    const sequence = CRM.getSequence(userId, sequenceId)
    if (!sequence || !sequence.steps.length) return null

    const firstStep = sequence.steps[0]
    const nextFollowUp = new Date(Date.now() + (firstStep.delay || 0) * (firstStep.delayUnit === 'hours' ? 3600000 : 86400000))

    CRM.updateContact(userId, contactId, {
      sequenceId,
      sequenceStep: 0,
      nextFollowUpAt: nextFollowUp.toISOString(),
      stage: 'offered'
    })

    return CRM.getContact(userId, contactId)
  },

  // Stop sequence for a contact
  stopSequence: (userId, contactId, reason = null) => {
    CRM.updateContact(userId, contactId, {
      sequenceId: null,
      sequenceStep: 0,
      nextFollowUpAt: null,
      stage: reason === 'dnc' ? 'dnc' : 'new'
    })
    return CRM.getContact(userId, contactId)
  },

  // Advance to next step in sequence
  advanceSequence: (userId, contactId) => {
    const contact = CRM.getContact(userId, contactId)
    if (!contact || !contact.sequenceId) return null

    const sequence = CRM.getSequence(userId, contact.sequenceId)
    if (!sequence) return null

    const nextStep = contact.sequenceStep + 1

    // Check if we've completed all steps or hit max follow-ups
    if (nextStep >= sequence.steps.length || contact.followUpCount >= sequence.maxFollowUps) {
      CRM.updateContact(userId, contactId, {
        sequenceId: null,
        nextFollowUpAt: null,
        stage: 'dnc' // Move to do-not-contact after sequence completes
      })
      return CRM.getContact(userId, contactId)
    }

    const step = sequence.steps[nextStep]
    const nextFollowUp = new Date(Date.now() + (step.delay || 1) * (step.delayUnit === 'hours' ? 3600000 : 86400000))

    CRM.updateContact(userId, contactId, {
      sequenceStep: nextStep,
      nextFollowUpAt: nextFollowUp.toISOString(),
      followUpCount: contact.followUpCount + 1
    })

    return CRM.getContact(userId, contactId)
  },

  // Get stats for dashboard
  getStats: (userId) => {
    const stats = {
      total: 0,
      byStage: {},
      inSequence: 0,
      pendingFollowUp: 0
    }

    const rows = db.prepare(`
      SELECT stage, COUNT(*) as count FROM crm_contacts WHERE userId = ? GROUP BY stage
    `).all(userId)

    rows.forEach(row => {
      stats.byStage[row.stage] = row.count
      stats.total += row.count
    })

    const inSeq = db.prepare("SELECT COUNT(*) as count FROM crm_contacts WHERE userId = ? AND sequenceId IS NOT NULL").get(userId)
    stats.inSequence = inSeq?.count || 0

    const pending = db.prepare("SELECT COUNT(*) as count FROM crm_contacts WHERE userId = ? AND nextFollowUpAt IS NOT NULL AND nextFollowUpAt <= ?").get(userId, new Date().toISOString())
    stats.pendingFollowUp = pending?.count || 0

    return stats
  },

  // Process pending follow-ups
  processQueue: async () => {
    const contacts = CRM.getContactsForFollowUp()
    if (!contacts.length) return

    console.log(`🤖 CRM: Processing ${contacts.length} follow-ups...`)

    for (const contact of contacts) {
      const client = sessions.get(contact.userId)
      if (!client || sessionStatuses.get(contact.userId) !== "connected") {
        continue
      }

      try {
        const steps = JSON.parse(contact.steps || '[]')
        const step = steps[contact.sequenceStep]

        if (!step || !step.message) {
          CRM.updateContact(contact.userId, contact.id, { nextFollowUpAt: null })
          continue
        }

        const message = processMessageVariables(step.message, contact)
        const chatId = contact.phone.includes('@') ? contact.phone : `${contact.phone}@c.us`

        await client.sendMessage(chatId, message)
        console.log(`✅ CRM: Sent follow-up to ${contact.phone}`)

        // Log activity
        ActivityLog.log(contact.userId, 'crm_followup', `Sent follow-up step ${contact.sequenceStep + 1} to ${contact.phone}`, 1)

        // Advance sequence
        CRM.advanceSequence(contact.userId, contact.id)
      } catch (e) {
        console.error(`❌ CRM Error (${contact.phone}):`, e.message)
        // Postpone by 30 mins to retry
        const retryAt = new Date(Date.now() + 30 * 60000).toISOString()
        CRM.updateContact(contact.userId, contact.id, { nextFollowUpAt: retryAt })
      }
    }
  },

  // Handle incoming messages for smart triggers and sequence stopping
  handleIncomingMessage: async (userId, client, msg) => {
    try {
      const senderPhone = msg.from.replace('@c.us', '').replace('@g.us', '')
      const msgText = msg.body.toLowerCase()

      // 1. Find contact in CRM
      let contact = CRM.getContactByPhone(userId, senderPhone)

      // 2. If contact found, check for stop keywords or active sequence triggers
      if (contact) {
        // If in sequence, check for stop keywords
        if (contact.sequenceId) {
          const sequence = CRM.getSequence(userId, contact.sequenceId)
          if (sequence && sequence.stopKeywords) {
            const stopKeywords = sequence.stopKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k)
            if (stopKeywords.some(k => msgText.includes(k))) {
              console.log(`[${userId}] 🛑 Sequence stopped for ${senderPhone} (Stop keyword detected)`)
              CRM.stopSequence(userId, contact.id, 'dnc')
              ActivityLog.log(userId, 'crm_trigger', `Sequence stopped for ${senderPhone} (Stop keyword detected)`, 1)
              return
            }
          }
        }

        // Check for trigger keywords to change stage or start a NEW sequence
        const sequences = CRM.getSequences(userId)
        for (const seq of sequences) {
          if (!seq.triggerKeywords) continue
          const triggers = seq.triggerKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k)
          if (triggers.some(k => msgText.includes(k))) {
            console.log(`[${userId}] ⚡ Trigger detected for ${senderPhone}: starting ${seq.name}`)
            CRM.startSequence(userId, contact.id, seq.id)
            ActivityLog.log(userId, 'crm_trigger', `Trigger detected for ${senderPhone}: starting ${seq.name}`, 1)
            return
          }
        }
      } else {
        // 3. Contact not found, check global trigger keywords to auto-add to CRM
        const sequences = CRM.getSequences(userId)
        for (const seq of sequences) {
          if (!seq.triggerKeywords) continue
          const triggers = seq.triggerKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k)
          if (triggers.some(k => msgText.includes(k))) {
            console.log(`[${userId}] ✨ Auto-adding ${senderPhone} to CRM via trigger: ${seq.name}`)
            const contactName = (await msg.getContact()).pushname || senderPhone
            const newContact = CRM.createContact(userId, {
              phone: senderPhone,
              name: contactName,
              stage: 'new',
              notes: `Auto-added via trigger: ${seq.name}`
            })
            CRM.startSequence(userId, newContact.id, seq.id)
            ActivityLog.log(userId, 'crm_trigger', `Auto-added ${senderPhone} to CRM via trigger: ${seq.name}`, 1)
            return
          }
        }
      }
    } catch (error) {
      console.error(`[${userId}] CRM Trigger Error:`, error)
    }
  },

  getContactByPhone: (userId, phone) => {
    return db.prepare("SELECT * FROM crm_contacts WHERE userId = ? AND phone = ?").get(userId, phone)
  }
}

// ===== CONFIGURATION =====
const PORT = process.env.PORT || 3000

// ===== GLOBAL SESSION MANAGER =====
const sessions = new Map()
const qrCodes = new Map()
const qrTimestamps = new Map() // Track when QR was generated
const sessionStatuses = new Map()
const sessionPhones = new Map() // Store WhatsApp phone numbers
const sessionConnectedAt = new Map() // Track when session connected
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
const readSettings = (userId) => {
  // Security: Generate unique secrets for each user on first access
  const defaultSettings = {
    auth: { enabled: false, username: "admin", password: crypto.randomBytes(8).toString('hex') },
    queue: { enabled: true, delayMs: 2000 },
    typing: { enabled: true, durationMs: 1500 },
    webhook: { secret: crypto.randomBytes(16).toString('hex') },
  }
  const settings = readUserData(userId, "settings.json", defaultSettings)
  // Migrate old users with weak defaults (security patch)
  if (settings.auth?.password === 'admin123' || settings.webhook?.secret === 'webhook-secret-key') {
    if (settings.auth?.password === 'admin123') {
      settings.auth.password = crypto.randomBytes(8).toString('hex')
    }
    if (settings.webhook?.secret === 'webhook-secret-key') {
      settings.webhook.secret = crypto.randomBytes(16).toString('hex')
    }
    writeUserData(userId, "settings.json", settings)
    console.log(`🔐 Security: Migrated weak credentials for user ${userId}`)
  }
  return settings
}
const writeSettings = (userId, data) =>
  writeUserData(userId, "settings.json", data)
const readQuickActions = (userId) =>
  readUserData(userId, "quickactions.json", [])
const writeQuickActions = (userId, data) =>
  writeUserData(userId, "quickactions.json", data)

// ===== MESSAGE VARIABLES PROCESSOR =====
// ===== MESSAGE VARIABLES PROCESSOR =====
function processMessageVariables(message, contact = null) {
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

  let processed = message
    .replace(/{date}/g, now.toLocaleDateString("id-ID"))
    .replace(
      /{time}/g,
      now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    )
    .replace(/{day}/g, days[now.getDay()])
    .replace(/{month}/g, months[now.getMonth()])
    .replace(/{year}/g, now.getFullYear().toString())

  if (contact) {
    const fullName = contact.name || ""
    const firstName = fullName.split(" ")[0] || ""
    const phone = contact.phone || ""

    processed = processed
      .replace(/{name}/g, fullName)
      .replace(/{first_name}/g, firstName)
      .replace(/{phone}/g, phone)
  }

  return processed
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

// ===== CHROMIUM SINGLETON LOCK CLEANUP =====
// Clean up stale SingletonLock files that prevent browser launch
function cleanupChromiumLocks() {
  const lockPaths = [
    '/root/snap/chromium/common/chromium/SingletonLock',
    '/root/snap/chromium/common/chromium/Singleton*',
    '/root/.config/chromium/SingletonLock',
    '/home/*/.config/chromium/SingletonLock'
  ]

  // Also try to kill any orphaned chromium processes that might be holding locks
  try {
    const { execSync } = require('child_process')
    // Find and kill zombie chromium processes (only if they're ours)
    execSync('pkill -9 -f "chromium.*--user-data-dir=.*\\.chromium_data" 2>/dev/null || true', { stdio: 'ignore' })
  } catch (err) {
    // Ignore - pkill might not exist or no processes found
  }

  for (const lockPath of lockPaths) {
    try {
      // Handle glob patterns
      if (lockPath.includes('*')) {
        // For snap chromium, just try the main lock file
        const basePath = lockPath.replace('*', '')
        if (basePath.includes('Singleton')) {
          // Clean all Singleton* files in snap chromium directory
          const dir = '/root/snap/chromium/common/chromium'
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir).filter(f => f.startsWith('Singleton'))
            for (const file of files) {
              try {
                fs.unlinkSync(path.join(dir, file))
                console.log(`🧹 Cleaned up: ${path.join(dir, file)}`)
              } catch (e) { /* ignore */ }
            }
          }
        }
      } else if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath)
        console.log(`🧹 Cleaned up SingletonLock: ${lockPath}`)
      }
    } catch (err) {
      // Ignore errors - file might be in use or we don't have permissions
      console.log(`⚠️ Could not clean SingletonLock at ${lockPath}: ${err.message}`)
    }
  }

  // Also clean /tmp chromium directories
  try {
    const tmpDirs = fs.readdirSync('/tmp').filter(d =>
      d.startsWith('.org.chromium.Chromium') ||
      d.startsWith('puppeteer_dev_chrome_profile')
    )
    for (const dir of tmpDirs) {
      const singletonPath = path.join('/tmp', dir, 'SingletonLock')
      if (fs.existsSync(singletonPath)) {
        fs.unlinkSync(singletonPath)
        console.log(`🧹 Cleaned up SingletonLock: ${singletonPath}`)
      }
    }
  } catch (err) {
    // Ignore /tmp cleanup errors
  }
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

  // Clean up stale Chromium lock files before launching
  cleanupChromiumLocks()

  // Create unique user data directory for this session to avoid SingletonLock conflicts
  const userDataDir = path.join(__dirname, '.chromium_data', userId)
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true })
  }

  try {
    // Detect OS and set appropriate Chromium path
    const os = require('os')
    const isLinux = os.platform() === 'linux'

    // Common Chromium paths on Linux
    const linuxChromiumPaths = [
      '/snap/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable'
    ]

    // Find available chromium on Linux
    let chromiumPath = null
    if (isLinux) {
      // Use env var if set, otherwise find available chromium
      if (process.env.CHROMIUM_PATH) {
        chromiumPath = process.env.CHROMIUM_PATH
      } else {
        for (const p of linuxChromiumPaths) {
          if (fs.existsSync(p)) {
            chromiumPath = p
            console.log(`🔍 Found Chromium at: ${p}`)
            break
          }
        }
        if (!chromiumPath) {
          console.log('⚠️ No Chromium found, will use Puppeteer bundled browser')
        }
      }
    }
    // On Windows, let Puppeteer auto-detect Chrome

    // Puppeteer config
    const puppeteerConfig = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
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
        `--user-data-dir=${userDataDir}`,
      ],
    }

    // Set executablePath only if we found one (Linux) or env var is set
    if (chromiumPath) {
      puppeteerConfig.executablePath = chromiumPath
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: userId,
        dataPath: path.join(__dirname, ".wwebjs_auth"),
      }),
      puppeteer: puppeteerConfig,
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
      sessionConnectedAt.set(userId, new Date().toISOString())
      qrCodes.delete(userId)

      // Get WhatsApp info and store phone number
      try {
        const info = client.info
        const phoneNumber = info.wid.user
        sessionPhones.set(userId, phoneNumber)
        console.log(`   📞 Connected as: ${info.pushname} (${phoneNumber})`)
      } catch (e) {
        console.error(`Failed to get phone info for ${userId}:`, e)
      }
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

    // CRM Smart Triggers
    await CRM.handleIncomingMessage(userId, client, msg)

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

        const contact = CRM.getContactByPhone(userId, senderNumber)
        const response = processMessageVariables(cmd.response, contact)
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

        const contact = CRM.getContactByPhone(userId, senderNumber)
        const responseTextProcessed = processMessageVariables(responseText, contact)
        const response = responseTextProcessed

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

        // Update trigger count
        reply.triggerCount = (reply.triggerCount || 0) + 1
        reply.lastTriggered = new Date().toISOString()
        writeAutoReplies(userId, autoReplies)

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
// Security: Validate MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/mp3', 'audio/wav',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Security: Validate userId to prevent path traversal
    const userId = req.params.userId || req.authUserId
    if (!userId || userId.includes('..') || userId.includes('/') || userId.includes('\\')) {
      return cb(new Error('Invalid user ID'))
    }
    const userDir = path.join(UPLOADS_DIR, userId)
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true })
    }
    cb(null, userDir)
  },
  filename: (req, file, cb) =>
    cb(
      null,
      `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(
        file.originalname
      ).toLowerCase()}`
    ),
})

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only images, videos, audio, and documents allowed.'), false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
})

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

// SaaS Auth and Admin routes removed for personal app

// Admin: Get user activity details
app.get("/api/admin/user/:userId/activity", (req, res) => {
  const adminKey = req.headers["x-admin-key"]
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const { userId } = req.params

  try {
    const user = UserDB.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const stats = ActivityLog.getUserStats(userId)
    const recentLogs = ActivityLog.getLogs({ userId, limit: 50 })
    const suspiciousCheck = checkSuspiciousActivity(userId)

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        plan: user.plan,
        suspended: user.suspended,
        suspendReason: user.suspendReason
      },
      stats,
      recentActivity: recentLogs,
      riskAssessment: suspiciousCheck
    })
  } catch (error) {
    res.status(500).json({ error: "Failed to get user activity" })
  }
})


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

  sessions.forEach((client, userId) => {
    const status = sessionStatuses.get(userId) || "unknown"
    const phone = sessionPhones.get(userId) || null
    const connectedAt = sessionConnectedAt.get(userId) || null

    // Get user info
    const user = UserDB.findById(userId)

    sessionList.push({
      id: userId,
      oderId: userId, // backward compatibility (deprecated)
      userId: userId,
      userName: user?.name || "Unknown",
      userEmail: user?.email || "-",
      phone: phone,
      status: status,
      connectedAt: connectedAt,
      hasQR: qrCodes.has(userId),
    })
  })

  res.json(sessionList)
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

// requireUserAuth and requireSession are defined at top of file


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

    // Add timeout to getChats to prevent indefinite hang
    const SYNC_TIMEOUT = 60000 // 60 seconds
    let chats
    try {
      chats = await Promise.race([
        req.client.getChats(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout: getChats took longer than 60 seconds')), SYNC_TIMEOUT)
        )
      ])
    } catch (chatError) {
      console.error(`[${userId}] getChats error:`, chatError.message)
      throw chatError
    }

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
    console.error(`[${req.params.userId}] Sync error:`, error)
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

// ===== DRAFT =====
app.get("/api/:userId/draft", requireUserAuth, (req, res) => {
  try {
    const draft = readUserData(req.params.userId, "draft.json")
    res.json(draft || {})
  } catch (e) {
    res.json({})
  }
})

app.post("/api/:userId/draft", requireUserAuth, (req, res) => {
  try {
    writeUserData(req.params.userId, "draft.json", req.body)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ===== BROADCAST =====
// ===== SPINTAX PARSER =====
function parseSpintax(text) {
  if (!text) return ""
  // Regex to match {a|b|c} patterns
  return text.replace(/\{([^{}]+)\}/g, (match, content) => {
    const choices = content.split("|")
    return choices[Math.floor(Math.random() * choices.length)]
  })
}

// ===== BROADCAST =====
app.post("/api/:userId/broadcast", requireSession, async (req, res) => {
  const { userId } = req.params
  const {
    message,
    groups,
    image,
    // Anti-Ban Options
    randomDelayMs = { min: 2000, max: 5000 },
    sleepMode = { enabled: false, after: 20, durationMs: 60000 }
  } = req.body

  if (!message && !image) {
    return res.status(400).json({ error: "Message or image is required" })
  }

  if (!groups || groups.length === 0) {
    return res.status(400).json({ error: "At least one group is required" })
  }

  // Limits removed for personal app
  const limits = PLAN_LIMITS.pro
  const today = new Date().toDateString()

  const settings = readSettings(userId)
  const results = []

  // Handle image if provided
  let media = null
  if (image && image.startsWith("data:")) {
    const matches = image.match(/^data:(.+);base64,(.+)$/)
    if (matches) {
      media = new MessageMedia(matches[1], matches[2])
    }
  }

  // Use default queue settings if randomDelay not valid
  const minDelay = parseInt(randomDelayMs.min) || (settings.queue?.delayMs || 2000)
  const maxDelay = parseInt(randomDelayMs.max) || (minDelay + 3000)

  for (let i = 0; i < groups.length; i++) {
    const groupId = groups[i]

    // Sleep Mode Logic
    if (sleepMode.enabled && i > 0 && i % sleepMode.after === 0) {
      console.log(`[${userId}] Sleep mode active. Pausing for ${sleepMode.durationMs}ms...`)
      await delay(sleepMode.durationMs)
    }

    try {
      // Parse Message Variables & Spintax per Recipient
      // This ensures each person gets a unique variation if Spintax is used
      let uniqueMessage = processMessageVariables(message || "")
      uniqueMessage = parseSpintax(uniqueMessage)

      // Show typing indicator
      if (settings.typing?.enabled) {
        const chat = await req.client.getChatById(groupId)
        await chat.sendStateTyping()

        // Dynamic typing duration based on message length
        const typingDuration = Math.min((uniqueMessage.length * 50), 3000) + 500
        await delay(typingDuration)
      }

      // Send message
      if (media) {
        await req.client.sendMessage(groupId, media, {
          caption: uniqueMessage,
        })
      } else {
        await req.client.sendMessage(groupId, uniqueMessage)
      }

      results.push({ groupId, success: true })
      console.log(`[${userId}] Message sent to: ${groupId}`) // Log simplified

      // Random Delay between messages (Anti-Ban Jitter)
      if (i < groups.length - 1) {
        const jitter = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay
        await delay(jitter)
      }

    } catch (error) {
      results.push({ groupId, success: false, error: error.message })
      console.error(`[${userId}] Failed to send to ${groupId}:`, error.message)
    }
  }

  // Save to history (save the original template, not the spun version)
  const history = readHistory(userId)
  history.push({
    id: Date.now().toString(),
    type: media ? "image" : "text",
    message: message.substring(0, 100), // Save original message summary
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

  // Log broadcast activity
  ActivityLog.log(userId, "broadcast", message?.substring(0, 100), successCount, null)

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
  // Limits removed for personal app

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
  // Limits removed for personal app

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

  // Validate message or image is provided
  if (!message && !image) {
    return res
      .status(400)
      .json({ error: "Message or image is required for schedule" })
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
  // Limits removed for personal app

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

// ===== ANALYTICS =====
app.get("/api/:userId/analytics/best-times", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const history = readHistory(userId)

  // Analyze broadcast history by hour of day
  const hourlyStats = Array(24).fill(0).map(() => ({ sent: 0, success: 0 }))

  history.forEach(h => {
    if (!h.timestamp) return
    const hour = new Date(h.timestamp).getHours()
    hourlyStats[hour].sent += (h.successCount || 0) + (h.failCount || 0)
    hourlyStats[hour].success += (h.successCount || 0)
  })

  // Find best hours (highest success rate with minimum sends)
  const bestHours = hourlyStats
    .map((stats, hour) => ({
      hour,
      sent: stats.sent,
      success: stats.success,
      rate: stats.sent > 0 ? Math.round((stats.success / stats.sent) * 100) : 0
    }))
    .filter(h => h.sent >= 5) // Minimum 5 messages to be considered
    .sort((a, b) => b.rate - a.rate || b.sent - a.sent)
    .slice(0, 3)

  res.json({
    hourlyStats: hourlyStats.map((s, i) => ({ hour: i, ...s })),
    bestHours,
    totalAnalyzed: history.length
  })
})

app.get("/api/:userId/analytics/group-stats", requireUserAuth, (req, res) => {
  const { userId } = req.params
  const history = readHistory(userId)
  const groups = readGroups(userId)

  // Build stats per group
  const groupStats = {}

  // Initialize with all groups
  groups.forEach(g => {
    groupStats[g.groupId] = {
      name: g.name,
      sent: 0,
      success: 0,
      failed: 0
    }
  })

  // Count from history (simplified - counts broadcast totals)
  history.forEach(h => {
    const targets = h.targets || []
    targets.forEach(groupId => {
      if (!groupStats[groupId]) {
        groupStats[groupId] = { name: groupId, sent: 0, success: 0, failed: 0 }
      }
      groupStats[groupId].sent++
      groupStats[groupId].success += h.successCount > 0 ? 1 : 0
      groupStats[groupId].failed += h.failCount > 0 ? 1 : 0
    })
  })

  // Convert to array and sort by activity
  const stats = Object.entries(groupStats)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.sent - a.sent)

  res.json(stats)
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

// ===== CRM AUTOMATION =====
// Get CRM stats
app.get("/api/:userId/crm/stats", requireUserAuth, (req, res) => {
  try {
    const stats = CRM.getStats(req.params.userId)
    res.json({ success: true, ...stats })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// List contacts
app.get("/api/:userId/crm/contacts", requireUserAuth, (req, res) => {
  try {
    const { stage, sequenceId } = req.query
    const contacts = CRM.getContacts(req.params.userId, { stage, sequenceId })
    res.json({ success: true, contacts })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get single contact
app.get("/api/:userId/crm/contacts/:contactId", requireUserAuth, (req, res) => {
  try {
    const contact = CRM.getContact(req.params.userId, req.params.contactId)
    if (!contact) return res.status(404).json({ error: "Contact not found" })
    res.json({ success: true, contact })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Create contact
app.post("/api/:userId/crm/contacts", requireUserAuth, (req, res) => {
  try {
    const { phone, name, stage, notes, tags } = req.body
    if (!phone) return res.status(400).json({ error: "Phone is required" })

    const contact = CRM.createContact(req.params.userId, { phone, name, stage, notes, tags })
    res.json({ success: true, contact })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update contact
app.put("/api/:userId/crm/contacts/:contactId", requireUserAuth, (req, res) => {
  try {
    const contact = CRM.updateContact(req.params.userId, req.params.contactId, req.body)
    if (!contact) return res.status(404).json({ error: "Contact not found" })
    res.json({ success: true, contact })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete contact
app.delete("/api/:userId/crm/contacts/:contactId", requireUserAuth, (req, res) => {
  try {
    CRM.deleteContact(req.params.userId, req.params.contactId)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Bulk import contacts
app.post("/api/:userId/crm/contacts/import", requireUserAuth, (req, res) => {
  try {
    const { contacts } = req.body
    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ error: "Contacts array is required" })
    }

    const results = { success: 0, failed: 0, errors: [] }

    for (const c of contacts) {
      try {
        if (!c.phone) {
          results.failed++
          results.errors.push(`Missing phone for contact`)
          continue
        }
        CRM.createContact(req.params.userId, c)
        results.success++
      } catch (e) {
        results.failed++
        results.errors.push(`${c.phone}: ${e.message}`)
      }
    }

    res.json({ success: true, ...results })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Start sequence for contact
app.post("/api/:userId/crm/contacts/:contactId/start-sequence", requireUserAuth, (req, res) => {
  try {
    const { sequenceId } = req.body
    if (!sequenceId) return res.status(400).json({ error: "sequenceId is required" })

    const contact = CRM.startSequence(req.params.userId, req.params.contactId, sequenceId)
    if (!contact) return res.status(404).json({ error: "Contact or sequence not found" })

    res.json({ success: true, contact })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Stop sequence for contact
app.post("/api/:userId/crm/contacts/:contactId/stop-sequence", requireUserAuth, (req, res) => {
  try {
    const { reason } = req.body
    const contact = CRM.stopSequence(req.params.userId, req.params.contactId, reason)
    if (!contact) return res.status(404).json({ error: "Contact not found" })

    res.json({ success: true, contact })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// List sequences
app.get("/api/:userId/crm/sequences", requireUserAuth, (req, res) => {
  try {
    const sequences = CRM.getSequences(req.params.userId)
    res.json({ success: true, sequences })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get single sequence
app.get("/api/:userId/crm/sequences/:sequenceId", requireUserAuth, (req, res) => {
  try {
    const sequence = CRM.getSequence(req.params.userId, req.params.sequenceId)
    if (!sequence) return res.status(404).json({ error: "Sequence not found" })
    res.json({ success: true, sequence })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Create sequence
app.post("/api/:userId/crm/sequences", requireUserAuth, (req, res) => {
  try {
    const { name, description, steps, triggerKeywords, stopKeywords, maxFollowUps } = req.body
    if (!name) return res.status(400).json({ error: "Name is required" })
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: "At least one step is required" })
    }

    const sequence = CRM.createSequence(req.params.userId, {
      name, description, steps, triggerKeywords, stopKeywords, maxFollowUps
    })
    res.json({ success: true, sequence })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update sequence
app.put("/api/:userId/crm/sequences/:sequenceId", requireUserAuth, (req, res) => {
  try {
    const sequence = CRM.updateSequence(req.params.userId, req.params.sequenceId, req.body)
    if (!sequence) return res.status(404).json({ error: "Sequence not found" })
    res.json({ success: true, sequence })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete sequence
app.delete("/api/:userId/crm/sequences/:sequenceId", requireUserAuth, (req, res) => {
  try {
    CRM.deleteSequence(req.params.userId, req.params.sequenceId)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
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

        // Handle recurring schedules
        if (schedule.recurring && schedule.recurring !== "none") {
          const nextTime = new Date(schedule.scheduledTime)

          if (schedule.recurring === "daily") {
            nextTime.setDate(nextTime.getDate() + 1)
          } else if (schedule.recurring === "weekly") {
            nextTime.setDate(nextTime.getDate() + 7)
          }

          schedule.scheduledTime = nextTime.toISOString()
          schedule.status = "pending"
          delete schedule.sentAt

          console.log(`[${userId}] Recurring schedule rescheduled to: ${nextTime.toISOString()}`)
        }

        writeSchedules(userId, schedules)
      }
    }
  })
}

// Run schedule checker every minute
setInterval(checkSchedules, 60000)

// Run CRM Queue processor every minute
cron.schedule('* * * * *', () => {
  CRM.processQueue().catch(err => console.error("❌ CRM Cron Error:", err));
});


// =============================================
// ===== ZAPIER WEBHOOK ENDPOINT =====
// =============================================
// Webhook Secret for Zapier (set in .env or use default)
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || crypto.randomBytes(16).toString('hex')
console.log(`🔑 Webhook Secret: ${WEBHOOK_SECRET}`)

// Helper: Normalize phone number to WhatsApp format
function normalizePhoneToWA(phone) {
  if (!phone) return null

  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '')

  // Handle Indonesian format
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1)
  }

  // Add 62 if doesn't start with country code
  if (!cleaned.startsWith('62') && !cleaned.startsWith('1')) {
    // Assume Indonesian if no country code
    cleaned = '62' + cleaned
  }

  return cleaned + '@c.us'
}

/**
 * Zapier Webhook Endpoint
 * 
 * Receives data from Zapier and sends WhatsApp messages
 * 
 * Expected JSON body:
 * {
 *   "phone": "+1234567890",        // Required: recipient phone number
 *   "name": "Sarah",               // Optional: recipient name for personalization
 *   "message": "Your reminder",    // Required: message to send
 *   "reminder_type": "first_reminder", // Optional: type of reminder
 *   "image": "base64 or URL"       // Optional: image to attach
 * }
 * 
 * Headers:
 *   x-webhook-secret: YOUR_WEBHOOK_SECRET
 * 
 * OR Query param:
 *   ?secret=YOUR_WEBHOOK_SECRET
 */
app.post('/api/webhook/zapier', async (req, res) => {
  try {
    // Log incoming webhook request
    console.log('\n📥 ========== WEBHOOK REQUEST ==========')
    console.log('📅 Time:', new Date().toISOString())
    console.log('🌐 IP:', req.ip || req.connection.remoteAddress)
    console.log('📦 Body:', JSON.stringify(req.body, null, 2))
    console.log('🔑 Headers:', JSON.stringify({
      'content-type': req.headers['content-type'],
      'x-webhook-secret': req.headers['x-webhook-secret'] ? '***' + req.headers['x-webhook-secret'].slice(-4) : 'NOT SET'
    }))
    console.log('========================================\n')

    // 1. Verify webhook secret
    const secretFromHeader = req.headers['x-webhook-secret']
    const secretFromQuery = req.query.secret
    const providedSecret = secretFromHeader || secretFromQuery

    if (!providedSecret || providedSecret !== WEBHOOK_SECRET) {
      console.log('⚠️ Webhook: Invalid or missing secret')
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid webhook secret'
      })
    }

    // 2. Parse request body
    const { phone, name, message, reminder_type, image } = req.body

    // Validate required fields
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: phone'
      })
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: message'
      })
    }

    // 3. Find active WhatsApp session (use "owner" for personal app)
    const userId = 'owner'
    const client = sessions.get(userId)

    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp session not connected. Please scan QR code first.'
      })
    }

    const status = sessionStatuses.get(userId)
    if (status !== 'connected') {
      return res.status(503).json({
        success: false,
        error: `WhatsApp session status: ${status}. Please reconnect.`
      })
    }

    // 4. Normalize phone number
    const waNumber = normalizePhoneToWA(phone)
    if (!waNumber) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format'
      })
    }

    // 5. Process message with variables
    let processedMessage = message
    if (name) {
      processedMessage = processedMessage
        .replace(/{name}/g, name)
        .replace(/{first_name}/g, name.split(' ')[0] || name)
    }
    processedMessage = processMessageVariables(processedMessage)

    // 6. Add reminder type prefix or suffix if needed
    if (reminder_type) {
      console.log(`📌 Webhook: Processing ${reminder_type} for ${phone}`)
    }

    // 7. Prepare media if image provided
    let media = null
    if (image) {
      try {
        if (image.startsWith('data:')) {
          // Base64 image
          const matches = image.match(/^data:(.+);base64,(.+)$/)
          if (matches) {
            media = new MessageMedia(matches[1], matches[2])
          }
        } else if (image.startsWith('http')) {
          // URL image - download it
          media = await MessageMedia.fromUrl(image)
        }
      } catch (imgError) {
        console.error('⚠️ Webhook: Failed to process image:', imgError.message)
        // Continue without image
      }
    }

    // 8. Add typing indicator (human-like behavior)
    try {
      const settings = readSettings(userId)
      if (settings.typing?.enabled) {
        const chat = await client.getChatById(waNumber)
        if (chat) {
          await chat.sendStateTyping()
          await delay(settings.typing.durationMs || 1500)
        }
      }
    } catch (typingError) {
      // Ignore typing errors
    }

    // 9. Send message
    let sentMessage
    if (media) {
      sentMessage = await client.sendMessage(waNumber, media, {
        caption: processedMessage
      })
    } else {
      sentMessage = await client.sendMessage(waNumber, processedMessage)
    }

    console.log(`✅ Webhook: Message sent to ${phone} (${reminder_type || 'custom'})`)

    // 10. Log activity
    ActivityLog.log(userId, 'webhook_send', `Zapier: ${reminder_type || 'message'} to ${phone}`, 1, null)

    // 11. Return success
    res.json({
      success: true,
      message: 'Message sent successfully',
      details: {
        phone: phone,
        waNumber: waNumber,
        reminderType: reminder_type,
        messageId: sentMessage?.id?._serialized || null,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('❌ Webhook Error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to send message',
      details: error.message
    })
  }
})

// Webhook health check / info endpoint
app.get('/api/webhook/zapier', (req, res) => {
  const userId = 'owner'
  const status = sessionStatuses.get(userId) || 'not_initialized'
  const phone = sessionPhones.get(userId) || null

  res.json({
    success: true,
    endpoint: '/api/webhook/zapier',
    method: 'POST',
    whatsappStatus: status,
    connectedPhone: phone ? phone.substring(0, 4) + '****' + phone.substring(phone.length - 4) : null,
    requiredHeaders: {
      'Content-Type': 'application/json',
      'x-webhook-secret': 'YOUR_WEBHOOK_SECRET'
    },
    bodyFormat: {
      phone: '(required) Recipient phone number e.g. +628123456789',
      message: '(required) Message text to send',
      name: '(optional) Recipient name for {name} variable',
      reminder_type: '(optional) For logging e.g. first_reminder, second_reminder',
      image: '(optional) Base64 data URL or image URL'
    },
    example: {
      phone: '+628123456789',
      name: 'Sarah',
      reminder_type: 'first_reminder',
      message: 'Hi {name}, this is your reminder to complete yoga membership!'
    }
  })
})

// Get webhook secret (admin only - for setting up Zapier)
app.get('/api/webhook/secret', requireAuth, (req, res) => {
  res.json({
    success: true,
    webhookUrl: `${req.protocol}://${req.get('host')}/api/webhook/zapier`,
    webhookSecret: WEBHOOK_SECRET,
    instructions: [
      '1. Di Zapier, gunakan "Webhooks by Zapier" action',
      '2. Set Method: POST',
      '3. Set URL: <webhookUrl>',
      '4. Set Headers: x-webhook-secret: <webhookSecret>',
      '5. Set Body: JSON dengan phone, message, name (opsional)',
      '6. Test dengan "Test action"'
    ]
  })
})


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
