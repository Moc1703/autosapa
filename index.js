// ===== WHATSAPP BOT - SAAS MULTI-SESSION ARCHITECTURE =====
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const multer = require('multer');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Trust proxy for rate limiting (if behind nginx/cloudflare)
app.set('trust proxy', 1);

// ===== JWT SECRET =====
const JWT_SECRET = process.env.JWT_SECRET || 'wabot-secret-key-change-in-production';

// ===== USER SCHEMA =====
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    plan: { type: String, enum: ['trial', 'pro'], default: 'trial' },
    trialEndsAt: { type: Date },
    subscriptionEndsAt: { type: Date },
    limits: {
        maxGroups: { type: Number, default: 3 },
        maxBroadcastPerDay: { type: Number, default: 50 }
    },
    broadcastToday: { type: Number, default: 0 },
    lastBroadcastDate: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ===== PLAN LIMITS =====
const PLAN_LIMITS = {
    trial: { maxGroups: 3, maxBroadcastPerDay: 50 },
    pro: { maxGroups: 999, maxBroadcastPerDay: 500 }
};

// ===== CONFIGURATION =====
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// ===== GLOBAL SESSION MANAGER =====
const sessions = new Map();
const qrCodes = new Map();
const sessionStatuses = new Map();

// ===== DATA DIRECTORIES =====
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ===== HELPER FUNCTIONS =====
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getUserDataPath(userId, filename) {
    const userDir = path.join(DATA_DIR, userId);
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    return path.join(userDir, filename);
}

function readUserData(userId, filename, defaultValue = []) {
    try {
        const filePath = getUserDataPath(userId, filename);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        return defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

function writeUserData(userId, filename, data) {
    const filePath = getUserDataPath(userId, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// User-specific data readers/writers
const readGroups = (userId) => readUserData(userId, 'groups.json', []);
const writeGroups = (userId, data) => writeUserData(userId, 'groups.json', data);
const readAutoReplies = (userId) => readUserData(userId, 'autoreplies.json', []);
const writeAutoReplies = (userId, data) => writeUserData(userId, 'autoreplies.json', data);
const readTemplates = (userId) => readUserData(userId, 'templates.json', []);
const writeTemplates = (userId, data) => writeUserData(userId, 'templates.json', data);
const readSchedules = (userId) => readUserData(userId, 'schedules.json', []);
const writeSchedules = (userId, data) => writeUserData(userId, 'schedules.json', data);
const readCommands = (userId) => readUserData(userId, 'commands.json', []);
const writeCommands = (userId, data) => writeUserData(userId, 'commands.json', data);
const readContacts = (userId) => readUserData(userId, 'contacts.json', []);
const writeContacts = (userId, data) => writeUserData(userId, 'contacts.json', data);
const readBlacklist = (userId) => readUserData(userId, 'blacklist.json', []);
const writeBlacklist = (userId, data) => writeUserData(userId, 'blacklist.json', data);
const readHistory = (userId) => readUserData(userId, 'history.json', []);
const writeHistory = (userId, data) => writeUserData(userId, 'history.json', data);
const readSettings = (userId) => readUserData(userId, 'settings.json', {
    auth: { enabled: false, username: 'admin', password: 'admin123' },
    queue: { enabled: true, delayMs: 2000 },
    typing: { enabled: true, durationMs: 1500 },
    webhook: { secret: 'webhook-secret-key' }
});
const writeSettings = (userId, data) => writeUserData(userId, 'settings.json', data);
const readQuickActions = (userId) => readUserData(userId, 'quickactions.json', []);
const writeQuickActions = (userId, data) => writeUserData(userId, 'quickactions.json', data);

// ===== MESSAGE VARIABLES PROCESSOR =====
function processMessageVariables(message) {
    if (!message) return '';
    const now = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    return message
        .replace(/{date}/g, now.toLocaleDateString('id-ID'))
        .replace(/{time}/g, now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }))
        .replace(/{day}/g, days[now.getDay()])
        .replace(/{month}/g, months[now.getMonth()])
        .replace(/{year}/g, now.getFullYear().toString());
}

// ===== ANTI-LOOP PROTECTION =====
const replyTracker = new Map();
const LOOP_PROTECTION = {
    maxRepliesPerMinute: 5,
    cooldownMs: 60000,
    selfReplyBlock: true
};

function canAutoReply(chatId) {
    const key = `reply_${chatId}`;
    const now = Date.now();
    const tracker = replyTracker.get(key) || { count: 0, resetAt: now + LOOP_PROTECTION.cooldownMs };
    
    if (now > tracker.resetAt) {
        replyTracker.set(key, { count: 1, resetAt: now + LOOP_PROTECTION.cooldownMs });
        return true;
    }
    
    if (tracker.count >= LOOP_PROTECTION.maxRepliesPerMinute) {
        return false;
    }
    
    tracker.count++;
    replyTracker.set(key, tracker);
    return true;
}

function isLikelyBot(messageBody) {
    const botPatterns = [
        /^\[.*BOT.*\]/i,
        /^🤖/,
        /\[AUTO.?REPLY\]/i,
        /^<.*>$/
    ];
    return botPatterns.some(p => p.test(messageBody));
}

// ===== MONGODB CONNECTION =====
let mongoStore;

async function connectMongoDB() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');
        
        // Initialize MongoStore for session storage
        mongoStore = new MongoStore({ mongoose: mongoose });
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        return false;
    }
}

// ===== SESSION INITIALIZATION =====
async function initSession(userId) {
    // Check if session already exists
    if (sessions.has(userId)) {
        const existingSession = sessions.get(userId);
        const status = sessionStatuses.get(userId);
        
        if (status === 'connected') {
            return { success: true, message: 'Session already connected', status: 'connected' };
        }
        
        if (status === 'qr') {
            return { success: true, message: 'Waiting for QR scan', status: 'qr', qr: qrCodes.get(userId) };
        }
    }
    
    console.log(`🔄 Initializing session for user: ${userId}`);
    console.time(`[${userId}] Session init`);
    sessionStatuses.set(userId, 'initializing');
    
    try {
        const client = new Client({
            authStrategy: new RemoteAuth({
                clientId: userId,
                store: mongoStore,
                backupSyncIntervalMs: 60000  // Sync setiap 1 menit
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-sync',
                    '--disable-translate',
                    '--disable-background-networking',
                    '--disable-default-apps',
                    '--mute-audio',
                    '--no-default-browser-check',
                    '--autoplay-policy=no-user-gesture-required',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            }
        });
        
        // QR Code Event
        client.on('qr', (qr) => {
            console.log(`📱 QR Code generated for user: ${userId}`);
            qrCodes.set(userId, qr);
            sessionStatuses.set(userId, 'qr');
        });
        
        // Ready Event
        client.on('ready', () => {
            console.log(`✅ Client ready for user: ${userId}`);
            sessionStatuses.set(userId, 'connected');
            qrCodes.delete(userId);
        });
        
        // Authenticated Event
        client.on('authenticated', () => {
            console.log(`🔐 Client authenticated for user: ${userId}`);
        });
        
        // Remote Session Saved
        client.on('remote_session_saved', () => {
            console.log(`💾 Remote session saved for user: ${userId}`);
        });
        
        // Disconnected Event
        client.on('disconnected', (reason) => {
            console.log(`❌ Client disconnected for user: ${userId}. Reason: ${reason}`);
            sessionStatuses.set(userId, 'disconnected');
            sessions.delete(userId);
        });
        
        // Auth Failure Event
        client.on('auth_failure', (msg) => {
            console.error(`🚫 Auth failure for user: ${userId}. Message: ${msg}`);
            sessionStatuses.set(userId, 'auth_failure');
            sessions.delete(userId);
        });
        
        // Message Event - Auto Reply & Commands
        client.on('message', async (msg) => {
            await handleIncomingMessage(userId, client, msg);
        });
        
        // Store client in sessions map
        sessions.set(userId, client);
        
        // Initialize client
        await client.initialize();
        
        return { success: true, message: 'Session initialization started', status: 'initializing' };
        
    } catch (error) {
        console.error(`❌ Failed to initialize session for user: ${userId}`, error);
        sessionStatuses.set(userId, 'error');
        return { success: false, message: error.message, status: 'error' };
    }
}

// ===== MESSAGE HANDLER =====
async function handleIncomingMessage(userId, client, msg) {
    try {
        // Skip status messages
        if (msg.isStatus) return;
        
        // Skip own messages
        if (msg.fromMe) return;
        
        const sender = msg.from;
        const msgText = msg.body.toLowerCase();
        const chat = await msg.getChat();
        
        // Bot detection
        if (isLikelyBot(msg.body)) {
            console.log(`[${userId}] Ignoring likely bot message`);
            return;
        }
        
        // Loop protection
        if (!canAutoReply(sender)) {
            console.log(`[${userId}] Rate limit reached for: ${sender}`);
            return;
        }
        
        // Check blacklist
        const blacklist = readBlacklist(userId);
        const senderNumber = sender.replace('@c.us', '').replace('@g.us', '');
        if (blacklist.some(b => senderNumber.includes(b.number))) {
            console.log(`[${userId}] Blocked message from blacklisted: ${sender}`);
            return;
        }
        
        const settings = readSettings(userId);
        
        // Check Custom Commands first
        if (msg.body.startsWith('!')) {
            const commands = readCommands(userId);
            const cmdName = msg.body.split(' ')[0].toLowerCase();
            const cmd = commands.find(c => c.command === cmdName && c.enabled !== false);
            
            if (cmd) {
                // Show typing indicator
                if (settings.typing?.enabled) {
                    await chat.sendStateTyping();
                    await delay(settings.typing.durationMs || 1000);
                }
                
                const response = processMessageVariables(cmd.response);
                await msg.reply(response);
                console.log(`[${userId}] Command ${cmdName} executed`);
                return;
            }
        }
        
        // Auto Replies
        const autoReplies = readAutoReplies(userId);
        const enabledReplies = autoReplies.filter(r => r.enabled);
        
        for (const reply of enabledReplies) {
            let match = false;
            const keyword = reply.keyword.toLowerCase();
            
            switch (reply.matchType) {
                case 'exact':
                    match = msgText === keyword;
                    break;
                case 'startswith':
                    match = msgText.startsWith(keyword);
                    break;
                case 'words':
                    const keywordWords = keyword.split(/\s+/).filter(w => w.length > 0);
                    match = keywordWords.every(word => msgText.includes(word));
                    break;
                case 'anyword':
                    const anyWords = keyword.split(/\s+/).filter(w => w.length > 0);
                    match = anyWords.some(word => msgText.includes(word));
                    break;
                case 'contains':
                default:
                    match = msgText.includes(keyword);
                    break;
            }
            
            if (match) {
                // Random delay for more human-like behavior (1-3 seconds variation)
                const randomDelay = Math.floor(Math.random() * 2000) + 1000;
                
                // Show typing indicator
                if (settings.typing?.enabled) {
                    await chat.sendStateTyping();
                    const typingDuration = (settings.typing.durationMs || 1500) + randomDelay;
                    await delay(typingDuration);
                } else {
                    await delay(randomDelay);
                }
                
                // Support multiple responses separated by ||| (pick random one)
                let responseText = reply.response;
                if (responseText.includes('|||')) {
                    const responses = responseText.split('|||').map(r => r.trim()).filter(r => r);
                    responseText = responses[Math.floor(Math.random() * responses.length)];
                }
                
                const response = processMessageVariables(responseText);
                
                // Reply with image if set
                if (reply.imagePath) {
                    try {
                        const media = MessageMedia.fromFilePath(path.join(__dirname, reply.imagePath));
                        await msg.reply(media, undefined, { caption: response });
                    } catch (e) {
                        await msg.reply(response);
                    }
                } else {
                    await msg.reply(response);
                }
                
                console.log(`[${userId}] Auto-reply triggered for keyword: ${reply.keyword}`);
                break;
            }
        }
        
    } catch (error) {
        console.error(`[${userId}] Error handling message:`, error);
    }
}

// ===== DESTROY SESSION =====
async function destroySession(userId) {
    if (!sessions.has(userId)) {
        return { success: false, message: 'Session not found' };
    }
    
    try {
        const client = sessions.get(userId);
        await client.destroy();
        sessions.delete(userId);
        sessionStatuses.delete(userId);
        qrCodes.delete(userId);
        
        console.log(`🗑️ Session destroyed for user: ${userId}`);
        return { success: true, message: 'Session destroyed' };
    } catch (error) {
        console.error(`❌ Failed to destroy session for user: ${userId}`, error);
        return { success: false, message: error.message };
    }
}

// ===== MULTER UPLOAD CONFIG =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// =============================================
// ===== AUTH SECURITY =====
// =============================================

// Rate limiting for auth endpoints
const authAttempts = new Map();
const AUTH_LIMIT = {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 30 * 60 * 1000 // 30 minutes block
};

function checkAuthRateLimit(ip) {
    const now = Date.now();
    const record = authAttempts.get(ip);
    
    if (!record) {
        authAttempts.set(ip, { attempts: 1, firstAttempt: now, blocked: false });
        return { allowed: true };
    }
    
    // Check if blocked
    if (record.blocked && now < record.blockedUntil) {
        const minutesLeft = Math.ceil((record.blockedUntil - now) / 60000);
        return { allowed: false, message: `Too many attempts. Try again in ${minutesLeft} minutes.` };
    }
    
    // Reset if window expired
    if (now - record.firstAttempt > AUTH_LIMIT.windowMs) {
        authAttempts.set(ip, { attempts: 1, firstAttempt: now, blocked: false });
        return { allowed: true };
    }
    
    // Increment attempts
    record.attempts++;
    
    if (record.attempts > AUTH_LIMIT.maxAttempts) {
        record.blocked = true;
        record.blockedUntil = now + AUTH_LIMIT.blockDurationMs;
        authAttempts.set(ip, record);
        return { allowed: false, message: 'Too many attempts. Account temporarily locked for 30 minutes.' };
    }
    
    authAttempts.set(ip, record);
    return { allowed: true };
}

function resetAuthAttempts(ip) {
    authAttempts.delete(ip);
}

// Input validation helpers
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isStrongPassword(password) {
    // Minimum 6 characters
    return password && password.length >= 6;
}

function sanitizeName(name) {
    // Remove HTML tags and trim
    return name.replace(/<[^>]*>/g, '').trim().substring(0, 100);
}

// =============================================
// ===== AUTH ROUTES =====
// =============================================

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const ip = req.ip || req.connection.remoteAddress;
        
        // Rate limit check
        const rateCheck = checkAuthRateLimit(ip);
        if (!rateCheck.allowed) {
            return res.status(429).json({ error: rateCheck.message });
        }
        
        let { email, password, name } = req.body;
        
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }
        
        // Sanitize and validate
        email = email.toLowerCase().trim();
        name = sanitizeName(name);
        
        if (!isValidEmail(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        if (!isStrongPassword(password)) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        if (name.length < 2) {
            return res.status(400).json({ error: 'Name must be at least 2 characters' });
        }
        
        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        // Hash password with higher cost factor
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Create user with 10-day trial
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 10);
        
        const user = new User({
            email,
            password: hashedPassword,
            name,
            plan: 'trial',
            trialEndsAt,
            limits: PLAN_LIMITS.trial
        });
        
        await user.save();
        
        // Generate token
        const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        
        res.json({
            success: true,
            message: 'Registration successful! 10-day free trial started.',
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                plan: user.plan,
                trialEndsAt: user.trialEndsAt,
                limits: user.limits
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const ip = req.ip || req.connection.remoteAddress;
        
        // Rate limit check
        const rateCheck = checkAuthRateLimit(ip);
        if (!rateCheck.allowed) {
            return res.status(429).json({ error: rateCheck.message });
        }
        
        let { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        email = email.toLowerCase().trim();
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Check password
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Reset rate limit on successful login
        resetAuthAttempts(ip);
        
        // Generate token
        const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                plan: user.plan,
                trialEndsAt: user.trialEndsAt,
                subscriptionEndsAt: user.subscriptionEndsAt,
                limits: user.limits
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ===== PASSWORD RESET =====
const resetTokens = new Map();

// Forgot password - Generate reset token
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const ip = req.ip || req.connection.remoteAddress;
        
        // Rate limit check
        const rateCheck = checkAuthRateLimit(ip);
        if (!rateCheck.allowed) {
            return res.status(429).json({ error: rateCheck.message });
        }
        
        let { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        email = email.toLowerCase().trim();
        
        const user = await User.findOne({ email });
        
        // Don't reveal if email exists (security best practice)
        if (!user) {
            return res.json({ 
                success: true, 
                message: 'If the email exists, a reset link has been sent' 
            });
        }
        
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpiry = Date.now() + 3600000; // 1 hour
        
        resetTokens.set(resetToken, {
            userId: user._id.toString(),
            email: user.email,
            expiry: resetExpiry
        });
        
        // Reset link
        const resetLink = `${req.protocol}://${req.get('host')}/reset-password.html?token=${resetToken}`;
        
        console.log(`🔑 Reset link for ${email}: ${resetLink}`);
        
        // TODO: Send email via nodemailer
        // For now, just log it (in production, send via email)
        
        res.json({ 
            success: true, 
            message: 'If the email exists, a reset link has been sent',
            // REMOVE THIS IN PRODUCTION - only for testing
            resetLink: resetLink
        });
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Reset password with token
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }
        
        if (!isStrongPassword(newPassword)) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        const resetData = resetTokens.get(token);
        
        if (!resetData) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }
        
        if (Date.now() > resetData.expiry) {
            resetTokens.delete(token);
            return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
        }
        
        // Update password
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await User.findByIdAndUpdate(resetData.userId, { password: hashedPassword });
        
        // Delete used token
        resetTokens.delete(token);
        
        console.log(`✅ Password reset successfully for: ${resetData.email}`);
        
        res.json({ success: true, message: 'Password has been reset successfully. You can now login.' });
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Admin: Manual reset password
app.post('/api/admin/reset-user-password', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== ADMIN_KEY) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    const { email, newPassword } = req.body;
    
    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        user.password = hashedPassword;
        await user.save();
        
        res.json({ success: true, message: `Password reset for ${email}` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Get current user
app.get('/api/auth/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        // Check subscription status
        const now = new Date();
        let isActive = false;
        let daysLeft = 0;
        
        if (user.plan === 'trial') {
            isActive = user.trialEndsAt > now;
            daysLeft = Math.ceil((user.trialEndsAt - now) / (1000 * 60 * 60 * 24));
        } else if (user.plan === 'pro') {
            isActive = !user.subscriptionEndsAt || user.subscriptionEndsAt > now;
            if (user.subscriptionEndsAt) {
                daysLeft = Math.ceil((user.subscriptionEndsAt - now) / (1000 * 60 * 60 * 24));
            } else {
                daysLeft = 999; // Lifetime
            }
        }
        
        // Reset daily broadcast count if new day
        const today = new Date().toDateString();
        if (user.lastBroadcastDate !== today) {
            user.broadcastToday = 0;
            user.lastBroadcastDate = today;
            await user.save();
        }
        
        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                plan: user.plan,
                isActive,
                daysLeft: Math.max(0, daysLeft),
                trialEndsAt: user.trialEndsAt,
                subscriptionEndsAt: user.subscriptionEndsAt,
                limits: user.limits,
                broadcastToday: user.broadcastToday,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Auth middleware
async function requireAuth(req, res, next) {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        // Check if subscription is active
        const now = new Date();
        let isActive = false;
        
        if (user.plan === 'trial') {
            isActive = user.trialEndsAt > now;
        } else if (user.plan === 'pro') {
            isActive = !user.subscriptionEndsAt || user.subscriptionEndsAt > now;
        }
        
        if (!isActive) {
            return res.status(403).json({ error: 'Subscription expired', code: 'SUBSCRIPTION_EXPIRED' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// =============================================
// ===== ADMIN ROUTES =====
// =============================================

const ADMIN_KEY = process.env.ADMIN_KEY || 'admin-secret-key';

// Admin: List all users
app.get('/api/admin/users', (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== ADMIN_KEY) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    User.find().select('-password').sort({ createdAt: -1 }).then(users => {
        res.json({ success: true, users });
    });
});

// Admin: Activate Pro subscription
app.post('/api/admin/activate', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== ADMIN_KEY) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    const { email, months } = req.body;
    
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Set subscription end date
        const subscriptionEndsAt = new Date();
        subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + (months || 1));
        
        user.plan = 'pro';
        user.subscriptionEndsAt = subscriptionEndsAt;
        user.limits = PLAN_LIMITS.pro;
        await user.save();
        
        res.json({
            success: true,
            message: `Pro subscription activated for ${email} until ${subscriptionEndsAt.toDateString()}`,
            user: {
                email: user.email,
                plan: user.plan,
                subscriptionEndsAt: user.subscriptionEndsAt
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to activate subscription' });
    }
});

// =============================================
// ===== API ENDPOINTS - SESSION MANAGEMENT =====
// =============================================

// Start a new session
app.post('/api/session/start', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }
    
    if (!mongoStore) {
        return res.status(500).json({ error: 'MongoDB not connected' });
    }
    
    const result = await initSession(userId);
    res.json(result);
});

// Get QR Code for a session
app.get('/api/session/qr/:userId', (req, res) => {
    const { userId } = req.params;
    const qr = qrCodes.get(userId);
    const status = sessionStatuses.get(userId);
    
    if (status === 'connected') {
        return res.json({ success: true, status: 'connected', message: 'Already connected, no QR needed' });
    }
    
    if (!qr) {
        return res.json({ success: false, status: status || 'unknown', message: 'QR not available yet' });
    }
    
    res.json({ success: true, status: 'qr', qr });
});

// Get session status
app.get('/api/session/status/:userId', (req, res) => {
    const { userId } = req.params;
    const status = sessionStatuses.get(userId) || 'not_found';
    const hasSession = sessions.has(userId);
    
    res.json({ 
        success: true, 
        userId,
        status,
        active: hasSession,
        hasQR: qrCodes.has(userId)
    });
});

// List all active sessions
app.get('/api/sessions', (req, res) => {
    const sessionList = [];
    
    sessions.forEach((client, oderId) => {
        sessionList.push({
            oderId,
            status: sessionStatuses.get(oderId) || 'unknown',
            hasQR: qrCodes.has(oderId)
        });
    });
    
    res.json({ success: true, sessions: sessionList, count: sessionList.length });
});

// Destroy a session
app.delete('/api/session/:userId', async (req, res) => {
    const { userId } = req.params;
    const result = await destroySession(userId);
    res.json(result);
});

// Logout a session (destroy and remove from DB)
app.post('/api/session/logout/:userId', async (req, res) => {
    const { userId } = req.params;
    
    if (!sessions.has(userId)) {
        return res.json({ success: false, message: 'Session not found' });
    }
    
    try {
        const client = sessions.get(userId);
        await client.logout();
        sessions.delete(userId);
        sessionStatuses.delete(userId);
        qrCodes.delete(userId);
        
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// ===== API ENDPOINTS - PER-USER FEATURES =====
// =============================================

// Middleware to check session
function requireSession(req, res, next) {
    const userId = req.params.userId || req.body.userId || req.query.userId;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }
    
    if (!sessions.has(userId)) {
        return res.status(404).json({ error: 'Session not found. Please start a session first.' });
    }
    
    const status = sessionStatuses.get(userId);
    if (status !== 'connected') {
        return res.status(400).json({ error: `Session not connected. Current status: ${status}` });
    }
    
    req.userId = userId;
    req.client = sessions.get(userId);
    next();
}

// ===== GROUPS =====
app.get('/api/:userId/groups', (req, res) => {
    const groups = readGroups(req.params.userId);
    res.json(groups);
});

app.post('/api/:userId/groups', (req, res) => {
    const { userId } = req.params;
    const { name, id } = req.body;
    
    if (!name || !id) {
        return res.status(400).json({ error: 'Name and ID are required' });
    }
    
    const groups = readGroups(userId);
    groups.push({ 
        id: Date.now().toString(),
        name, 
        groupId: id,
        addedAt: new Date().toISOString()
    });
    writeGroups(userId, groups);
    
    res.json({ success: true });
});

// Debug endpoint - check all chats
app.get('/api/:userId/debug/chats', requireSession, async (req, res) => {
    try {
        const chats = await req.client.getChats();
        const summary = {
            totalChats: chats.length,
            groups: chats.filter(c => c.isGroup).length,
            private: chats.filter(c => !c.isGroup).length,
            groupNames: chats.filter(c => c.isGroup).map(c => c.name)
        };
        console.log('Debug chats:', summary);
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Sync groups from WhatsApp (MUST be before /:groupId route)
app.post('/api/:userId/groups/sync', requireSession, async (req, res) => {
    try {
        const { userId } = req.params;
        const chats = await req.client.getChats();
        
        console.log(`[${userId}] Total chats: ${chats.length}`);
        
        const waGroups = chats
            .filter(chat => chat.isGroup)
            .map(chat => ({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                groupId: chat.id._serialized,
                name: chat.name,
                participants: chat.participants?.length || 0,
                addedAt: new Date().toISOString()
            }));
        
        console.log(`[${userId}] Groups found: ${waGroups.length}`);
        
        const savedGroups = readGroups(userId);
        const savedGroupIds = savedGroups.map(g => g.groupId || g.id);
        
        const newGroups = waGroups.filter(g => !savedGroupIds.includes(g.groupId));
        const waGroupIds = waGroups.map(g => g.groupId);
        const removedCount = savedGroups.filter(g => !waGroupIds.includes(g.groupId || g.id)).length;
        
        const updatedGroups = [
            ...savedGroups.filter(g => waGroupIds.includes(g.groupId || g.id)),
            ...newGroups
        ];
        
        writeGroups(userId, updatedGroups);
        
        res.json({ 
            success: true, 
            added: newGroups.length, 
            removed: removedCount,
            total: updatedGroups.length
        });
    } catch (error) {
        console.error(`[${userId}] Sync error:`, error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/:userId/groups/:groupId', (req, res) => {
    const { userId, groupId } = req.params;
    let groups = readGroups(userId);
    groups = groups.filter(g => g.id !== groupId && g.groupId !== groupId);
    writeGroups(userId, groups);
    res.json({ success: true });
});

// Discover WhatsApp groups
app.get('/api/:userId/whatsapp-groups', requireSession, async (req, res) => {
    try {
        const chats = await req.client.getChats();
        const groups = chats
            .filter(chat => chat.isGroup)
            .map(chat => ({
                id: chat.id._serialized,
                name: chat.name,
                participants: chat.participants?.length || 0
            }));
        res.json(groups);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== BROADCAST =====
app.post('/api/:userId/broadcast', requireSession, async (req, res) => {
    const { userId } = req.params;
    const { message, groups, image } = req.body;
    
    if (!message && !image) {
        return res.status(400).json({ error: 'Message or image is required' });
    }
    
    if (!groups || groups.length === 0) {
        return res.status(400).json({ error: 'At least one group is required' });
    }
    
    const settings = readSettings(userId);
    const processedMessage = processMessageVariables(message || '');
    const results = [];
    
    // Handle image if provided
    let media = null;
    if (image && image.startsWith('data:')) {
        const matches = image.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
            media = new MessageMedia(matches[1], matches[2]);
        }
    }
    
    for (let i = 0; i < groups.length; i++) {
        const groupId = groups[i];
        
        try {
            // Show typing indicator
            if (settings.typing?.enabled) {
                const chat = await req.client.getChatById(groupId);
                await chat.sendStateTyping();
                await delay(settings.typing.durationMs || 1500);
            }
            
            // Send message
            if (media) {
                await req.client.sendMessage(groupId, media, { caption: processedMessage });
            } else {
                await req.client.sendMessage(groupId, processedMessage);
            }
            
            results.push({ groupId, success: true });
            console.log(`[${userId}] Message sent to: ${groupId}`);
            
            // Queue delay
            if (settings.queue?.enabled && i < groups.length - 1) {
                await delay(settings.queue.delayMs || 2000);
            }
            
        } catch (error) {
            results.push({ groupId, success: false, error: error.message });
            console.error(`[${userId}] Failed to send to ${groupId}:`, error.message);
        }
    }
    
    // Save to history
    const history = readHistory(userId);
    history.push({
        id: Date.now().toString(),
        type: media ? 'image' : 'text',
        message: processedMessage.substring(0, 100),
        groupCount: groups.length,
        successCount: results.filter(r => r.success).length,
        failCount: results.filter(r => !r.success).length,
        timestamp: new Date().toISOString()
    });
    writeHistory(userId, history);
    
    res.json({ 
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results 
    });
});

// ===== AUTO REPLIES =====
app.get('/api/:userId/autoreplies', (req, res) => {
    res.json(readAutoReplies(req.params.userId));
});

app.post('/api/:userId/autoreplies', (req, res) => {
    const { userId } = req.params;
    const { keyword, response, matchType, enabled, image } = req.body;
    
    if (!keyword || !response) {
        return res.status(400).json({ error: 'Keyword and response are required' });
    }
    
    const replies = readAutoReplies(userId);
    replies.push({
        id: Date.now().toString(),
        keyword: keyword.toLowerCase(),
        response,
        matchType: matchType || 'contains',
        enabled: enabled !== false,
        imagePath: image || null,
        createdAt: new Date().toISOString()
    });
    writeAutoReplies(userId, replies);
    
    res.json({ success: true });
});

app.put('/api/:userId/autoreplies/:id', (req, res) => {
    const { userId, id } = req.params;
    const updates = req.body;
    
    let replies = readAutoReplies(userId);
    const index = replies.findIndex(r => r.id === id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Auto reply not found' });
    }
    
    replies[index] = { ...replies[index], ...updates };
    writeAutoReplies(userId, replies);
    
    res.json({ success: true });
});

app.delete('/api/:userId/autoreplies/:id', (req, res) => {
    const { userId, id } = req.params;
    let replies = readAutoReplies(userId);
    replies = replies.filter(r => r.id !== id);
    writeAutoReplies(userId, replies);
    res.json({ success: true });
});

// ===== TEMPLATES =====
app.get('/api/:userId/templates', (req, res) => {
    res.json(readTemplates(req.params.userId));
});

app.post('/api/:userId/templates', (req, res) => {
    const { userId } = req.params;
    const { name, message } = req.body;
    
    if (!name || !message) {
        return res.status(400).json({ error: 'Name and message are required' });
    }
    
    const templates = readTemplates(userId);
    templates.push({
        id: Date.now().toString(),
        name,
        message,
        createdAt: new Date().toISOString()
    });
    writeTemplates(userId, templates);
    
    res.json({ success: true });
});

app.put('/api/:userId/templates/:id', (req, res) => {
    const { userId, id } = req.params;
    const { name, message } = req.body;
    
    let templates = readTemplates(userId);
    const index = templates.findIndex(t => t.id === id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Template not found' });
    }
    
    templates[index] = { ...templates[index], name, message };
    writeTemplates(userId, templates);
    
    res.json({ success: true });
});

app.delete('/api/:userId/templates/:id', (req, res) => {
    const { userId, id } = req.params;
    let templates = readTemplates(userId);
    templates = templates.filter(t => t.id !== id);
    writeTemplates(userId, templates);
    res.json({ success: true });
});

// ===== SCHEDULES =====
app.get('/api/:userId/schedules', (req, res) => {
    res.json(readSchedules(req.params.userId));
});

app.post('/api/:userId/schedules', (req, res) => {
    const { userId } = req.params;
    const { message, groupIds, scheduledTime, recurring } = req.body;
    
    if (!scheduledTime || !groupIds || groupIds.length === 0) {
        return res.status(400).json({ error: 'Scheduled time and groups are required' });
    }
    
    const schedules = readSchedules(userId);
    schedules.push({
        id: Date.now().toString(),
        type: 'text',
        message,
        groupIds,
        scheduledTime,
        recurring: recurring || 'none',
        status: 'pending',
        createdAt: new Date().toISOString()
    });
    writeSchedules(userId, schedules);
    
    res.json({ success: true });
});

app.delete('/api/:userId/schedules/:id', (req, res) => {
    const { userId, id } = req.params;
    let schedules = readSchedules(userId);
    schedules = schedules.filter(s => s.id !== id);
    writeSchedules(userId, schedules);
    res.json({ success: true });
});

// ===== COMMANDS =====
app.get('/api/:userId/commands', (req, res) => {
    res.json(readCommands(req.params.userId));
});

app.post('/api/:userId/commands', (req, res) => {
    const { userId } = req.params;
    let { command, response } = req.body;
    
    if (!command || !response) {
        return res.status(400).json({ error: 'Command and response are required' });
    }
    
    if (!command.startsWith('!')) command = '!' + command;
    
    const commands = readCommands(userId);
    commands.push({
        id: Date.now().toString(),
        command: command.toLowerCase(),
        response,
        enabled: true,
        createdAt: new Date().toISOString()
    });
    writeCommands(userId, commands);
    
    res.json({ success: true });
});

app.put('/api/:userId/commands/:id', (req, res) => {
    const { userId, id } = req.params;
    let commands = readCommands(userId);
    const index = commands.findIndex(c => c.id === id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Command not found' });
    }
    
    commands[index] = { ...commands[index], ...req.body };
    writeCommands(userId, commands);
    
    res.json({ success: true });
});

app.delete('/api/:userId/commands/:id', (req, res) => {
    const { userId, id } = req.params;
    let commands = readCommands(userId);
    commands = commands.filter(c => c.id !== id);
    writeCommands(userId, commands);
    res.json({ success: true });
});

// ===== CONTACTS =====
app.get('/api/:userId/contacts', (req, res) => {
    res.json(readContacts(req.params.userId));
});

app.post('/api/:userId/contacts', (req, res) => {
    const { userId } = req.params;
    const { name, number, notes } = req.body;
    
    if (!name || !number) {
        return res.status(400).json({ error: 'Name and number are required' });
    }
    
    const contacts = readContacts(userId);
    contacts.push({
        id: Date.now().toString(),
        name,
        number: number.replace(/\D/g, ''),
        notes: notes || '',
        createdAt: new Date().toISOString()
    });
    writeContacts(userId, contacts);
    
    res.json({ success: true });
});

app.delete('/api/:userId/contacts/:id', (req, res) => {
    const { userId, id } = req.params;
    let contacts = readContacts(userId);
    contacts = contacts.filter(c => c.id !== id);
    writeContacts(userId, contacts);
    res.json({ success: true });
});

// ===== BLACKLIST =====
app.get('/api/:userId/blacklist', (req, res) => {
    res.json(readBlacklist(req.params.userId));
});

app.post('/api/:userId/blacklist', (req, res) => {
    const { userId } = req.params;
    const { number, reason } = req.body;
    
    if (!number) {
        return res.status(400).json({ error: 'Number is required' });
    }
    
    const blacklist = readBlacklist(userId);
    blacklist.push({
        id: Date.now().toString(),
        number: number.replace(/\D/g, ''),
        reason: reason || '',
        createdAt: new Date().toISOString()
    });
    writeBlacklist(userId, blacklist);
    
    res.json({ success: true });
});

app.delete('/api/:userId/blacklist/:id', (req, res) => {
    const { userId, id } = req.params;
    let blacklist = readBlacklist(userId);
    blacklist = blacklist.filter(b => b.id !== id);
    writeBlacklist(userId, blacklist);
    res.json({ success: true });
});

// ===== HISTORY =====
app.get('/api/:userId/history', (req, res) => {
    res.json(readHistory(req.params.userId));
});

app.delete('/api/:userId/history', (req, res) => {
    writeHistory(req.params.userId, []);
    res.json({ success: true });
});

// ===== SETTINGS =====
app.get('/api/:userId/settings', (req, res) => {
    const settings = readSettings(req.params.userId);
    // Mask password
    settings.auth = { ...settings.auth, password: '********' };
    res.json(settings);
});

app.put('/api/:userId/settings', (req, res) => {
    const { userId } = req.params;
    const current = readSettings(userId);
    const updates = req.body;
    
    const newSettings = {
        auth: { ...current.auth, ...updates.auth },
        queue: { ...current.queue, ...updates.queue },
        typing: { ...current.typing, ...updates.typing },
        webhook: { ...current.webhook, ...updates.webhook }
    };
    
    // Don't update password if masked
    if (updates.auth?.password === '********') {
        newSettings.auth.password = current.auth.password;
    }
    
    writeSettings(userId, newSettings);
    res.json({ success: true });
});

// ===== QUICK ACTIONS =====
app.get('/api/:userId/quickactions', (req, res) => {
    res.json(readQuickActions(req.params.userId));
});

app.post('/api/:userId/quickactions', (req, res) => {
    const { userId } = req.params;
    const { name, message, icon, groups } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    const actions = readQuickActions(userId);
    actions.push({
        id: Date.now().toString(),
        name,
        message: message || '',
        icon: icon || '⚡',
        groupIds: groups || [],
        createdAt: new Date().toISOString()
    });
    writeQuickActions(userId, actions);
    
    res.json({ success: true });
});

app.post('/api/:userId/quickactions/:id/execute', requireSession, async (req, res) => {
    const { userId, id } = req.params;
    const actions = readQuickActions(userId);
    const action = actions.find(a => a.id === id);
    
    if (!action) {
        return res.status(404).json({ error: 'Quick action not found' });
    }
    
    const settings = readSettings(userId);
    const processedMessage = processMessageVariables(action.message);
    const results = [];
    
    for (let i = 0; i < action.groupIds.length; i++) {
        const groupId = action.groupIds[i];
        
        try {
            if (settings.typing?.enabled) {
                const chat = await req.client.getChatById(groupId);
                await chat.sendStateTyping();
                await delay(settings.typing.durationMs || 1500);
            }
            
            await req.client.sendMessage(groupId, processedMessage);
            results.push({ groupId, success: true });
            
            if (settings.queue?.enabled && i < action.groupIds.length - 1) {
                await delay(settings.queue.delayMs || 2000);
            }
        } catch (error) {
            results.push({ groupId, success: false, error: error.message });
        }
    }
    
    res.json({ 
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length 
    });
});

app.delete('/api/:userId/quickactions/:id', (req, res) => {
    const { userId, id } = req.params;
    let actions = readQuickActions(userId);
    actions = actions.filter(a => a.id !== id);
    writeQuickActions(userId, actions);
    res.json({ success: true });
});

// ===== BACKUP =====
app.get('/api/:userId/backup', (req, res) => {
    const { userId } = req.params;
    
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
        settings: readSettings(userId)
    };
    
    res.json(backup);
});

app.post('/api/:userId/backup/restore', (req, res) => {
    const { userId } = req.params;
    const backup = req.body;
    
    try {
        if (backup.groups) writeGroups(userId, backup.groups);
        if (backup.templates) writeTemplates(userId, backup.templates);
        if (backup.schedules) writeSchedules(userId, backup.schedules);
        if (backup.autoReplies) writeAutoReplies(userId, backup.autoReplies);
        if (backup.commands) writeCommands(userId, backup.commands);
        if (backup.quickActions) writeQuickActions(userId, backup.quickActions);
        if (backup.contacts) writeContacts(userId, backup.contacts);
        if (backup.blacklist) writeBlacklist(userId, backup.blacklist);
        if (backup.settings) writeSettings(userId, backup.settings);
        
        res.json({ success: true, message: 'Backup restored successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== STATISTICS =====
app.get('/api/:userId/stats', (req, res) => {
    const { userId } = req.params;
    
    const history = readHistory(userId);
    const groups = readGroups(userId);
    const autoReplies = readAutoReplies(userId);
    
    const today = new Date().toDateString();
    const todayHistory = history.filter(h => new Date(h.timestamp).toDateString() === today);
    
    const totalSent = history.reduce((sum, h) => sum + (h.successCount || 0), 0);
    const todaySent = todayHistory.reduce((sum, h) => sum + (h.successCount || 0), 0);
    
    res.json({
        totalGroups: groups.length,
        totalAutoReplies: autoReplies.length,
        totalSent,
        todaySent,
        historyCount: history.length
    });
});

// ===== MEDIA LIBRARY =====
app.get('/api/:userId/media', (req, res) => {
    const { userId } = req.params;
    const userUploadsDir = path.join(UPLOADS_DIR, userId);
    
    if (!fs.existsSync(userUploadsDir)) {
        fs.mkdirSync(userUploadsDir, { recursive: true });
        return res.json([]);
    }
    
    try {
        const files = fs.readdirSync(userUploadsDir);
        const mediaFiles = files
            .filter(f => /\.(jpg|jpeg|png|gif|webp|mp4|mp3|pdf|doc|docx)$/i.test(f))
            .map(f => ({
                filename: f,
                url: `/uploads/${userId}/${f}`,
                size: fs.statSync(path.join(userUploadsDir, f)).size,
                createdAt: fs.statSync(path.join(userUploadsDir, f)).birthtime
            }));
        res.json(mediaFiles);
    } catch (e) {
        res.json([]);
    }
});

app.post('/api/:userId/media', upload.single('file'), (req, res) => {
    const { userId } = req.params;
    const userUploadsDir = path.join(UPLOADS_DIR, userId);
    
    if (!fs.existsSync(userUploadsDir)) {
        fs.mkdirSync(userUploadsDir, { recursive: true });
    }
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Move file to user's upload directory
    const oldPath = req.file.path;
    const newPath = path.join(userUploadsDir, req.file.filename);
    fs.renameSync(oldPath, newPath);
    
    res.json({
        success: true,
        filename: req.file.filename,
        url: `/uploads/${userId}/${req.file.filename}`
    });
});

app.delete('/api/:userId/media/:filename', (req, res) => {
    const { userId, filename } = req.params;
    const filePath = path.join(UPLOADS_DIR, userId, filename);
    
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Serve user uploads
app.use('/uploads', express.static(UPLOADS_DIR));

// ===== LEGACY ENDPOINTS (for backward compatibility) =====
app.get('/api/status', (req, res) => {
    // Return first connected session status or disconnected
    let status = 'disconnected';
    
    sessions.forEach((client, oderId) => {
        if (sessionStatuses.get(oderId) === 'connected') {
            status = 'connected';
        }
    });
    
    res.json({ status });
});

// ===== SCHEDULE CHECKER =====
async function checkSchedules() {
    const now = new Date();
    
    // Check schedules for all active sessions
    sessions.forEach(async (client, userId) => {
        if (sessionStatuses.get(userId) !== 'connected') return;
        
        const schedules = readSchedules(userId);
        const settings = readSettings(userId);
        
        for (const schedule of schedules) {
            if (schedule.status === 'sent') continue;
            
            const scheduledTime = new Date(schedule.scheduledTime);
            if (now >= scheduledTime) {
                console.log(`[${userId}] Executing scheduled broadcast: ${schedule.id}`);
                
                let successCount = 0;
                let failCount = 0;
                
                for (const groupId of schedule.groupIds) {
                    try {
                        if (settings.typing?.enabled) {
                            const chat = await client.getChatById(groupId);
                            await chat.sendStateTyping();
                            await delay(settings.typing.durationMs || 1500);
                        }
                        
                        const message = processMessageVariables(schedule.message);
                        await client.sendMessage(groupId, message);
                        successCount++;
                        
                        if (settings.queue?.enabled) {
                            await delay(settings.queue.delayMs || 2000);
                        }
                    } catch (error) {
                        failCount++;
                        console.error(`[${userId}] Failed to send scheduled message to ${groupId}:`, error.message);
                    }
                }
                
                // Update schedule status
                schedule.status = 'sent';
                schedule.sentAt = new Date().toISOString();
                writeSchedules(userId, schedules);
                
                // Add to history
                const history = readHistory(userId);
                history.push({
                    id: Date.now().toString(),
                    type: 'text',
                    message: schedule.message.substring(0, 100),
                    groupCount: schedule.groupIds.length,
                    successCount,
                    failCount,
                    scheduled: true,
                    timestamp: new Date().toISOString()
                });
                writeHistory(userId, history);
                
                console.log(`[${userId}] Scheduled broadcast completed: ${successCount} success, ${failCount} failed`);
            }
        }
    });
}

// Run schedule checker every minute
setInterval(checkSchedules, 60000);

// ===== START SERVER =====
async function startServer() {
    console.log('🚀 Starting WhatsApp Bot SaaS Server...');
    
    // Connect to MongoDB first
    const mongoConnected = await connectMongoDB();
    
    if (!mongoConnected) {
        console.error('❌ Cannot start server without MongoDB connection');
        process.exit(1);
    }
    
    // Start Express server
    app.listen(PORT, () => {
        console.log(`✅ Server running on http://localhost:${PORT}`);
        console.log('');
        console.log('📌 Session Management Endpoints:');
        console.log(`   POST /api/session/start     - Start a new session (body: { userId })`);
        console.log(`   GET  /api/session/qr/:userId - Get QR code for scanning`);
        console.log(`   GET  /api/session/status/:userId - Get session status`);
        console.log(`   GET  /api/sessions          - List all active sessions`);
        console.log(`   DELETE /api/session/:userId - Destroy a session`);
        console.log('');
        console.log('📌 Per-User API Endpoints:');
        console.log(`   GET/POST /api/:userId/groups`);
        console.log(`   POST /api/:userId/broadcast`);
        console.log(`   GET/POST /api/:userId/autoreplies`);
        console.log(`   GET/POST /api/:userId/templates`);
        console.log(`   GET/POST /api/:userId/schedules`);
        console.log(`   GET/POST /api/:userId/commands`);
        console.log(`   GET/POST /api/:userId/settings`);
        console.log(`   GET /api/:userId/stats`);
        console.log('');
    });
}

// Start the server
startServer();
