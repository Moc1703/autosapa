// ===== WHATSAPP BOT - COMPLETE JAVASCRIPT =====

// ===== GLOBAL STATE =====
let isOnline = navigator.onLine;
let currentPage = { history: 1, logs: 1 };
const ITEMS_PER_PAGE = 20;

// ===== UTILITY FUNCTIONS =====

// Show loading spinner in element
function showLoading(elementId, message = 'Loading...') {
    const el = document.getElementById(elementId);
    if (el) {
        el.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>${message}</p></div>`;
    }
}

// Show skeleton loading
function showSkeleton(elementId, count = 3) {
    const el = document.getElementById(elementId);
    if (el) {
        el.innerHTML = Array(count).fill('<div class="skeleton-item"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>').join('');
    }
}

// Validate form fields
function validateForm(fields) {
    for (const [value, name, rules = {}] of fields) {
        if (rules.required && !value?.trim()) {
            toast(`${name} is required`, 'error');
            return false;
        }
        if (rules.minLength && value.length < rules.minLength) {
            toast(`${name} must be at least ${rules.minLength} characters`, 'error');
            return false;
        }
        if (rules.pattern && !rules.pattern.test(value)) {
            toast(`${name} format is invalid`, 'error');
            return false;
        }
    }
    return true;
}

// Custom confirm dialog (replaces native confirm)
function showConfirm(message, onConfirm, onCancel = null) {
    const modal = document.getElementById('confirmModal');
    const msgEl = document.getElementById('confirmMessage');
    const btnConfirm = document.getElementById('confirmYes');
    const btnCancel = document.getElementById('confirmNo');

    if (!modal) {
        // Fallback to native confirm if modal doesn't exist
        if (confirm(message)) onConfirm();
        else if (onCancel) onCancel();
        return;
    }

    msgEl.textContent = message;
    modal.classList.remove('hidden');

    const cleanup = () => {
        modal.classList.add('hidden');
        btnConfirm.onclick = null;
        btnCancel.onclick = null;
    };

    btnConfirm.onclick = () => { cleanup(); onConfirm(); };
    btnCancel.onclick = () => { cleanup(); if (onCancel) onCancel(); };
}

// Offline/Online detection
function initOfflineDetection() {
    const updateStatus = () => {
        isOnline = navigator.onLine;
        const indicator = document.getElementById('offlineIndicator');
        if (indicator) {
            indicator.classList.toggle('hidden', isOnline);
        }
        if (!isOnline) {
            toast('You are offline. Some features may not work.', 'warning');
        }
    };

    window.addEventListener('online', () => {
        isOnline = true;
        updateStatus();
        toast('Back online!', 'success');
    });

    window.addEventListener('offline', updateStatus);
    updateStatus();
}

// Keyboard shortcuts
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Escape to close modals
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
        }

        // Ctrl+Enter to send broadcast
        if (e.ctrlKey && e.key === 'Enter') {
            const activeTab = document.querySelector('.tab-panel.active');
            if (activeTab?.id === 'tab-broadcast') {
                e.preventDefault();
                sendBroadcast();
            }
        }

        // Ctrl+S to save draft
        if (e.ctrlKey && e.key === 's') {
            const activeTab = document.querySelector('.tab-panel.active');
            if (activeTab?.id === 'tab-broadcast') {
                e.preventDefault();
                saveDraft();
                toast('Draft saved!', 'success');
            }
        }
    });
}

// Drag and drop for images
function initDragDrop() {
    const uploadAreas = document.querySelectorAll('.upload-area');

    uploadAreas.forEach(area => {
        area.addEventListener('dragover', (e) => {
            e.preventDefault();
            area.classList.add('drag-over');
        });

        area.addEventListener('dragleave', () => {
            area.classList.remove('drag-over');
        });

        area.addEventListener('drop', (e) => {
            e.preventDefault();
            area.classList.remove('drag-over');

            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                const input = area.querySelector('input[type="file"]');
                if (input) {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    input.files = dt.files;
                    input.dispatchEvent(new Event('change'));
                }
            } else {
                toast('Please drop an image file', 'error');
            }
        });
    });
}

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Swipe actions for mobile
function initSwipeActions() {
    let touchStartX = 0;
    let touchEndX = 0;
    let currentSwipeEl = null;
    const minSwipeDistance = 80;

    document.addEventListener('touchstart', (e) => {
        const target = e.target.closest('.schedule-card, .card-list-item');
        if (!target) return;

        touchStartX = e.changedTouches[0].screenX;
        currentSwipeEl = target;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!currentSwipeEl) return;

        touchEndX = e.changedTouches[0].screenX;
        const swipeDistance = touchStartX - touchEndX;

        // Swipe left = delete reveal
        if (swipeDistance > minSwipeDistance) {
            currentSwipeEl.classList.add('swiped-left');
            // Find and show delete button or trigger delete
            const deleteBtn = currentSwipeEl.querySelector('.btn-danger');
            if (deleteBtn) {
                deleteBtn.classList.add('swipe-revealed');
            }
        }
        // Swipe right = cancel
        else if (swipeDistance < -minSwipeDistance) {
            currentSwipeEl.classList.remove('swiped-left');
            const deleteBtn = currentSwipeEl.querySelector('.btn-danger');
            if (deleteBtn) deleteBtn.classList.remove('swipe-revealed');
        }

        currentSwipeEl = null;
    }, { passive: true });

    // Reset swipe on click elsewhere
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.swiped-left')) {
            document.querySelectorAll('.swiped-left').forEach(el => {
                el.classList.remove('swiped-left');
                el.querySelectorAll('.swipe-revealed').forEach(btn => btn.classList.remove('swipe-revealed'));
            });
        }
    });
}

// ===== DRAFT AUTO-SAVE =====
const DRAFT_KEY = 'autosapa_draft';
const saveDraftDebounced = debounce(saveDraft, 1000);

function saveDraft() {
    const message = document.getElementById('quickMessage')?.value || '';
    if (message.trim()) {
        const draft = {
            message,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));

        // Show indicator
        const indicator = document.getElementById('draftIndicator');
        if (indicator) {
            indicator.classList.remove('hidden');
            setTimeout(() => indicator.classList.add('hidden'), 2000);
        }
    } else {
        localStorage.removeItem(DRAFT_KEY);
    }
}

function loadDraft() {
    const draftStr = localStorage.getItem(DRAFT_KEY);
    if (!draftStr) return;

    try {
        const draft = JSON.parse(draftStr);
        const textarea = document.getElementById('quickMessage');
        if (textarea && draft.message) {
            textarea.value = draft.message;
            toast('Draft restored', 'info');
        }
    } catch (e) {
        console.error('Failed to load draft:', e);
    }
}

function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
}

// ===== EXPORT/IMPORT SCHEDULES =====
function exportSchedules() {
    if (!schedules.length) {
        toast('No schedules to export', 'error');
        return;
    }

    const data = JSON.stringify(schedules, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `schedules_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
    toast('Schedules exported!', 'success');
}

async function importSchedules(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const imported = JSON.parse(text);

        if (!Array.isArray(imported)) {
            toast('Invalid schedule file', 'error');
            return;
        }

        // Import each schedule
        let count = 0;
        for (const schedule of imported) {
            // Skip already sent or duplicate
            if (schedule.status === 'sent') continue;

            await apiFetch(getUserApi() + '/schedules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: schedule.name,
                    message: schedule.message,
                    groupIds: schedule.groupIds || schedule.groups,
                    scheduledTime: schedule.scheduledTime,
                    recurring: schedule.recurring,
                    image: schedule.image
                })
            });
            count++;
        }

        toast(`Imported ${count} schedule(s)!`, 'success');
        loadSchedules();
    } catch (e) {
        toast('Failed to import: ' + e.message, 'error');
    }

    event.target.value = '';
}

// ===== CLONE TEMPLATE TO SCHEDULE =====
function scheduleFromTemplate(templateIndex) {
    const template = templates[templateIndex];
    if (!template) return;

    showAddSchedule();

    // Pre-fill from template
    document.getElementById('scheduleMessage').value = template.message || '';
    document.getElementById('scheduleName').value = `Schedule: ${template.name}`;

    toast('Create schedule from template', 'info');
}

// ===== BROWSER NOTIFICATIONS =====
async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
    }
}

function showBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.png' });
    }
}

// ===== ANALYTICS =====
async function loadBestTimes() {
    try {
        const res = await apiFetch(getUserApi() + '/analytics/best-times');
        const data = await res.json();

        const container = document.getElementById('bestTimesContainer');
        if (!container) return;

        if (!data.bestHours?.length) {
            container.innerHTML = '<p class="text-muted text-center">Not enough data yet. Send more broadcasts to see analytics.</p>';
            return;
        }

        // Render heatmap
        let html = '<div class="best-times-heatmap">';

        // Hour labels
        html += '<div class="heatmap-row">';
        for (let h = 0; h < 24; h++) {
            html += `<div class="heatmap-label">${h.toString().padStart(2, '0')}</div>`;
        }
        html += '</div>';

        // Heatmap cells
        html += '<div class="heatmap-row">';
        data.hourlyStats.forEach(s => {
            const intensity = s.sent > 0 ? Math.min(s.success / Math.max(...data.hourlyStats.map(x => x.success || 1)), 1) : 0;
            const color = intensity > 0.7 ? 'high' : intensity > 0.3 ? 'mid' : 'low';
            html += `<div class="heatmap-cell ${color}" title="Hour ${s.hour}: ${s.sent} sent, ${s.success} success"></div>`;
        });
        html += '</div>';

        // Best hours recommendation
        html += '<div class="best-hours-list">';
        html += '<strong>🏆 Best Hours to Send:</strong><br>';
        data.bestHours.forEach(h => {
            html += `<span class="badge badge-success">${h.hour}:00 (${h.rate}% success)</span> `;
        });
        html += '</div>';

        container.innerHTML = html;
    } catch (e) {
        console.error('Error loading best times:', e);
    }
}

async function loadGroupStats() {
    try {
        const res = await apiFetch(getUserApi() + '/analytics/group-stats');
        const stats = await res.json();

        const container = document.getElementById('groupStatsContainer');
        if (!container) return;

        if (!stats.length) {
            container.innerHTML = '<p class="text-muted text-center">No group activity data yet.</p>';
            return;
        }

        let html = '<div class="group-stats-list">';
        stats.slice(0, 10).forEach(g => {
            const rate = g.sent > 0 ? Math.round((g.success / g.sent) * 100) : 0;
            html += `
                <div class="group-stat-item">
                    <span class="group-stat-name">${escapeHtml(g.name || g.id)}</span>
                    <div class="group-stat-bar">
                        <div class="group-stat-fill" style="width: ${rate}%"></div>
                    </div>
                    <span class="group-stat-value">${g.sent} sent</span>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;
    } catch (e) {
        console.error('Error loading group stats:', e);
    }
}


// Check if user is logged in
const authToken = localStorage.getItem('token');
const userStr = localStorage.getItem('user');

if (!authToken || !userStr) {
    window.location.href = '/login';
}

// Use user.id from login as userId (consistent across sessions)
const loggedInUser = JSON.parse(userStr);
let userId = loggedInUser.id;

// Save for consistency
localStorage.setItem('wa_userId', userId);

// Redirect to scan if userId somehow missing
if (!userId) {
    window.location.href = '/scan';
}

const API = '';
const getUserApi = () => `/api/${userId}`;

// Helper function for authenticated API calls
async function apiFetch(endpoint, options = {}) {
    const defaultHeaders = {
        'Authorization': `Bearer ${authToken}`
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    return fetch(endpoint, {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    });
}
let groups = [];
let autoReplies = [];
let schedules = [];
let templates = [];
let commands = [];
let contacts = [];
let blacklist = [];
let settings = {};
let history = [];
let currentUser = null;
let selectedImage = null;
let replyImage = null;
let scheduleImage = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    // Check auth token validity
    const authValid = await checkAuthToken();
    if (!authValid) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
    }

    // Check if session is connected, if not redirect to scan
    const isConnected = await checkSessionConnected();
    if (!isConnected) {
        window.location.href = '/scan';
        return;
    }

    // Save userId
    localStorage.setItem('wa_userId', userId);

    checkStatus();
    loadData();
    loadDashboardStats(); // Initial load
    loadSettings();
    loadQuickActions();
    loadMedia();
    setInterval(checkStatus, 5000);

    // Initialize new features
    initOfflineDetection();
    initKeyboardShortcuts();
    setTimeout(initDragDrop, 500); // Wait for DOM
    setTimeout(initSwipeActions, 600); // Initialize swipe gestures
    setTimeout(loadDraft, 700); // Restore draft if available
    requestNotificationPermission(); // Request browser notification permission

    // Background sync groups (after 5 seconds to let WhatsApp load chats)
    setTimeout(backgroundSyncGroups, 5000);

    // Check dark mode
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        setTimeout(() => document.getElementById('darkToggle')?.classList.add('active'), 100);
    }
});

// Check if session is connected
async function checkSessionConnected() {
    try {
        const res = await fetch(`/api/session/status/${userId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        return data.status === 'connected';
    } catch (e) {
        console.error('Session check failed:', e);
        return false;
    }
}

// Check auth token validity
async function checkAuthToken() {
    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await res.json();

        if (!data.success) return false;

        currentUser = data.user;

        // Check if subscription is active
        if (!data.user.isActive) {
            alert('Subscription Anda telah berakhir. Silakan upgrade ke Pro.');
            window.location.href = '/dashboard';
            return false;
        }

        return true;
    } catch (e) {
        console.error('Auth check failed:', e);
        return false;
    }
}

// Background sync groups
async function backgroundSyncGroups() {
    // Only sync if no groups yet
    if (groups.length > 0) return;

    console.log('Background sync: Starting...');

    let attempts = 0;
    const maxAttempts = 6; // Try 6 times (30 seconds total)

    const trySync = async () => {
        attempts++;
        try {
            const res = await apiFetch(getUserApi() + '/groups/sync', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await res.json();

            if (data.total > 0) {
                console.log(`Background sync: Found ${data.total} groups!`);
                toast(`Synced ${data.total} groups from WhatsApp`, 'success');
                loadGroups();
                return;
            }

            if (attempts < maxAttempts) {
                console.log(`Background sync: No groups yet, retry ${attempts}/${maxAttempts}`);
                setTimeout(trySync, 5000);
            } else {
                console.log('Background sync: Max attempts reached');
            }
        } catch (e) {
            if (attempts < maxAttempts) {
                setTimeout(trySync, 5000);
            }
        }
    };

    trySync();
}

// ===== AUTH SYSTEM =====
async function checkAuth() {
    try {
        const res = await fetch(API + '/api/auth/check', {
            headers: { 'X-Auth-Token': authToken }
        });
        const data = await res.json();

        if (data.authEnabled && !data.authenticated) {
            showModal('loginModal');
            return false;
        }
        return true;
    } catch (e) {
        console.error('Auth check failed:', e);
        return true; // Allow access if check fails
    }
}

async function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) return toast('Please fill all fields', 'error');

    try {
        const res = await fetch(API + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.success && data.token) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            closeModal('loginModal');
            toast('Login successful!', 'success');
            loadData();
        } else {
            toast(data.error || 'Login failed', 'error');
        }
    } catch (e) {
        toast('Login failed', 'error');
    }
}

async function logout() {
    try {
        await fetch(API + '/api/auth/logout', {
            method: 'POST',
            headers: { 'X-Auth-Token': authToken }
        });
    } catch (e) {
        // Ignore errors
    }

    // SECURITY FIX: Clear ALL localStorage to prevent session leakage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('wa_userId');
    localStorage.removeItem('authToken');
    localStorage.removeItem('autosapa_draft');
    localStorage.removeItem('darkMode');
    
    // Redirect to login with fresh flag
    window.location.href = '/login?fresh=true';
}

async function switchWhatsApp() {
    if (!confirm('Yakin ingin ganti akun WhatsApp?\n\nSession lama akan dihapus dan Anda perlu scan QR code baru.')) {
        return;
    }

    try {
        toast('Menghapus session WhatsApp...', 'info');

        const res = await fetch('/api/session/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ userId, clearAuth: true })
        });

        const data = await res.json();
        console.log('Switch WA result:', data);

        toast('Session dihapus. Redirecting ke scan QR...', 'success');

        setTimeout(() => {
            window.location.href = '/scan';
        }, 1500);

    } catch (error) {
        console.error('Switch WhatsApp failed:', error);
        toast('Gagal menghapus session', 'error');
    }
}

// ===== STATUS =====
async function checkStatus() {
    try {
        const res = await fetch(`/api/session/status/${userId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        let className, statusText, pillClass;
        if (data.status === 'connected') {
            className = 'status-badge connected';
            pillClass = 'dash-status-pill connected';
            statusText = 'Connected';
        } else if (data.status === 'qr') {
            className = 'status-badge disconnected';
            pillClass = 'dash-status-pill disconnected';
            statusText = 'Scan QR';
        } else {
            className = 'status-badge disconnected';
            pillClass = 'dash-status-pill disconnected';
            statusText = 'Disconnected';
        }

        // Update header, desktop sidebar, and mobile menu status
        updateStatusBadge('statusBadge', 'statusText', className, statusText);
        updateStatusBadge('statusBadgeDesktop', 'statusTextDesktop', className, statusText);
        updateStatusBadge('statusBadgeMobile', 'statusTextMobile', className, statusText);
        
        // Update dashboard status pill (new UI)
        const dashPill = document.getElementById('dashStatusPill');
        const dashText = document.getElementById('dashStatusText');
        if (dashPill) dashPill.className = pillClass;
        if (dashText) dashText.textContent = statusText;
        
        // Update sidebar status text
        const sidebarStatus = document.getElementById('statusTextDesktop');
        if (sidebarStatus) sidebarStatus.textContent = statusText;
        
        // Update mobile header badge color
        const mobileBadge = document.getElementById('statusBadge');
        if (mobileBadge) {
            mobileBadge.style.background = data.status === 'connected' ? '#00ff88' : '#ff4757';
        }
    } catch (e) {
        updateStatusBadge('statusBadge', 'statusText', 'status-badge disconnected', 'Offline');
        updateStatusBadge('statusBadgeDesktop', 'statusTextDesktop', 'status-badge disconnected', 'Offline');
        updateStatusBadge('statusBadgeMobile', 'statusTextMobile', 'status-badge disconnected', 'Offline');
        
        // Update dashboard pill on error
        const dashPill = document.getElementById('dashStatusPill');
        const dashText = document.getElementById('dashStatusText');
        if (dashPill) dashPill.className = 'dash-status-pill disconnected';
        if (dashText) dashText.textContent = 'Offline';
    }
}

function updateStatusBadge(badgeId, textId, className, text) {
    const badge = document.getElementById(badgeId);
    const textEl = document.getElementById(textId);
    if (badge) badge.className = className;
    if (textEl) textEl.textContent = text;
}

// ===== MOBILE MENU =====
function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    const overlay = document.getElementById('mobileMenuOverlay');
    const hamburger = document.getElementById('hamburgerBtn');

    menu.classList.toggle('active');
    overlay.classList.toggle('active');
    hamburger.classList.toggle('active');

    // Prevent body scroll when menu is open
    document.body.style.overflow = menu.classList.contains('active') ? 'hidden' : '';
}

// ===== TAB SWITCHING =====
// Mobile Sidebar Toggle
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('open');
    
    // Create/Toggle Overlay
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.classList.add('sidebar-overlay');
        overlay.onclick = toggleSidebar;
        document.body.appendChild(overlay);
    }
}

// Close sidebar on tab switch (mobile)
function switchTab(tab) {
    document.querySelector('.sidebar').classList.remove('open');

    // Hide all panels
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    // Update mobile menu items
    document.querySelectorAll('.mobile-menu-item').forEach(n => n.classList.remove('active'));
    const mobileMenuItem = document.querySelector(`.mobile-menu-item[data-tab="${tab}"]`);
    if (mobileMenuItem) mobileMenuItem.classList.add('active');

    // Update desktop sidebar
    document.querySelectorAll('.sidebar-item').forEach(n => n.classList.remove('active'));
    const desktopNav = document.querySelector(`.sidebar-item[data-tab="${tab}"]`);
    if (desktopNav) desktopNav.classList.add('active');

    // Update bottom navigation (mobile)
    document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));
    const bottomNavItem = document.querySelector(`.bottom-nav-item[data-tab="${tab}"]`);
    if (bottomNavItem) bottomNavItem.classList.add('active');

    // Show selected panel
    document.getElementById('tab-' + tab).classList.add('active');

    // Load data for tab
    if (tab === 'dashboard') { loadDashboardStats(); }
    if (tab === 'broadcast') { loadQuickActions(); loadMedia(); }
    if (tab === 'groups') { loadGroups(); loadContacts(); loadCategories(); }
    if (tab === 'auto') { loadAutoReplies(); loadCommands(); loadAutoReplyStats(); }
    if (tab === 'schedule') { loadSchedules(); loadTemplates(); }
    if (tab === 'history') { loadHistory(); loadAnalytics(); }
}

// ===== LOAD DATA =====
async function loadData() {
    await loadGroups();
    await loadStats();
}

async function loadGroups() {
    try {
        const res = await apiFetch(getUserApi() + '/groups');
        groups = await res.json();
        renderGroupsList();
        renderGroupSelect();

        // Update both mobile and desktop stats
        const el1 = document.getElementById('totalGroups');
        const el2 = document.getElementById('totalGroupsDesktop');
        if (el1) el1.textContent = groups.length;
        if (el2) el2.textContent = groups.length;
    } catch (e) {
        console.error('Error loading groups:', e);
    }
}

function renderGroupsList() {
    const list = document.getElementById('groupsList');
    if (!groups.length) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <div class="empty-title">No groups yet</div>
                <p class="empty-text">Add groups manually or discover from WhatsApp</p>
            </div>`;
        return;
    }

    list.innerHTML = groups.map(g => `
        <div class="group-item">
            <div class="group-icon">👥</div>
            <div class="group-info">
                <div class="group-name">${escapeHtml(g.name)}</div>
                <div class="group-meta">
                    ID: ${escapeHtml(g.id.substring(0, 20))}...
                    ${g.participants ? ` • ${g.participants} members` : ''}
                </div>
            </div>
            <div class="group-actions">
                <button class="btn btn-sm btn-danger" onclick="deleteGroup('${escapeAttr(g.id)}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

function renderGroupSelect() {
    const list = document.getElementById('groupSelectList');
    if (!groups.length) {
        list.innerHTML = `<div class="empty-state"><p class="text-muted">No groups yet</p></div>`;
        return;
    }

    list.innerHTML = groups.map(g => `
        <div class="group-select-item" onclick="toggleGroupSelect(this, '${escapeAttr(g.groupId || g.id)}')">
            <input type="checkbox" value="${escapeAttr(g.groupId || g.id)}" onclick="event.stopPropagation(); updateSelectedCount()">
            <div style="flex:1">
                <div style="font-weight:500">${escapeHtml(g.name)}</div>
                <div style="font-size:12px; color:var(--text-muted)">${escapeHtml(g.id)}</div>
            </div>
        </div>
    `).join('');
}

function toggleGroupSelect(el, id) {
    const checkbox = el.querySelector('input');
    checkbox.checked = !checkbox.checked;
    el.classList.toggle('selected', checkbox.checked);
    updateSelectedCount();
}

function updateSelectedCount() {
    const checked = document.querySelectorAll('#groupSelectList input:checked').length;
    document.getElementById('selectedCount').textContent = checked + ' selected';
    document.getElementById('selectAllGroups').checked = checked === groups.length && groups.length > 0;
}

function toggleSelectAll() {
    const all = document.getElementById('selectAllGroups').checked;
    document.querySelectorAll('#groupSelectList input').forEach(cb => {
        cb.checked = all;
        cb.closest('.group-select-item').classList.toggle('selected', all);
    });
    updateSelectedCount();
}

function filterGroups() {
    const q = document.getElementById('searchGroups').value.toLowerCase();
    document.querySelectorAll('#groupsList .list-item').forEach(item => {
        const name = item.querySelector('.list-item-title').textContent.toLowerCase();
        item.style.display = name.includes(q) ? '' : 'none';
    });
}

// ===== IMAGE HANDLING =====
function previewImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    selectedImage = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('imagePreview').src = e.target.result;
        document.getElementById('imagePreview').classList.remove('hidden');
        document.getElementById('removeImageBtn').classList.remove('hidden');
        document.getElementById('uploadArea').classList.add('has-image');
        document.getElementById('uploadText').textContent = '✅ Image selected';
    };
    reader.readAsDataURL(file);
}

function removeImage() {
    selectedImage = null;
    document.getElementById('imageInput').value = '';
    document.getElementById('imagePreview').classList.add('hidden');
    document.getElementById('removeImageBtn').classList.add('hidden');
    document.getElementById('uploadArea').classList.remove('has-image');
    document.getElementById('uploadText').textContent = '📷 Tap to add image (optional)';
}

function previewReplyImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    replyImage = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('replyImagePreview').src = e.target.result;
        document.getElementById('replyImagePreview').classList.remove('hidden');
        document.getElementById('replyUploadText').textContent = '✅ Image selected';
    };
    reader.readAsDataURL(file);
}

function previewScheduleImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    scheduleImage = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('scheduleImagePreview').src = e.target.result;
        document.getElementById('scheduleImagePreview').classList.remove('hidden');
        document.getElementById('scheduleUploadText').textContent = '✅ Image selected';
    };
    reader.readAsDataURL(file);
}

// ===== BROADCAST =====
function toggleAntiBanSettings() {
    const settings = document.getElementById('antiBanSettings');
    settings.classList.toggle('hidden');
}

function toggleSafeMode() {
    const toggle = document.getElementById('safeModeToggle');
    const customSettings = document.getElementById('customAntiBanSettings');
    const badge = document.getElementById('antiBanIndicator');

    toggle.classList.toggle('active');

    if (toggle.classList.contains('active')) {
        customSettings.classList.add('hidden');
        badge.textContent = 'Safe Mode ON';
        badge.className = 'badge badge-active';
    } else {
        customSettings.classList.remove('hidden');
        badge.textContent = 'Custom Mode';
        badge.className = 'badge badge-warning';
    }
}

function toggleSleepMode() {
    const toggle = document.getElementById('sleepModeToggle');
    const settings = document.getElementById('sleepSettings');
    toggle.classList.toggle('active');
    settings.classList.toggle('hidden', !toggle.classList.contains('active'));
}

// Target Tabs
let activeTargetTab = 'groups';

function switchTargetTab(tab) {
    activeTargetTab = tab;

    // UI Updates
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tabBtn-${tab}`).classList.add('active');

    document.getElementById('targetPanel-groups').classList.add('hidden');
    document.getElementById('targetPanel-manual').classList.add('hidden');
    document.getElementById(`targetPanel-${tab}`).classList.remove('hidden');

    // Update count display
    if (tab === 'groups') updateSelectedCount();
    else updateManualCount();
}

function updateManualCount() {
    const text = document.getElementById('manualNumbers').value;
    const numbers = extractNumbers(text);
    document.getElementById('manualCount').textContent = `${numbers.length} numbers`;
    document.getElementById('selectedCount').textContent = `${numbers.length} numbers`;
}

// Extract and normalize numbers from text
function extractNumbers(text) {
    if (!text) return [];
    // Split by comma, new line, or space
    return text.split(/[\n,;]+/)
        .map(n => n.replace(/\D/g, '')) // Remove non-digits
        .filter(n => n.length >= 10) // Filter invalid length
        .map(n => {
            if (n.startsWith('0')) return '62' + n.substring(1);
            if (n.startsWith('62')) return n;
            return '62' + n; // Default to ID
        });
}

// Listen for manual input
document.getElementById('manualNumbers')?.addEventListener('input', debounce(updateManualCount, 500));


async function sendBroadcast() {
    const message = document.getElementById('quickMessage').value.trim();
    let recipients = [];
    let targetType = 'groups';

    // Get Recipients based on active tab
    if (activeTargetTab === 'groups') {
        recipients = [...document.querySelectorAll('#groupSelectList input:checked')].map(cb => cb.value);
        if (!recipients.length) return toast('Please select at least one group', 'error');
    } else {
        const text = document.getElementById('manualNumbers').value;
        const numbers = extractNumbers(text);
        if (!numbers.length) return toast('Please enter at least one valid number', 'error');

        // Format for backend (append @c.us for contacts)
        recipients = numbers.map(n => n.endsWith('@c.us') ? n : `${n}@c.us`);
        targetType = 'manual';
    }

    if (!message && !selectedImage) return toast('Please enter a message or select an image', 'error');

    // Anti-Ban Parameters
    const isSafeMode = document.getElementById('safeModeToggle')?.classList.contains('active') ?? true;
    let randomDelayMs = { min: 2000, max: 5000 };
    let sleepMode = { enabled: false, after: 20, durationMs: 60000 };

    if (!isSafeMode) {
        const min = parseInt(document.getElementById('delayMin').value) || 2;
        const max = parseInt(document.getElementById('delayMax').value) || 5;
        randomDelayMs = { min: min * 1000, max: max * 1000 };

        const isSleepActive = document.getElementById('sleepModeToggle')?.classList.contains('active');
        if (isSleepActive) {
            const sleepAfter = parseInt(document.getElementById('sleepAfter').value) || 50;
            const sleepDurationMins = parseInt(document.getElementById('sleepDuration').value) || 5;
            sleepMode = {
                enabled: true,
                after: sleepAfter,
                durationMs: sleepDurationMins * 60 * 1000
            };
        }
    }

    const btn = document.getElementById('sendBtn');
    const progressDiv = document.getElementById('broadcastProgress');
    const progressText = document.getElementById('progressText');

    btn.disabled = true;
    btn.textContent = '⏳ Sending...';
    progressDiv.classList.remove('hidden');

    // Estimate Time & Show
    const avgDelay = (randomDelayMs.min + randomDelayMs.max) / 2;
    const estTimeMs = (recipients.length * avgDelay) + (sleepMode.enabled ? (Math.floor(recipients.length / sleepMode.after) * sleepMode.durationMs) : 0);
    const estMins = Math.ceil(estTimeMs / 60000);
    progressText.textContent = `Sending to ${recipients.length} ${targetType}. Est. time: ${estMins} mins...`;

    try {
        let imageData = null;
        if (selectedImage) {
            imageData = await toBase64(selectedImage);
        }

        const res = await apiFetch(getUserApi() + '/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                groups: recipients, // Backend uses 'groups' var but handles IDs genericly
                targetType,         // Hint for backend (optional but good for logging)
                image: imageData,
                randomDelayMs,
                sleepMode
            })
        });

        const data = await res.json();

        if (data.error) throw new Error(data.error);

        showResult(data);
        if (activeTargetTab === 'manual') {
            // Clear manual numbers on success? maybe optional.
            // document.getElementById('manualNumbers').value = '';
        }
        document.getElementById('quickMessage').value = '';
        removeImage();
        loadStats();
    } catch (e) {
        console.error(e);
        toast(e.message || 'Failed to send broadcast', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '📤 Send Broadcast';
        progressDiv.classList.add('hidden');
    }
}

function showResult(data) {
    const section = document.getElementById('resultSection');
    const card = document.getElementById('resultCard');

    section.classList.remove('hidden');
    card.className = 'result-card ' + (data.failed === 0 ? 'success' : 'error');

    document.getElementById('resultTitle').textContent = data.failed === 0 ? 'Broadcast Sent!' : 'Partially Sent';
    document.getElementById('resultSuccess').textContent = data.success || 0;
    document.getElementById('resultFailed').textContent = data.failed || 0;

    setTimeout(() => section.classList.add('hidden'), 5000);
}

// ===== STATS =====
async function loadStats() {
    try {
        const [histRes, groupRes, replyRes] = await Promise.all([
            apiFetch(getUserApi() + '/history'),
            apiFetch(getUserApi() + '/groups'),
            apiFetch(getUserApi() + '/autoreplies')
        ]);

        const hist = await histRes.json();
        const grps = await groupRes.json();
        const replies = await replyRes.json();

        const today = new Date().toDateString();
        const sentToday = hist.filter(h => new Date(h.timestamp).toDateString() === today)
            .reduce((sum, h) => sum + (h.successCount || h.success || 0), 0);

        // Update both mobile and desktop
        const el1 = document.getElementById('totalSent');
        const el2 = document.getElementById('totalSentDesktop');
        if (el1) el1.textContent = sentToday;
        if (el2) el2.textContent = sentToday;

        const total = hist.reduce((sum, h) => sum + (h.successCount || h.success || 0) + (h.failCount || h.failed || 0), 0);
        const success = hist.reduce((sum, h) => sum + (h.successCount || h.success || 0), 0);
        const rate = total > 0 ? Math.round(success / total * 100) : 0;

        document.getElementById('statTotal').textContent = success;
        document.getElementById('statSuccess').textContent = rate + '%';
        document.getElementById('statGroups').textContent = grps.length;
        document.getElementById('statReplies').textContent = replies.length;
    } catch (e) {
        console.error('Error loading stats:', e);
    }
}

// ===== GROUPS =====
function showAddGroup() {
    document.getElementById('groupNameInput').value = '';
    document.getElementById('groupIdInput').value = '';
    showModal('addGroupModal');
}

async function saveGroup() {
    const name = document.getElementById('groupNameInput').value.trim();
    const id = document.getElementById('groupIdInput').value.trim();

    if (!name || !id) return toast('Please fill all fields', 'error');

    try {
        await apiFetch(getUserApi() + '/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, id })
        });

        closeModal('addGroupModal');
        toast('Group added!', 'success');
        loadGroups();
    } catch (e) {
        toast('Failed to add group', 'error');
    }
}

async function deleteGroup(id) {
    showConfirm('Delete this group?', async () => {
        try {
            await apiFetch(getUserApi() + '/groups/' + encodeURIComponent(id), { method: 'DELETE' });
            toast('Group deleted', 'success');
            loadGroups();
        } catch (e) {
            toast('Failed to delete group', 'error');
        }
    });
}

async function discoverGroups() {
    showModal('discoverModal');
    document.getElementById('discoveredList').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const res = await apiFetch(getUserApi() + '/whatsapp-groups');
        const data = await res.json();

        if (!data.length) {
            document.getElementById('discoveredList').innerHTML = '<div class="empty-state"><p class="text-muted">No groups found. Make sure WhatsApp is connected.</p></div>';
            return;
        }

        document.getElementById('discoveredList').innerHTML = data.map(g => `
            <div class="card-list-item" onclick="addDiscoveredGroup('${escapeAttr(g.id)}', '${escapeAttr(g.name)}')">
                <div class="card-icon-large" style="background:var(--bg-subtle); color:var(--primary)">👥</div>
                <div class="card-info">
                    <div class="card-title">${escapeHtml(g.name)}</div>
                    <div class="card-subtitle">${g.participants || 0} members</div>
                </div>
                <span class="text-success" style="font-weight:600; font-size:13px">+ Add</span>
            </div>
        `).join('');
    } catch (e) {
        document.getElementById('discoveredList').innerHTML = '<div class="empty-state"><p class="text-muted">Failed to load groups</p></div>';
    }
}

async function addDiscoveredGroup(id, name) {
    try {
        await apiFetch(getUserApi() + '/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, id })
        });
        toast('Group added!', 'success');
        loadGroups();
    } catch (e) {
        toast('Failed to add', 'error');
    }
}

// ===== CONTACTS =====
async function loadContacts() {
    try {
        const res = await apiFetch(getUserApi() + '/contacts');
        contacts = await res.json();
        renderContacts();
    } catch (e) {
        console.error('Error loading contacts:', e);
    }
}

function renderContacts() {
    const list = document.getElementById('contactsList');
    if (!contacts.length) {
        list.innerHTML = '<div class="empty-state"><p class="text-muted">Save contacts for quick access</p></div>';
        return;
    }

    list.innerHTML = contacts.map(c => `
        <div class="group-card-item" data-name="${escapeAttr(c.name)}" data-number="${escapeAttr(c.number)}">
            <div class="group-icon-large" style="background: var(--success-light); color: var(--success);">👤</div>
            <div class="group-info">
                <div class="group-name">${escapeHtml(c.name)}</div>
                <div class="group-meta">${escapeHtml(c.number)}</div>
            </div>
            <button class="btn btn-sm btn-danger btn-icon" onclick="deleteContact('${c.id}')">🗑️</button>
        </div>
    `).join('');
}

function filterContacts() {
    const q = document.getElementById('searchContacts').value.toLowerCase();
    document.querySelectorAll('#contactsList .group-card-item').forEach(item => {
        const name = (item.dataset.name || '').toLowerCase();
        const number = (item.dataset.number || '').toLowerCase();
        item.style.display = (name.includes(q) || number.includes(q)) ? '' : 'none';
    });
}

function showAddContact() {
    document.getElementById('contactName').value = '';
    document.getElementById('contactNumber').value = '';
    showModal('addContactModal');
}

async function saveContact() {
    const name = document.getElementById('contactName').value.trim();
    const number = document.getElementById('contactNumber').value.trim();

    if (!name || !number) return toast('Please fill all fields', 'error');

    try {
        await apiFetch(getUserApi() + '/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, number })
        });

        closeModal('addContactModal');
        toast('Contact added!', 'success');
        loadContacts();
    } catch (e) {
        toast('Failed to save', 'error');
    }
}

async function deleteContact(id) {
    showConfirm('Delete this contact?', async () => {
        try {
            await apiFetch(getUserApi() + '/contacts/' + id, { method: 'DELETE' });
            toast('Contact deleted', 'success');
            loadContacts();
        } catch (e) {
            toast('Failed to delete contact', 'error');
        }
    });
}

// ===== AUTO REPLY =====
async function loadAutoReplies() {
    try {
        const res = await apiFetch(getUserApi() + '/autoreplies');
        autoReplies = await res.json();
        renderAutoReplies();
    } catch (e) {
        console.error('Error loading auto replies:', e);
    }
}

function renderAutoReplies() {
    const list = document.getElementById('autoReplyList');
    if (!autoReplies.length) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🤖</div>
                <div class="empty-title">No auto replies</div>
                <p class="empty-text">Create automatic responses to keywords</p>
            </div>`;
        return;
    }

    list.innerHTML = autoReplies.map((r, i) => `
        <div class="card-list-item">
            <div class="card-info">
                <div class="card-title">
                    ${escapeHtml(r.keyword)}
                    <span class="card-badge ${r.enabled ? 'success' : 'danger'}">${r.enabled ? 'ON' : 'OFF'}</span>
                </div>
                <div class="card-subtitle">
                    <span class="card-badge info" style="font-size:10px">${r.matchType || 'contains'}</span>
                    ${r.image ? '<span class="card-badge warning" style="font-size:10px">📷 Image</span>' : ''}
                    <span style="margin-left:8px; opacity:0.8">${escapeHtml((r.response || '').substring(0, 50))}${r.response?.length > 50 ? '...' : ''}</span>
                </div>
            </div>
            <div class="toggle toggle-sm list-item-toggle ${r.enabled ? 'active' : ''}" onclick="toggleAutoReply('${r.id}')"></div>
            <button class="btn btn-sm btn-danger btn-icon" onclick="deleteAutoReply('${r.id}')">🗑️</button>
        </div>
    `).join('');
}

function showAddReply() {
    document.getElementById('replyKeyword').value = '';
    document.getElementById('replyResponse').value = '';
    document.getElementById('replyMatchType').value = 'contains';
    document.getElementById('replyImageInput').value = '';
    document.getElementById('replyImagePreview').classList.add('hidden');
    document.getElementById('replyUploadText').textContent = '📷 Tap to add image';
    replyImage = null;
    showModal('addReplyModal');
}

async function saveAutoReply() {
    const keyword = document.getElementById('replyKeyword').value.trim();
    const matchType = document.getElementById('replyMatchType').value;
    const response = document.getElementById('replyResponse').value.trim();

    if (!keyword) return toast('Please enter a keyword', 'error');
    if (!response && !replyImage) return toast('Please enter a response or add an image', 'error');

    try {
        let imageData = null;
        if (replyImage) {
            imageData = await toBase64(replyImage);
        }

        await apiFetch(getUserApi() + '/autoreplies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword, matchType, response, image: imageData, enabled: true })
        });

        closeModal('addReplyModal');
        toast('Auto reply added!', 'success');
        loadAutoReplies();
    } catch (e) {
        toast('Failed to save', 'error');
    }
}

async function toggleAutoReply(id) {
    try {
        const reply = autoReplies.find(r => r.id === id);
        if (!reply) return;

        await apiFetch(getUserApi() + '/autoreplies/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...reply, enabled: !reply.enabled })
        });
        loadAutoReplies();
    } catch (e) {
        toast('Failed to update', 'error');
    }
}

async function deleteAutoReply(id) {
    showConfirm('Delete this auto reply?', async () => {
        try {
            await apiFetch(getUserApi() + '/autoreplies/' + id, { method: 'DELETE' });
            toast('Auto reply deleted', 'success');
            loadAutoReplies();
        } catch (e) {
            toast('Failed to delete auto reply', 'error');
        }
    });
}

// ===== COMMANDS =====
async function loadCommands() {
    try {
        const res = await apiFetch(getUserApi() + '/commands');
        commands = await res.json();
        renderCommands();
    } catch (e) {
        console.error('Error loading commands:', e);
    }
}

function renderCommands() {
    const list = document.getElementById('commandsList');
    if (!commands.length) {
        list.innerHTML = '<div class="empty-state"><p class="text-muted">No commands. Create !help, !menu, etc.</p></div>';
        return;
    }

    list.innerHTML = commands.map(c => `
        <div class="card-list-item" data-command="${escapeAttr(c.command)}" data-response="${escapeAttr(c.response || '')}">
            <div class="card-icon-large" style="background:var(--bg-secondary); color:var(--primary)">⚡</div>
            <div class="card-info">
                <div class="card-title">${escapeHtml(c.command)}</div>
                <div class="card-subtitle">${escapeHtml((c.response || '').substring(0, 60))}...</div>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-sm btn-secondary btn-icon" onclick="editCommand('${c.id}')">✏️</button>
                <button class="btn btn-sm btn-danger btn-icon" onclick="deleteCommand('${c.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

function filterCommands() {
    const q = document.getElementById('searchCommands').value.toLowerCase();
    document.querySelectorAll('#commandsList .card-list-item').forEach(item => {
        const cmd = (item.dataset.command || '').toLowerCase();
        const response = (item.dataset.response || '').toLowerCase();
        item.style.display = (cmd.includes(q) || response.includes(q)) ? '' : 'none';
    });
}

let editingCommandId = null;

function editCommand(id) {
    const cmd = commands.find(c => c.id === id);
    if (!cmd) return;

    editingCommandId = id;
    document.getElementById('commandName').value = cmd.command;
    document.getElementById('commandResponse').value = cmd.response;
    showModal('addCommandModal');
}

async function saveCommand() {
    let command = document.getElementById('commandName').value.trim();
    const response = document.getElementById('commandResponse').value.trim();

    if (!command || !response) return toast('Please fill all fields', 'error');
    if (!command.startsWith('!')) command = '!' + command;

    try {
        if (editingCommandId) {
            // Update existing
            await apiFetch(getUserApi() + '/commands/' + editingCommandId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command, response })
            });
            editingCommandId = null;
            toast('Command updated!', 'success');
        } else {
            // Create new
            await apiFetch(getUserApi() + '/commands', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command, response })
            });
            toast('Command added!', 'success');
        }

        closeModal('addCommandModal');
        loadCommands();
    } catch (e) {
        toast('Failed to save', 'error');
    }
}

function showAddCommand() {
    editingCommandId = null;
    document.getElementById('commandName').value = '';
    document.getElementById('commandResponse').value = '';
    showModal('addCommandModal');
}

async function deleteCommand(id) {
    showConfirm('Delete this command?', async () => {
        try {
            await apiFetch(getUserApi() + '/commands/' + id, { method: 'DELETE' });
            toast('Command deleted', 'success');
            loadCommands();
        } catch (e) {
            toast('Failed to delete command', 'error');
        }
    });
}

// ===== SCHEDULES =====
async function loadSchedules() {
    try {
        const res = await apiFetch(getUserApi() + '/schedules');
        schedules = await res.json();
        renderSchedules();
    } catch (e) {
        console.error('Error loading schedules:', e);
    }
}

let currentScheduleFilter = 'all';

function renderSchedules() {
    const searchQuery = (document.getElementById('searchSchedules')?.value || '').toLowerCase();

    // Update stats
    const pendingCount = schedules.filter(s => s.status !== 'sent').length;
    const today = new Date().toDateString();
    const sentTodayCount = schedules.filter(s => s.status === 'sent' && new Date(s.sentAt).toDateString() === today).length;

    document.getElementById('schedPending')?.textContent && (document.getElementById('schedPending').textContent = pendingCount);
    document.getElementById('schedSentToday')?.textContent && (document.getElementById('schedSentToday').textContent = sentTodayCount);
    document.getElementById('schedTotal')?.textContent && (document.getElementById('schedTotal').textContent = schedules.length);

    // Filter by status
    let filtered = schedules;
    if (currentScheduleFilter === 'pending') {
        filtered = schedules.filter(s => s.status !== 'sent');
    } else if (currentScheduleFilter === 'sent') {
        filtered = schedules.filter(s => s.status === 'sent');
    }

    // Filter by search
    if (searchQuery) {
        filtered = filtered.filter(s =>
            (s.name || '').toLowerCase().includes(searchQuery) ||
            (s.message || '').toLowerCase().includes(searchQuery)
        );
    }

    const list = document.getElementById('scheduleList');
    if (!filtered.length) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📅</div>
                <div class="empty-title">${searchQuery ? 'No matching schedules' : 'No schedules yet'}</div>
                <p class="empty-text">${searchQuery ? 'Try a different search' : 'Create your first scheduled broadcast'}</p>
                ${!searchQuery ? '<button class="btn btn-primary mt-4" onclick="showAddSchedule()">+ Create Schedule</button>' : ''}
            </div>`;
        return;
    }

    list.innerHTML = filtered.map(s => {
        const isSent = s.status === 'sent';
        const groupCount = s.groups?.length || s.groupIds?.length || 0;
        return `
            <div class="schedule-card ${isSent ? 'sent' : ''}" data-status="${s.status || 'pending'}">
                <div class="schedule-card-icon">${isSent ? '✅' : '📅'}</div>
                <div class="schedule-card-content">
                    <div class="schedule-card-header">
                        <span class="schedule-card-name">${escapeHtml(s.name || 'Untitled Schedule')}</span>
                        <span class="schedule-card-badge ${isSent ? 'sent' : 'pending'}">${isSent ? 'Sent' : 'Pending'}</span>
                        ${s.image ? '<span class="schedule-card-badge pending">📷</span>' : ''}
                    </div>
                    <div class="schedule-card-message">${escapeHtml(s.message || 'Image only')}</div>
                    <div class="schedule-card-meta">
                        <span>🕐 ${formatDate(s.scheduledTime)}</span>
                        <span>👥 ${groupCount} groups</span>
                        ${s.repeat ? `<span>🔄 ${s.repeat}</span>` : ''}
                    </div>
                </div>
                <div class="schedule-card-actions">
                    <button class="btn btn-sm btn-secondary" onclick="duplicateSchedule('${s.id}')" title="Duplicate">📋</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteSchedule('${s.id}')" title="Delete">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function switchScheduleTab(tab) {
    // Update tabs
    document.getElementById('tabSchedules').classList.toggle('active', tab === 'schedules');
    document.getElementById('tabTemplates').classList.toggle('active', tab === 'templates');

    // Update panels
    document.getElementById('panelSchedules').classList.toggle('active', tab === 'schedules');
    document.getElementById('panelTemplates').classList.toggle('active', tab === 'templates');
}

function filterScheduleStatus(status) {
    currentScheduleFilter = status;

    // Update filter buttons
    document.querySelectorAll('.schedule-filter .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === status);
    });

    renderSchedules();
}

function filterSchedules() {
    renderSchedules();
}

// ===== CALENDAR VIEW =====
let currentScheduleView = 'list';
let currentCalendarMonth = new Date();

function switchScheduleView(view) {
    currentScheduleView = view;

    // Update buttons
    document.getElementById('viewListBtn')?.classList.toggle('active', view === 'list');
    document.getElementById('viewCalendarBtn')?.classList.toggle('active', view === 'calendar');

    // Toggle views
    const listEl = document.getElementById('scheduleList');
    const calendarEl = document.getElementById('scheduleCalendar');

    if (view === 'calendar') {
        listEl?.classList.add('hidden');
        calendarEl?.classList.remove('hidden');
        renderCalendar();
    } else {
        listEl?.classList.remove('hidden');
        calendarEl?.classList.add('hidden');
    }
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const titleEl = document.getElementById('calendarMonthTitle');
    if (!grid || !titleEl) return;

    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();

    // Update title
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    titleEl.textContent = `${monthNames[month]} ${year}`;

    // Get first day of month and total days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    // Today for comparison
    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
    const todayDate = today.getDate();

    // Group schedules by date
    const schedulesByDate = {};
    schedules.forEach(s => {
        const date = new Date(s.scheduledTime);
        if (date.getMonth() === month && date.getFullYear() === year) {
            const day = date.getDate();
            if (!schedulesByDate[day]) schedulesByDate[day] = [];
            schedulesByDate[day].push(s);
        }
    });

    let html = '';

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        html += `<div class="calendar-day other-month"><div class="calendar-day-number">${day}</div></div>`;
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = isCurrentMonth && day === todayDate;
        const daySchedules = schedulesByDate[day] || [];

        html += `<div class="calendar-day ${isToday ? 'today' : ''}" onclick="showDaySchedules(${year}, ${month}, ${day})">
            <div class="calendar-day-number">${day}</div>
            <div class="calendar-day-schedules">
                ${daySchedules.slice(0, 3).map(s =>
            `<div class="calendar-schedule-dot ${s.status === 'sent' ? 'sent' : ''}" title="${escapeAttr(s.name || s.message?.substring(0, 30) || 'Schedule')}"></div>`
        ).join('')}
                ${daySchedules.length > 3 ? `<div class="calendar-day-more">+${daySchedules.length - 3} more</div>` : ''}
            </div>
        </div>`;
    }

    // Next month days
    const totalCells = firstDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remaining; day++) {
        html += `<div class="calendar-day other-month"><div class="calendar-day-number">${day}</div></div>`;
    }

    grid.innerHTML = html;
}

function navigateCalendar(direction) {
    currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() + direction);
    renderCalendar();
}

function showDaySchedules(year, month, day) {
    const daySchedules = schedules.filter(s => {
        const date = new Date(s.scheduledTime);
        return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
    });

    if (daySchedules.length === 0) {
        // Open add schedule modal with date pre-filled
        showAddSchedule();
        const selectedDate = new Date(year, month, day, 12, 0, 0);
        const localISOTime = new Date(selectedDate.getTime() - selectedDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        document.getElementById('scheduleTime').value = localISOTime;
        toast(`Schedule for ${day}/${month + 1}/${year}`, 'info');
        return;
    }

    // Switch to list view and filter (simplified approach)
    toast(`${daySchedules.length} schedule(s) on ${day}/${month + 1}/${year}`, 'info');
    switchScheduleView('list');
}


function showAddSchedule() {
    document.getElementById('scheduleName').value = '';
    document.getElementById('scheduleMessage').value = '';
    document.getElementById('scheduleTime').value = '';
    document.getElementById('scheduleRepeat').value = '';
    document.getElementById('scheduleImageInput').value = '';
    document.getElementById('scheduleImagePreview').classList.add('hidden');
    document.getElementById('scheduleUploadText').textContent = '📷 Tap to add image';
    document.getElementById('scheduleSelectAll').checked = false;
    scheduleImage = null;

    // Populate group list in schedule modal
    const listEl = document.getElementById('scheduleGroupList');
    if (!groups.length) {
        listEl.innerHTML = '<p class="text-muted" style="padding: 8px; text-align: center;">No groups available. Add groups first.</p>';
    } else {
        listEl.innerHTML = groups.map(g => `
            <label class="checkbox-row" style="padding: 6px 8px; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" class="schedule-group-checkbox" value="${escapeAttr(g.groupId)}" onchange="updateScheduleSelectedCount()">
                <span style="font-size: 13px; color: var(--text);">${escapeHtml(g.name)}</span>
            </label>
        `).join('');
    }
    updateScheduleSelectedCount();
    showModal('addScheduleModal');
}

// Quick Schedule - pre-fill schedule modal from broadcast panel
function quickSchedule() {
    // Get current message from broadcast panel
    const message = document.getElementById('quickMessage')?.value || '';

    // Get selected groups from broadcast panel
    const selectedGroups = [...document.querySelectorAll('.group-select-item.selected')].map(el => el.dataset.id);

    // Check if we have content to schedule
    if (!message && !selectedImage) {
        toast('Please enter a message or add an image first', 'error');
        return;
    }

    if (selectedGroups.length === 0) {
        toast('Please select at least one group first', 'error');
        return;
    }

    // Open schedule modal
    showAddSchedule();

    // Pre-fill the message
    document.getElementById('scheduleMessage').value = message;

    // Pre-fill the image if available
    if (selectedImage) {
        scheduleImage = selectedImage;
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('scheduleImagePreview');
            preview.src = e.target.result;
            preview.classList.remove('hidden');
            document.getElementById('scheduleUploadText').textContent = '📷 Image selected';
        };
        reader.readAsDataURL(selectedImage);
    }

    // Pre-select the groups
    setTimeout(() => {
        document.querySelectorAll('.schedule-group-checkbox').forEach(cb => {
            cb.checked = selectedGroups.includes(cb.value);
        });
        updateScheduleSelectedCount();
    }, 100);

    // Set default time to 1 hour from now
    const now = new Date();
    now.setHours(now.getHours() + 1);
    now.setMinutes(0, 0, 0);
    const localISOTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('scheduleTime').value = localISOTime;

    toast('Schedule your broadcast!', 'info');
}

function toggleScheduleSelectAll() {
    const isChecked = document.getElementById('scheduleSelectAll').checked;
    document.querySelectorAll('.schedule-group-checkbox').forEach(cb => cb.checked = isChecked);
    updateScheduleSelectedCount();
}

function updateScheduleSelectedCount() {
    const count = document.querySelectorAll('.schedule-group-checkbox:checked').length;
    document.getElementById('scheduleSelectedCount').textContent = count + ' groups selected';
}

async function saveSchedule() {
    const name = document.getElementById('scheduleName').value.trim();
    const message = document.getElementById('scheduleMessage').value.trim();
    const scheduledTime = document.getElementById('scheduleTime').value;
    const repeat = document.getElementById('scheduleRepeat').value;

    // Get selected groups from schedule modal
    const selectedGroups = [...document.querySelectorAll('.schedule-group-checkbox:checked')].map(cb => cb.value);
    if (!selectedGroups.length) return toast('Please select at least one group', 'error');

    if (!message && !scheduleImage) return toast('Please enter a message or add an image', 'error');
    if (!scheduledTime) return toast('Please select date and time', 'error');

    try {
        let imageData = null;
        if (scheduleImage) {
            imageData = await toBase64(scheduleImage);
        }

        await apiFetch(getUserApi() + '/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name || null, message, scheduledTime, groups: selectedGroups, repeat: repeat || null, image: imageData })
        });

        closeModal('addScheduleModal');
        toast('Schedule created!', 'success');
        loadSchedules();
    } catch (e) {
        toast('Failed to save', 'error');
    }
}

async function deleteSchedule(id) {
    showConfirm('Delete this schedule?', async () => {
        try {
            await apiFetch(getUserApi() + '/schedules/' + id, { method: 'DELETE' });
            toast('Schedule deleted', 'success');
            loadSchedules();
        } catch (e) {
            toast('Failed to delete schedule', 'error');
        }
    });
}

// ===== TEMPLATES =====
async function loadTemplates() {
    try {
        const res = await apiFetch(getUserApi() + '/templates');
        templates = await res.json();
        renderTemplates();
    } catch (e) {
        console.error('Error loading templates:', e);
    }
}

function renderTemplates() {
    const list = document.getElementById('templatesList');
    if (!templates.length) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <div class="empty-title">No templates yet</div>
                <p class="empty-text">Save message templates for quick reuse</p>
                <button class="btn btn-primary mt-4" onclick="showAddTemplate()">+ Create Template</button>
            </div>`;
        return;
    }

    const searchQuery = (document.getElementById('searchTemplates')?.value || '').toLowerCase();
    let filtered = templates;
    if (searchQuery) {
        filtered = templates.filter(t =>
            (t.name || '').toLowerCase().includes(searchQuery) ||
            (t.message || '').toLowerCase().includes(searchQuery)
        );
    }

    if (!filtered.length) {
        list.innerHTML = '<div class="empty-state"><p class="text-muted">No matching templates</p></div>';
        return;
    }

    list.innerHTML = filtered.map((t, i) => `
        <div class="template-card" onclick="useTemplate(${templates.indexOf(t)})">
            <div class="template-card-header">
                <span class="template-card-name">${escapeHtml(t.name)}</span>
                <div class="template-card-actions">
                    <button class="btn btn-sm btn-primary btn-icon" onclick="event.stopPropagation(); scheduleFromTemplate(${templates.indexOf(t)})" title="Schedule">📅</button>
                    <button class="btn btn-sm btn-secondary btn-icon" onclick="event.stopPropagation(); editTemplate('${t.id}')" title="Edit">✏️</button>
                    <button class="btn btn-sm btn-danger btn-icon" onclick="event.stopPropagation(); deleteTemplate('${t.id}')" title="Delete">🗑️</button>
                </div>
            </div>
            <div class="template-card-message">${escapeHtml(t.message || '')}</div>
        </div>
    `).join('');
}

function filterTemplates() {
    const q = document.getElementById('searchTemplates').value.toLowerCase();
    document.querySelectorAll('#templatesList .card-list-item').forEach(item => {
        const name = (item.dataset.name || '').toLowerCase();
        const message = (item.dataset.message || '').toLowerCase();
        item.style.display = (name.includes(q) || message.includes(q)) ? '' : 'none';
    });
}

let editingTemplateId = null;

function editTemplate(id) {
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;

    editingTemplateId = id;
    document.getElementById('templateName').value = tpl.name;
    document.getElementById('templateMessage').value = tpl.message;
    showModal('addTemplateModal');
}

function useTemplate(index) {
    document.getElementById('quickMessage').value = templates[index].message;
    switchTab('broadcast');
    toast('Template loaded!', 'success');
}

function showTemplateSelect() {
    loadTemplates().then(() => {
        const list = document.getElementById('templateSelectList');
        if (!templates.length) {
            list.innerHTML = '<div class="empty-state"><p class="text-muted">No templates saved yet</p></div>';
        } else {
            list.innerHTML = templates.map((t, i) => `
                <div class="card-list-item" onclick="useTemplate(${i}); closeModal('templateSelectModal')">
                    <div class="card-icon-large" style="background:var(--bg-subtle); color:var(--primary)">📝</div>
                    <div class="card-info">
                        <div class="card-title">${escapeHtml(t.name)}</div>
                        <div class="card-subtitle">${escapeHtml((t.message || '').substring(0, 60))}...</div>
                    </div>
                </div>
            `).join('');
        }
        showModal('templateSelectModal');
    });
}

function showAddTemplate() {
    editingTemplateId = null;
    document.getElementById('templateName').value = '';
    document.getElementById('templateMessage').value = '';
    showModal('addTemplateModal');
}

async function saveTemplate() {
    const name = document.getElementById('templateName').value.trim();
    const message = document.getElementById('templateMessage').value.trim();

    if (!name || !message) return toast('Please fill all fields', 'error');

    try {
        if (editingTemplateId) {
            // Update existing
            await apiFetch(getUserApi() + '/templates/' + editingTemplateId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, message })
            });
            editingTemplateId = null;
            toast('Template updated!', 'success');
        } else {
            // Create new
            await apiFetch(getUserApi() + '/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, message })
            });
            toast('Template saved!', 'success');
        }

        closeModal('addTemplateModal');
        loadTemplates();
    } catch (e) {
        toast('Failed to save', 'error');
    }
}

async function deleteTemplate(id) {
    showConfirm('Delete this template?', async () => {
        try {
            await apiFetch(getUserApi() + '/templates/' + id, { method: 'DELETE' });
            toast('Template deleted', 'success');
            loadTemplates();
        } catch (e) {
            toast('Failed to delete template', 'error');
        }
    });
}

// ===== HISTORY =====
async function loadHistory() {
    try {
        const res = await apiFetch(getUserApi() + '/history');
        history = await res.json();
        renderHistory();
        loadStats();
    } catch (e) {
        console.error('Error loading history:', e);
    }
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!history.length) {
        list.innerHTML = '<div class="empty-state"><p class="text-muted">No broadcast history yet</p></div>';
        return;
    }

    // Pagination
    const totalItems = history.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const page = Math.min(currentPage.history, totalPages);
    currentPage.history = page;

    const startIdx = totalItems - (page * ITEMS_PER_PAGE);
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const pageItems = history.slice(Math.max(0, startIdx), endIdx).reverse();

    let html = pageItems.map(h => {
        const success = h.successCount || h.success || 0;
        const failed = h.failCount || h.failed || 0;
        return `
            <div class="activity-item">
                <div class="activity-icon">${failed === 0 ? '✅' : '⚠️'}</div>
                <div class="activity-content">
                    <div class="activity-title">${escapeHtml((h.message || 'Broadcast').substring(0, 50))}${h.message?.length > 50 ? '...' : ''}</div>
                    <div class="activity-meta">
                        <span>${formatDate(h.timestamp)}</span>
                        <span class="activity-stat success">✅ ${success}</span>
                        <span class="activity-stat failed">❌ ${failed}</span>
                    </div>
                </div>
                ${failed > 0 ? `<button class="btn btn-sm btn-secondary" onclick="retryBroadcast('${h.id}')">🔄</button>` : ''}
            </div>
        `;
    }).join('');

    // Pagination controls
    if (totalPages > 1) {
        html += `
            <div class="pagination">
                <button class="btn btn-sm btn-secondary" onclick="goToHistoryPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
                <span class="pagination-info">Page ${page} of ${totalPages}</span>
                <button class="btn btn-sm btn-secondary" onclick="goToHistoryPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next →</button>
            </div>
        `;
    }

    list.innerHTML = html;
}

function goToHistoryPage(page) {
    if (page < 1) return;
    currentPage.history = page;
    renderHistory();
}

async function clearHistory() {
    showConfirm('Clear all broadcast history? This cannot be undone.', async () => {
        try {
            await apiFetch(getUserApi() + '/history', { method: 'DELETE' });
            toast('History cleared', 'success');
            loadHistory();
        } catch (e) {
            toast('Failed to clear history', 'error');
        }
    });
}

function exportCSV() {
    if (!history.length) return toast('No history to export', 'error');

    const headers = ['Date', 'Message', 'Success', 'Failed'];
    const rows = history.map(h => [
        formatDate(h.timestamp),
        '"' + (h.message || '').replace(/"/g, '""') + '"',
        h.successCount || h.success || 0,
        h.failCount || h.failed || 0
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `broadcast-history-${Date.now()}.csv`;
    a.click();

    toast('CSV downloaded', 'success');
}

// ===== SETTINGS =====
async function loadSettings() {
    try {
        const res = await apiFetch(getUserApi() + '/settings');
        settings = await res.json();

        // Settings use nested structure: settings.queue.enabled, settings.auth.enabled
        if (settings.queue?.enabled) document.getElementById('queueToggle')?.classList.add('active');
        if (settings.typing?.enabled) document.getElementById('typingToggle')?.classList.add('active');
        if (settings.auth?.enabled) document.getElementById('authToggle')?.classList.add('active');
        if (settings.darkMode || localStorage.getItem('darkMode') === 'true') {
            document.getElementById('darkToggle')?.classList.add('active');
            document.body.classList.add('dark-mode');
        }
    } catch (e) {
        console.error('Error loading settings:', e);
    }
}

async function toggleSetting(key) {
    const toggle = document.getElementById(key + 'Toggle');
    const isActive = toggle.classList.toggle('active');

    // Map key to nested structure
    const payload = {};
    if (key === 'queue') payload.queue = { enabled: isActive };
    else if (key === 'typing') payload.typing = { enabled: isActive };
    else if (key === 'auth') payload.auth = { enabled: isActive };

    try {
        await apiFetch(getUserApi() + '/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        toast('Setting updated', 'success');
    } catch (e) {
        toggle.classList.toggle('active');
        toast('Failed to save', 'error');
    }
}

function toggleDarkMode() {
    const toggle = document.getElementById('darkToggle');
    toggle.classList.toggle('active');
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

// ===== BLACKLIST =====
async function addBlacklist() {
    const number = document.getElementById('blacklistInput').value.trim();
    if (!number) return toast('Please enter a number', 'error');

    try {
        await apiFetch(getUserApi() + '/blacklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number })
        });

        document.getElementById('blacklistInput').value = '';
        toast('Number blocked', 'success');
    } catch (e) {
        toast('Failed to block', 'error');
    }
}

async function showBlacklist() {
    showModal('blacklistModal');
    document.getElementById('blacklistContent').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const res = await apiFetch(getUserApi() + '/blacklist');
        blacklist = await res.json();

        if (!blacklist.length) {
            document.getElementById('blacklistContent').innerHTML = '<div class="empty-state"><p class="text-muted">No blocked numbers</p></div>';
            return;
        }

        document.getElementById('blacklistContent').innerHTML = blacklist.map(b => `
            <div class="card-list-item">
                <div class="card-icon-large" style="background:var(--bg-subtle); color:var(--danger)">🚫</div>
                <div class="card-info">
                    <div class="card-title">${escapeHtml(b.number || b)}</div>
                </div>
                <button class="btn btn-sm btn-danger btn-icon" onclick="removeBlacklist('${b.id}')">🗑️</button>
            </div>
        `).join('');
    } catch (e) {
        document.getElementById('blacklistContent').innerHTML = '<div class="empty-state"><p class="text-muted">Failed to load blacklist</p></div>';
    }
}

async function removeBlacklist(id) {
    try {
        await apiFetch(getUserApi() + '/blacklist/' + id, { method: 'DELETE' });
        toast('Unblocked', 'success');
        showBlacklist();
    } catch (e) {
        toast('Failed to remove', 'error');
    }
}

// ===== BACKUP =====
async function downloadBackup() {
    try {
        const res = await apiFetch(getUserApi() + '/backup');
        const data = await res.json();

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wa-backup-${Date.now()}.json`;
        a.click();

        toast('Backup downloaded', 'success');
    } catch (e) {
        toast('Failed to create backup', 'error');
    }
}

async function restoreBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm('This will replace all current data. Continue?')) {
        event.target.value = '';
        return;
    }

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        await apiFetch(getUserApi() + '/backup/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        toast('Backup restored!', 'success');
        loadData();
    } catch (e) {
        toast('Failed to restore backup', 'error');
    }

    event.target.value = '';
}

// ===== LOGS =====
async function viewLogs() {
    showModal('logsModal');
    document.getElementById('logsContent').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const res = await apiFetch(getUserApi() + '/messagelogs');
        const logs = await res.json();

        if (!logs.length) {
            document.getElementById('logsContent').innerHTML = '<div class="empty-state"><p class="text-muted">No message logs</p></div>';
            return;
        }

        document.getElementById('logsContent').innerHTML = logs.slice(-50).reverse().map(l => `
            <div class="card-list-item">
                <div class="card-info">
                    <div class="card-title">${escapeHtml(l.from || 'Unknown')}</div>
                    <div class="card-subtitle">${escapeHtml((l.body || '').substring(0, 60))}...</div>
                    <div class="card-subtitle" style="font-size:11px; margin-top:2px">${formatDate(l.timestamp)}</div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        document.getElementById('logsContent').innerHTML = '<div class="empty-state"><p class="text-muted">Failed to load logs</p></div>';
    }
}

// ===== MODAL =====
function showModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.add('hidden');
    }
});

// ===== TOAST =====
function toast(message, type = 'info', title = '') {
    const container = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = 'toast ' + type;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const titles = {
        success: 'Success',
        error: 'Error',
        warning: 'Warning',
        info: 'Info'
    };

    const icon = icons[type] || icons.info;
    const toastTitle = title || titles[type] || titles.info;

    t.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(toastTitle)}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(t);
    setTimeout(() => t.remove(), 5000);
}

// ===== UTILITIES =====
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function formatDate(date) {
    if (!date) return '';
    return new Date(date).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// ===== QUICK ACTIONS =====
let quickActions = [];

async function loadQuickActions() {
    try {
        const res = await apiFetch(getUserApi() + '/quickactions');
        quickActions = await res.json();
        renderQuickActions();
    } catch (e) {
        console.error('Error loading quick actions:', e);
    }
}

function renderQuickActions() {
    const container = document.getElementById('quickActionsGrid');
    if (!container) return;

    if (!quickActions.length) {
        container.innerHTML = '<p class="text-muted text-center">No quick actions yet</p>';
        return;
    }

    container.innerHTML = quickActions.map(q => `
        <div class="quick-card ${q.color || ''}">
            <button class="quick-card-delete" onclick="event.stopPropagation(); deleteQuickAction('${q.id}')" title="Delete">×</button>
            <div onclick="executeQuickAction('${q.id}')">
                <div class="quick-card-icon">${q.icon || '⚡'}</div>
                <div class="quick-card-title">${escapeHtml(q.name)}</div>
            </div>
        </div>
    `).join('');
}

async function deleteQuickAction(id) {
    if (!confirm('Delete this quick action?')) return;

    try {
        await apiFetch(getUserApi() + '/quickactions/' + id, { method: 'DELETE' });
        toast('Deleted', 'success');
        loadQuickActions();
    } catch (e) {
        toast('Failed to delete', 'error');
    }
}

async function executeQuickAction(id) {
    const action = quickActions.find(q => q.id === id);
    if (!action) return;

    toast('Executing ' + action.name + '...', 'info');

    try {
        const res = await apiFetch(getUserApi() + '/quickactions/' + id + '/execute', { method: 'POST' });
        const data = await res.json();

        if (data.success !== undefined) {
            toast(`Done! ✅ ${data.success} sent`, 'success');
        } else {
            toast('Action executed!', 'success');
        }
    } catch (e) {
        toast('Failed to execute', 'error');
    }
}

function showAddQuickAction() {
    showModal('addQuickActionModal');
}

async function saveQuickAction() {
    const name = document.getElementById('quickActionName')?.value.trim();
    const message = document.getElementById('quickActionMessage')?.value.trim();
    const icon = document.getElementById('quickActionIcon')?.value || '⚡';

    if (!name || !message) return toast('Please fill all fields', 'error');

    const selectedGroups = [...document.querySelectorAll('#groupSelectList input:checked')].map(cb => cb.value);

    try {
        await apiFetch(getUserApi() + '/quickactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, message, icon, groups: selectedGroups })
        });

        closeModal('addQuickActionModal');
        toast('Quick action saved!', 'success');
        loadQuickActions();
    } catch (e) {
        toast('Failed to save', 'error');
    }
}

// ===== MEDIA LIBRARY =====
let mediaFiles = [];

async function loadMedia() {
    try {
        const res = await apiFetch(getUserApi() + '/media');
        mediaFiles = await res.json();
        renderMedia();
    } catch (e) {
        console.error('Error loading media:', e);
    }
}

function renderMedia() {
    const container = document.getElementById('mediaGrid');
    if (!container) return;

    if (!mediaFiles.length) {
        container.innerHTML = '<p class="text-muted text-center">No images uploaded</p>';
        return;
    }

    container.innerHTML = mediaFiles.map(m => `
        <div class="media-item">
            <img src="/uploads/${m}" alt="${m}" onclick="selectMedia('${m}')">
            <button class="media-item-delete" onclick="deleteMedia('${m}')">×</button>
        </div>
    `).join('');
}

function selectMedia(filename) {
    document.getElementById('quickMessage').value += `\n[Image: ${filename}]`;
    toast('Image added to message', 'success');
}

async function deleteMedia(filename) {
    if (!confirm('Delete this image?')) return;

    try {
        await apiFetch(getUserApi() + '/media/' + filename, { method: 'DELETE' });
        toast('Deleted', 'success');
        loadMedia();
    } catch (e) {
        toast('Failed to delete', 'error');
    }
}

// ===== GROUP CATEGORIES =====
let categories = [];
let selectedCategory = 'all';

async function loadCategories() {
    try {
        const res = await apiFetch(getUserApi() + '/categories');
        categories = await res.json();
        renderCategoryChips();
    } catch (e) {
        console.error('Error loading categories:', e);
    }
}

function renderCategoryChips() {
    const container = document.getElementById('categoryChips');
    if (!container) return;

    const chips = ['all', ...categories];
    container.innerHTML = chips.map(c => `
        <button class="category-chip ${selectedCategory === c ? 'active' : ''}" onclick="filterByCategory('${c}')">
            ${c === 'all' ? '📋 All' : c}
        </button>
    `).join('');
}

function filterByCategory(category) {
    selectedCategory = category;
    renderCategoryChips();

    document.querySelectorAll('#groupsList .list-item').forEach(item => {
        const cat = item.dataset.category || '';
        item.style.display = (category === 'all' || cat === category) ? '' : 'none';
    });
}

async function setGroupCategory(groupId, category) {
    try {
        await apiFetch(getUserApi() + '/groups/' + encodeURIComponent(groupId) + '/category', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category })
        });
        toast('Category updated', 'success');
        loadGroups();
    } catch (e) {
        toast('Failed to update', 'error');
    }
}

// ===== IMPORT/EXPORT GROUPS =====
async function exportGroups() {
    try {
        const res = await apiFetch(getUserApi() + '/groups/export');
        const data = await res.json();

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `groups-export-${Date.now()}.json`;
        a.click();

        toast('Groups exported', 'success');
    } catch (e) {
        toast('Failed to export', 'error');
    }
}

async function importGroups(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        await apiFetch(getUserApi() + '/groups/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        toast('Groups imported!', 'success');
        loadGroups();
    } catch (e) {
        toast('Failed to import', 'error');
    }

    event.target.value = '';
}

// ===== SYNC GROUPS =====
async function syncGroups() {
    const btn = document.getElementById('syncBtn');
    const emptyBtn = document.getElementById('emptySyncBtn');

    // Disable buttons
    [btn, emptyBtn].forEach(b => {
        if (b) {
            b.disabled = true;
            b.innerHTML = '⏳ Syncing...<small style="display:block; font-weight:normal; font-size:11px;">Please wait 10-30 seconds</small>';
        }
    });

    toast('Syncing groups from WhatsApp... This may take 10-30 seconds', 'info');

    let attempts = 0;
    const maxAttempts = 6;

    const trySync = async () => {
        attempts++;
        try {
            const res = await apiFetch(getUserApi() + '/groups/sync', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await res.json();

            if (data.total > 0) {
                toast(`✅ Synced! Found ${data.total} groups (${data.added || 0} new)`, 'success');
                loadGroups();
                resetSyncButtons();
                return;
            }

            // No groups found yet
            if (attempts < maxAttempts) {
                toast(`Waiting for chats to load... (${attempts}/${maxAttempts})`, 'info');
                setTimeout(trySync, 5000);
            } else {
                toast('No groups found. Try "Discover Groups" or add manually.', 'warning');
                resetSyncButtons();
            }
        } catch (e) {
            if (attempts < maxAttempts) {
                setTimeout(trySync, 5000);
            } else {
                toast('Sync failed. Please try again.', 'error');
                resetSyncButtons();
            }
        }
    };

    function resetSyncButtons() {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '🔄 Sync';
        }
        if (emptyBtn) {
            emptyBtn.disabled = false;
            emptyBtn.innerHTML = '🔄 Sync All Groups<small style="display:block; font-weight:normal; opacity:0.8; font-size:11px;">Auto-import from WhatsApp (recommended)</small>';
        }
    }

    trySync();
}

// ===== PIN GROUPS =====
async function togglePinGroup(groupId) {
    try {
        const res = await apiFetch(getUserApi() + '/groups/' + encodeURIComponent(groupId) + '/pin', {
            method: 'PUT'
        });
        const data = await res.json();

        toast(data.pinned ? 'Group pinned' : 'Group unpinned', 'success');
        loadGroups();
    } catch (e) {
        toast('Failed to update', 'error');
    }
}

// ===== DUPLICATE SCHEDULE =====
async function duplicateSchedule(id) {
    try {
        await apiFetch(getUserApi() + '/schedules/' + id + '/duplicate', { method: 'POST' });
        toast('Schedule duplicated!', 'success');
        loadSchedules();
    } catch (e) {
        toast('Failed to duplicate', 'error');
    }
}

// ===== RETRY FAILED BROADCAST =====
async function retryBroadcast(historyId) {
    toast('Retrying failed messages...', 'info');

    try {
        const res = await apiFetch(getUserApi() + '/history/' + historyId + '/retry', { method: 'POST' });
        const data = await res.json();

        toast(`Retry complete! ✅ ${data.success || 0} sent`, 'success');
        loadHistory();
    } catch (e) {
        toast('Failed to retry', 'error');
    }
}

// ===== ANALYTICS =====
async function loadAnalytics() {
    try {
        const res = await apiFetch(getUserApi() + '/analytics');
        const data = await res.json();
        renderAnalyticsChart(data);
    } catch (e) {
        console.error('Error loading analytics:', e);
    }
}

function renderAnalyticsChart(data) {
    const container = document.getElementById('analyticsChart');
    if (!container || !data.daily) return;

    const maxVal = Math.max(...data.daily.map(d => d.count), 1);

    container.innerHTML = `
        <div class="chart-bar">
            ${data.daily.map(d => `
                <div class="chart-col" style="height: ${(d.count / maxVal) * 100}%" title="${d.date}: ${d.count}"></div>
            `).join('')}
        </div>
        <div class="chart-labels">
            <span>${data.daily[0]?.date || ''}</span>
            <span>${data.daily[data.daily.length - 1]?.date || ''}</span>
        </div>
    `;
}

// ===== FORWARD MESSAGE =====
async function forwardMessage(messageId) {
    const selectedGroups = [...document.querySelectorAll('#groupSelectList input:checked')].map(cb => cb.value);

    if (!selectedGroups.length) return toast('Please select groups first', 'error');

    try {
        const res = await apiFetch(getUserApi() + '/forward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId, groups: selectedGroups })
        });

        const data = await res.json();
        toast(`Forwarded to ${data.success || 0} groups`, 'success');
    } catch (e) {
        toast('Failed to forward', 'error');
    }
}

// ===== PREVIEW MESSAGE =====
async function previewMessage() {
    const message = document.getElementById('quickMessage').value.trim();
    if (!message) return toast('Please enter a message first', 'error');

    try {
        const res = await apiFetch(getUserApi() + '/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        const data = await res.json();

        const preview = document.getElementById('messagePreview');
        if (preview) {
            preview.innerHTML = `<div class="preview-box">${escapeHtml(data.preview || message)}</div>`;
            preview.classList.remove('hidden');
        }
    } catch (e) {
        toast('Failed to preview', 'error');
    }
}

// ===== DRAFT SYSTEM =====
async function saveDraft() {
    const message = document.getElementById('quickMessage').value.trim();

    try {
        await apiFetch(getUserApi() + '/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        toast('Draft saved', 'success');
    } catch (e) {
        toast('Failed to save draft', 'error');
    }
}

async function loadDraft() {
    try {
        const res = await apiFetch(getUserApi() + '/draft');
        const data = await res.json();

        if (data.message) {
            document.getElementById('quickMessage').value = data.message;
            toast('Draft loaded', 'success');
        }
    } catch (e) {
        console.error('Error loading draft:', e);
    }
}

// ===== GROUP MEMBERS =====
async function showGroupMembers(groupId) {
    showModal('membersModal');
    document.getElementById('membersList').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const res = await apiFetch(getUserApi() + '/groups/' + encodeURIComponent(groupId) + '/members');
        const data = await res.json();

        if (!data.length) {
            document.getElementById('membersList').innerHTML = '<div class="empty-state"><p class="text-muted">No members found</p></div>';
            return;
        }

        document.getElementById('membersList').innerHTML = data.map(m => `
            <div class="card-list-item">
                <div class="card-icon-large" style="background:var(--bg-subtle); color:var(--text-secondary)">👤</div>
                <div class="card-info">
                    <div class="card-title">${escapeHtml(m.name || m.id)}</div>
                    <div class="card-subtitle">${m.isAdmin ? '👑 Admin' : 'Member'}</div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        document.getElementById('membersList').innerHTML = '<div class="empty-state"><p class="text-muted">Failed to load members</p></div>';
    }
}

// ===== BULK OPERATIONS =====
let bulkMode = false;
let bulkSelected = [];

function toggleBulkMode() {
    bulkMode = !bulkMode;
    bulkSelected = [];

    document.querySelectorAll('.list').forEach(list => {
        list.classList.toggle('bulk-mode', bulkMode);
    });

    document.getElementById('bulkActions')?.classList.toggle('hidden', !bulkMode);
    toast(bulkMode ? 'Bulk mode enabled' : 'Bulk mode disabled', 'info');
}

async function bulkDeleteGroups() {
    if (!bulkSelected.length) return toast('No items selected', 'error');
    if (!confirm(`Delete ${bulkSelected.length} groups?`)) return;

    try {
        await apiFetch(getUserApi() + '/groups/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: bulkSelected })
        });

        toast(`Deleted ${bulkSelected.length} groups`, 'success');
        toggleBulkMode();
        loadGroups();
    } catch (e) {
        toast('Failed to delete', 'error');
    }
}

// ===== AUTO REPLY STATS =====
async function loadAutoReplyStats() {
    try {
        const res = await apiFetch(getUserApi() + '/autoreplies/stats');
        const data = await res.json();

        const container = document.getElementById('autoReplyStats');
        if (container) {
            container.innerHTML = `
                <div class="stat-mini">
                    <span class="stat-mini-value">${data.totalTriggers || 0}</span>
                    <span class="stat-mini-label">Total Triggers</span>
                </div>
                <div class="stat-mini">
                    <span class="stat-mini-value">${data.todayTriggers || 0}</span>
                    <span class="stat-mini-label">Today</span>
                </div>
            `;
        }
    } catch (e) {
        console.error('Error loading auto reply stats:', e);
    }
}

// ===== CLEAR MESSAGE LOGS =====
async function clearMessageLogs() {
    if (!confirm('Clear all message logs?')) return;

    try {
        await apiFetch(getUserApi() + '/messagelogs', { method: 'DELETE' });
        toast('Logs cleared', 'success');
        document.getElementById('logsContent').innerHTML = '<div class="empty-state"><p class="text-muted">No message logs</p></div>';
    } catch (e) {
        toast('Failed to clear logs', 'error');
    }
}

// ===== BROADCAST BY CATEGORY =====
async function broadcastByCategory(category) {
    const message = document.getElementById('quickMessage').value.trim();

    if (!message && !selectedImage) return toast('Please enter a message or select an image', 'error');
    if (!category) return toast('Please select a category', 'error');

    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Sending...';

    try {
        let imageData = null;
        if (selectedImage) {
            imageData = await toBase64(selectedImage);
        }

        const res = await apiFetch(getUserApi() + '/broadcast/category', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, category, image: imageData })
        });

        const data = await res.json();
        showResult(data);
        document.getElementById('quickMessage').value = '';
        removeImage();
        loadStats();
    } catch (e) {
        toast('Failed to send broadcast', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '📤 Send Broadcast';
    }
}

// ===== GROUPS STATS =====
async function loadGroupsStats() {
    try {
        const res = await apiFetch(getUserApi() + '/groups/stats');
        const data = await res.json();

        const container = document.getElementById('groupsStatsContainer');
        if (container) {
            container.innerHTML = `
                <div class="stat-mini">
                    <span class="stat-mini-value">${data.total || 0}</span>
                    <span class="stat-mini-label">Total Groups</span>
                </div>
                <div class="stat-mini">
                    <span class="stat-mini-value">${data.pinned || 0}</span>
                    <span class="stat-mini-label">Pinned</span>
                </div>
                <div class="stat-mini">
                    <span class="stat-mini-value">${data.categories || 0}</span>
                    <span class="stat-mini-label">Categories</span>
                </div>
            `;
        }
    } catch (e) {
        console.error('Error loading groups stats:', e);
    }
}

// ===== SCHEDULES PREVIEW =====
async function loadSchedulesPreview() {
    try {
        const res = await apiFetch(getUserApi() + '/schedules/preview');
        const data = await res.json();

        const container = document.getElementById('upcomingSchedules');
        if (!container) return;

        if (!data.upcoming || !data.upcoming.length) {
            container.innerHTML = '<p class="text-muted">No upcoming schedules</p>';
            return;
        }

        container.innerHTML = data.upcoming.slice(0, 5).map(s => `
            <div class="list-item-compact">
                <span class="text-muted">${formatDate(s.scheduledTime)}</span>
                <span>${escapeHtml((s.message || 'Image').substring(0, 30))}...</span>
            </div>
        `).join('');
    } catch (e) {
        console.error('Error loading schedules preview:', e);
    }
}

// ===== BULK DELETE TEMPLATES =====
async function bulkDeleteTemplates(ids) {
    if (!confirm(`Delete ${ids.length} templates?`)) return;

    try {
        await apiFetch(getUserApi() + '/templates/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        toast('Templates deleted', 'success');
        loadTemplates();
    } catch (e) {
        toast('Failed to delete', 'error');
    }
}

// ===== BULK DELETE SCHEDULES =====
async function bulkDeleteSchedules(ids) {
    if (!confirm(`Delete ${ids.length} schedules?`)) return;

    try {
        await apiFetch(getUserApi() + '/schedules/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        toast('Schedules deleted', 'success');
        loadSchedules();
    } catch (e) {
        toast('Failed to delete', 'error');
    }
}

// ===== DASHBOARD STATS =====
async function loadDashboardStats() {
    // Update Date
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const today = new Date().toLocaleDateString('id-ID', dateOptions);
    const dateEl = document.getElementById('currentDate');
    if (dateEl) dateEl.textContent = today;

    // Ensure data is loaded if arrays are empty (might happen on direct navigation)
    if (groups.length === 0 && history.length === 0) {
        await Promise.all([loadGroups(), loadStats(), loadSchedules()]);
    }

    // Update Stats Cards
    const elGroups = document.getElementById('dashTotalGroups');
    if (elGroups) elGroups.textContent = groups.length;

    // Calculate sent today
    const todayStr = new Date().toDateString();
    const sentToday = history.filter(h => new Date(h.timestamp).toDateString() === todayStr)
        .reduce((sum, h) => sum + (h.successCount || h.success || 0), 0);

    const elSent = document.getElementById('dashTotalSent');
    if (elSent) elSent.textContent = sentToday;

    // Scheduled (pending)
    const pending = schedules.filter(s => s.status !== 'sent').length;
    const elSched = document.getElementById('dashScheduled');
    if (elSched) elSched.textContent = pending;

    const elReplies = document.getElementById('dashAutoReplies');
    if (elReplies) elReplies.textContent = autoReplies.length;

    // Recent Activity (History)
    const list = document.getElementById('dashboardHistoryList');
    if (list) {
        if (!history.length) {
            list.innerHTML = '<div class="empty-state"><p class="text-muted">Belum ada aktivitas</p></div>';
        } else {
            const recent = history.slice(-5).reverse();
            list.innerHTML = recent.map(h => {
                const success = h.successCount || h.success || 0;
                const failed = h.failCount || h.failed || 0;
                return `
                <div class="activity-item">
                    <div class="activity-icon">${failed > 0 ? '⚠️' : '✅'}</div>
                    <div class="activity-content">
                        <div class="activity-title">${escapeHtml((h.message || 'Broadcast').substring(0, 40))}${h.message?.length > 40 ? '...' : ''}</div>
                        <div class="activity-meta">
                            <span>${formatDate(h.timestamp)}</span>
                            <span class="activity-stat success">✅ ${success}</span>
                            <span class="activity-stat failed">❌ ${failed}</span>
                        </div>
                    </div>
                </div>
            `;
            }).join('');
        }
    }
}

// ===== SPINTAX TUTORIAL =====
function toggleSpintaxTutorial() {
    const content = document.getElementById('spintaxContent');
    const icon = document.getElementById('spintaxToggleIcon');

    if (content && icon) {
        content.classList.toggle('hidden');
        icon.style.transform = content.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
    }
}

// ===== ANTI-BAN SETTINGS TOGGLE =====
function toggleAntiBanSettings() {
    const settings = document.getElementById('antiBanSettings');
    if (settings) {
        settings.classList.toggle('hidden');
    }
}

function toggleSafeMode() {
    const toggle = document.getElementById('safeModeToggle');
    const customSettings = document.getElementById('customAntiBanSettings');
    const indicator = document.getElementById('antiBanIndicator');

    if (toggle) {
        toggle.classList.toggle('active');
        const isActive = toggle.classList.contains('active');

        if (customSettings) {
            customSettings.classList.toggle('hidden', isActive);
        }

        if (indicator) {
            indicator.textContent = isActive ? 'Safe Mode ON' : 'Custom Settings';
            indicator.className = isActive ? 'badge badge-active' : 'badge badge-warning';
        }
    }
}

function toggleSleepMode() {
    const toggle = document.getElementById('sleepModeToggle');
    const settings = document.getElementById('sleepSettings');

    if (toggle) {
        toggle.classList.toggle('active');
        const isActive = toggle.classList.contains('active');

        if (settings) {
            settings.classList.toggle('hidden', !isActive);
        }
    }
}

// ===== CRM AUTOMATION =====
let crmContacts = [];
let crmSequences = [];
let crmCurrentStage = 'all';

async function loadCrmData() {
    await loadCrmStats();
    await loadCrmContacts();
    await loadCrmSequences();
}

async function loadCrmStats() {
    try {
        const res = await apiFetch(getUserApi() + '/crm/stats');
        const data = await res.json();
        
        document.getElementById('crmTotalContacts').textContent = data.total || 0;
        document.getElementById('crmInSequence').textContent = data.inSequence || 0;
        document.getElementById('crmPendingFollowUp').textContent = data.pendingFollowUp || 0;
        document.getElementById('crmClosed').textContent = data.byStage?.closed || 0;
    } catch (e) {
        console.error('Error loading CRM stats:', e);
    }
}

async function loadCrmContacts() {
    try {
        const stageFilter = crmCurrentStage === 'all' ? '' : `?stage=${crmCurrentStage}`;
        const res = await apiFetch(getUserApi() + '/crm/contacts' + stageFilter);
        const data = await res.json();
        crmContacts = data.contacts || [];
        renderCrmContacts();
    } catch (e) {
        console.error('Error loading CRM contacts:', e);
    }
}

function renderCrmContacts() {
    const list = document.getElementById('crmContactsList');
    if (!crmContacts.length) {
        list.innerHTML = `
            <div class="empty-state" style="text-align:center; padding:40px;">
                <div class="empty-icon" style="font-size:48px; margin-bottom:16px;">🎯</div>
                <div class="empty-title" style="font-weight:600; margin-bottom:8px;">No CRM contacts yet</div>
                <p class="text-muted">Add contacts to start your sales pipeline</p>
                <button class="btn btn-primary mt-4" onclick="showAddCrmContact()">+ Add First Contact</button>
            </div>`;
        return;
    }

    const stageIcons = { new: '🆕', offered: '📨', interested: '🔥', closed: '✅', dnc: '🚫' };
    const stageColors = { new: '#888', offered: '#f59e0b', interested: '#10b981', closed: '#00ff88', dnc: '#ef4444' };

    list.innerHTML = crmContacts.map(c => `
        <div class="card-list-item" data-id="${c.id}" data-phone="${escapeAttr(c.phone)}" data-name="${escapeAttr(c.name || '')}">
            <div class="card-icon-large" style="background:${stageColors[c.stage] || '#888'}20; color:${stageColors[c.stage] || '#888'}">
                ${stageIcons[c.stage] || '👤'}
            </div>
            <div class="card-info">
                <div class="card-title">${escapeHtml(c.name || c.phone)}</div>
                <div class="card-subtitle">${escapeHtml(c.phone)}${c.sequenceId ? ' • In Sequence' : ''}</div>
            </div>
            <div class="flex gap-2">
                ${c.stage !== 'closed' && c.stage !== 'dnc' ? `
                    <button class="btn btn-sm btn-secondary" onclick="showCrmContactActions('${c.id}')" title="Actions">⚡</button>
                ` : ''}
                <button class="btn btn-sm btn-danger btn-icon" onclick="deleteCrmContact('${c.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

function filterCrmStage(stage) {
    crmCurrentStage = stage;
    
    // Update button styles
    document.querySelectorAll('.crm-stage-btn').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
    });
    const activeBtn = document.querySelector(`.crm-stage-btn[data-stage="${stage}"]`);
    if (activeBtn) {
        activeBtn.classList.remove('btn-secondary');
        activeBtn.classList.add('btn-primary');
    }
    
    loadCrmContacts();
}

function filterCrmContacts() {
    const q = (document.getElementById('searchCrmContacts')?.value || '').toLowerCase();
    document.querySelectorAll('#crmContactsList .card-list-item').forEach(item => {
        const name = (item.dataset.name || '').toLowerCase();
        const phone = (item.dataset.phone || '').toLowerCase();
        item.style.display = (name.includes(q) || phone.includes(q)) ? '' : 'none';
    });
}

async function loadCrmSequences() {
    try {
        const res = await apiFetch(getUserApi() + '/crm/sequences');
        const data = await res.json();
        crmSequences = data.sequences || [];
        renderCrmSequences();
    } catch (e) {
        console.error('Error loading CRM sequences:', e);
    }
}

function renderCrmSequences() {
    const list = document.getElementById('crmSequencesList');
    if (!crmSequences.length) {
        list.innerHTML = `
            <div class="empty-state" style="text-align:center; padding:20px;">
                <p class="text-muted">No sequences yet</p>
                <button class="btn btn-sm btn-secondary mt-2" onclick="showAddSequence()">Create Sequence</button>
            </div>`;
        return;
    }

    list.innerHTML = crmSequences.map(s => `
        <div class="card-list-item" data-id="${s.id}">
            <div class="card-icon-large" style="background:rgba(0,255,136,0.2); color:var(--primary)">⚡</div>
            <div class="card-info">
                <div class="card-title">${escapeHtml(s.name)}</div>
                <div class="card-subtitle">${s.steps?.length || 0} steps • Max ${s.maxFollowUps} follow-ups</div>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-sm btn-secondary btn-icon" onclick="editSequence('${s.id}')">✏️</button>
                <button class="btn btn-sm btn-danger btn-icon" onclick="deleteSequence('${s.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

function showAddCrmContact() {
    Swal.fire({
        title: '➕ Add CRM Contact',
        html: `
            <div style="text-align:left;">
                <label style="display:block; margin-bottom:4px; color:#8696a0;">📱 Phone Number</label>
                <input id="swal-phone" class="swal2-input" placeholder="628123456789" style="width:100%; margin:0 0 12px 0;">
                <label style="display:block; margin-bottom:4px; color:#8696a0;">👤 Name</label>
                <input id="swal-name" class="swal2-input" placeholder="John Doe" style="width:100%; margin:0 0 12px 0;">
                <label style="display:block; margin-bottom:4px; color:#8696a0;">📝 Notes (optional)</label>
                <textarea id="swal-notes" class="swal2-textarea" placeholder="Notes..." style="width:100%; margin:0;"></textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Save Contact',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#25D366',
        background: '#1f2c34',
        color: '#e9edef',
        preConfirm: () => {
            const phone = document.getElementById('swal-phone').value.trim();
            const name = document.getElementById('swal-name').value.trim();
            const notes = document.getElementById('swal-notes').value.trim();
            if (!phone) {
                Swal.showValidationMessage('Phone number is required');
                return false;
            }
            return { phone, name, notes };
        }
    }).then(async (result) => {
        if (result.isConfirmed && result.value) {
            try {
                await apiFetch(getUserApi() + '/crm/contacts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(result.value)
                });
                toast('Contact added!', 'success');
                loadCrmData();
            } catch (e) {
                toast('Failed to add contact', 'error');
            }
        }
    });
}

// Keep old function for backward compatibility but now unused
async function saveCrmContactFromModal() {
    // This is now handled by SweetAlert2 in showAddCrmContact
    console.log('saveCrmContactFromModal called - now handled by SweetAlert2');
}

async function deleteCrmContact(id) {
    if (!confirm('Delete this contact?')) return;
    
    try {
        await apiFetch(getUserApi() + '/crm/contacts/' + id, { method: 'DELETE' });
        toast('Contact deleted', 'success');
        loadCrmData();
    } catch (e) {
        toast('Failed to delete', 'error');
    }
}

function showImportCrmContacts() {
    Swal.fire({
        title: '📥 Import Contacts',
        html: `
            <div style="text-align:left;">
                <label style="display:block; margin-bottom:8px; color:#8696a0;">📁 Upload CSV File</label>
                <input type="file" id="swal-csv-file" accept=".csv,.txt" 
                    style="width:100%; padding:10px; background:#111b21; border:1px dashed #3b4a54; border-radius:8px; color:#e9edef; margin-bottom:16px;">
                
                <div style="text-align:center; color:#8696a0; margin-bottom:16px;">— OR —</div>
                
                <label style="display:block; margin-bottom:4px; color:#8696a0;">📝 Paste Data (one per line)</label>
                <textarea id="swal-import-data" class="swal2-textarea" rows="6" 
                    placeholder="628123456789,John Doe&#10;628987654321,Jane&#10;628111222333" 
                    style="width:100%; margin:0;"></textarea>
                
                <div style="margin-top:12px; padding:10px; background:#111b21; border-radius:8px; font-size:12px; color:#8696a0;">
                    <strong>📋 CSV Format:</strong><br>
                    phone,name (name is optional)<br>
                    <code style="color:#25D366;">628123456789,John Doe</code>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '📥 Import',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#25D366',
        background: '#1f2c34',
        color: '#e9edef',
        preConfirm: async () => {
            const fileInput = document.getElementById('swal-csv-file');
            const textData = document.getElementById('swal-import-data').value.trim();
            
            let data = '';
            
            // Check if file was uploaded
            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                data = await file.text();
            } else if (textData) {
                data = textData;
            } else {
                Swal.showValidationMessage('Please upload a file or paste data');
                return false;
            }
            
            // Parse CSV/text data
            const contacts = data.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.toLowerCase().startsWith('phone')) // Skip header
                .map(line => {
                    const parts = line.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
                    return { phone: parts[0], name: parts[1] || '' };
                })
                .filter(c => c.phone && /^[0-9+]+$/.test(c.phone));
            
            if (!contacts.length) {
                Swal.showValidationMessage('No valid contacts found. Check format: phone,name');
                return false;
            }
            
            return contacts;
        }
    }).then(async (result) => {
        if (result.isConfirmed && result.value) {
            const contacts = result.value;
            
            try {
                const res = await apiFetch(getUserApi() + '/crm/contacts/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contacts })
                });
                const data = await res.json();
                toast(`✅ Imported ${data.success} contacts (${data.failed || 0} failed)`, 'success');
                loadCrmData();
            } catch (e) {
                toast('Failed to import contacts', 'error');
            }
        }
    });
}

// Keep old function for backward compatibility
async function importCrmContactsFromModal() {
    console.log('importCrmContactsFromModal called - now handled by SweetAlert2');
}

// Current contact being edited
let crmCurrentContactId = null;

function showCrmContactActions(contactId) {
    const contact = crmContacts.find(c => c.id === contactId);
    if (!contact) return;
    
    crmCurrentContactId = contactId;
    document.getElementById('crmContactActionsInfo').textContent = `Actions for ${contact.name || contact.phone}`;
    showModal('crmContactActionsModal');
}

function crmActionChangeStage() {
    closeModal('crmContactActionsModal');
    showModal('crmSelectStageModal');
}

async function crmSetStage(stage) {
    if (!crmCurrentContactId) return;
    
    try {
        await apiFetch(getUserApi() + '/crm/contacts/' + crmCurrentContactId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage })
        });
        toast('Contact updated!', 'success');
        closeModal('crmSelectStageModal');
        loadCrmData();
    } catch (e) {
        toast('Failed to update', 'error');
    }
}

function crmActionStartSequence() {
    closeModal('crmContactActionsModal');
    
    if (!crmSequences.length) {
        toast('No sequences available. Create one first!', 'error');
        return;
    }
    
    const container = document.getElementById('crmSequenceOptions');
    container.innerHTML = crmSequences.map(s => `
        <button class="btn btn-secondary btn-block" onclick="startContactSequenceFromModal('${s.id}')">
            ⚡ ${escapeHtml(s.name)} (${s.steps?.length || 0} steps)
        </button>
    `).join('');
    
    showModal('crmSelectSequenceModal');
}

async function startContactSequenceFromModal(sequenceId) {
    if (!crmCurrentContactId) return;
    
    try {
        await apiFetch(getUserApi() + '/crm/contacts/' + crmCurrentContactId + '/start-sequence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sequenceId })
        });
        toast('Sequence started!', 'success');
        closeModal('crmSelectSequenceModal');
        loadCrmData();
    } catch (e) {
        toast('Failed to start sequence', 'error');
    }
}

async function crmActionStopSequence() {
    if (!crmCurrentContactId) return;
    
    try {
        await apiFetch(getUserApi() + '/crm/contacts/' + crmCurrentContactId + '/stop-sequence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        toast('Sequence stopped', 'success');
        closeModal('crmContactActionsModal');
        loadCrmData();
    } catch (e) {
        toast('Failed to stop sequence', 'error');
    }
}

async function crmActionMarkAs(stage) {
    if (!crmCurrentContactId) return;
    
    try {
        await apiFetch(getUserApi() + '/crm/contacts/' + crmCurrentContactId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage })
        });
        toast('Contact updated!', 'success');
        closeModal('crmContactActionsModal');
        loadCrmData();
    } catch (e) {
        toast('Failed to update', 'error');
    }
}

// Sequence Builder
let sequenceSteps = [];

function showAddSequence() {
    Swal.fire({
        title: '⚡ Create Sequence',
        html: `
            <div style="text-align:left;">
                <label style="display:block; margin-bottom:4px; color:#8696a0;">📛 Sequence Name</label>
                <input id="swal-seq-name" class="swal2-input" placeholder="Follow-up Sequence" style="width:100%; margin:0 0 12px 0;">
                <label style="display:block; margin-bottom:4px; color:#8696a0;">🔄 Max Follow-ups</label>
                <select id="swal-seq-max" class="swal2-select" style="width:100%; margin:0 0 12px 0;">
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3" selected>3</option>
                    <option value="5">5</option>
                </select>
                <label style="display:block; margin-bottom:4px; color:#8696a0;">⏰ First Message (after days)</label>
                <input type="number" id="swal-seq-delay" class="swal2-input" value="3" min="1" style="width:100%; margin:0 0 12px 0;">
                <label style="display:block; margin-bottom:4px; color:#8696a0;">💬 Message</label>
                <textarea id="swal-seq-message" class="swal2-textarea" placeholder="Hi! Just following up..." style="width:100%; margin:0;"></textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Create Sequence',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#25D366',
        background: '#1f2c34',
        color: '#e9edef',
        preConfirm: () => {
            const name = document.getElementById('swal-seq-name').value.trim();
            const maxFollowUps = parseInt(document.getElementById('swal-seq-max').value);
            const delay = parseInt(document.getElementById('swal-seq-delay').value);
            const message = document.getElementById('swal-seq-message').value.trim();
            
            if (!name) {
                Swal.showValidationMessage('Sequence name is required');
                return false;
            }
            if (!message) {
                Swal.showValidationMessage('Message is required');
                return false;
            }
            
            return { 
                name, 
                maxFollowUps,
                steps: [{ delay, delayUnit: 'days', message }]
            };
        }
    }).then(async (result) => {
        if (result.isConfirmed && result.value) {
            try {
                await apiFetch(getUserApi() + '/crm/sequences', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(result.value)
                });
                toast('Sequence created!', 'success');
                loadCrmSequences();
            } catch (e) {
                toast('Failed to create sequence', 'error');
            }
        }
    });
}

function addSequenceStep() {
    sequenceSteps.push({
        delay: 3,
        delayUnit: 'days',
        message: ''
    });
    renderSequenceSteps();
}

function removeSequenceStep(index) {
    sequenceSteps.splice(index, 1);
    renderSequenceSteps();
}

function renderSequenceSteps() {
    const container = document.getElementById('sequenceStepsContainer');
    
    if (!sequenceSteps.length) {
        container.innerHTML = '<p class="text-muted text-center p-4">No steps yet. Click "Add Step" to create one.</p>';
        return;
    }
    
    container.innerHTML = sequenceSteps.map((step, i) => `
        <div class="card mb-2" style="background:rgba(0,0,0,0.3); padding:16px;">
            <div class="flex justify-between align-center mb-2">
                <strong>Step ${i + 1}</strong>
                <button class="btn btn-sm btn-danger btn-icon" onclick="removeSequenceStep(${i})">🗑️</button>
            </div>
            <div class="flex gap-2 mb-2 align-center">
                <span>Send after</span>
                <input type="number" class="form-input" style="width:80px;" value="${step.delay}" 
                    onchange="updateSequenceStep(${i}, 'delay', this.value)">
                <select class="form-input" style="width:100px;" onchange="updateSequenceStep(${i}, 'delayUnit', this.value)">
                    <option value="hours" ${step.delayUnit === 'hours' ? 'selected' : ''}>hours</option>
                    <option value="days" ${step.delayUnit === 'days' ? 'selected' : ''}>days</option>
                </select>
            </div>
            <textarea class="form-input" rows="2" placeholder="Message to send..." 
                onchange="updateSequenceStep(${i}, 'message', this.value)">${escapeHtml(step.message || '')}</textarea>
        </div>
    `).join('');
}

function updateSequenceStep(index, field, value) {
    if (sequenceSteps[index]) {
        sequenceSteps[index][field] = field === 'delay' ? parseInt(value) : value;
    }
}

async function saveSequenceFromModal() {
    const name = document.getElementById('sequenceName').value.trim();
    const maxFollowUps = parseInt(document.getElementById('sequenceMaxFollowUps').value);

    if (!name) {
        toast('Sequence name is required', 'error');
        return;
    }

    // Validate steps have messages
    const validSteps = sequenceSteps.filter(s => s.message && s.message.trim());
    if (!validSteps.length) {
        toast('At least one step with message is required', 'error');
        return;
    }

    try {
        await apiFetch(getUserApi() + '/crm/sequences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, steps: validSteps, maxFollowUps })
        });
        toast('Sequence created!', 'success');
        closeModal('addSequenceModal');
        loadCrmSequences();
    } catch (e) {
        toast('Failed to create sequence', 'error');
    }
}

async function deleteSequence(id) {
    if (!confirm('Delete this sequence? Contacts using it will be removed from the sequence.')) return;
    
    try {
        await apiFetch(getUserApi() + '/crm/sequences/' + id, { method: 'DELETE' });
        toast('Sequence deleted', 'success');
        loadCrmSequences();
    } catch (e) {
        toast('Failed to delete', 'error');
    }
}

function editSequence(id) {
    toast('Edit sequence - coming soon', 'info');
}

// Redundant functions removed to avoid overwriting SweetAlert2 versions


// Update switchTab to include CRM
const originalSwitchTab = window.switchTab;
window.switchTab = function(tab) {
    // Close sidebar on tab switch (mobile)
    document.querySelector('.sidebar')?.classList.remove('open');

    // Hide all panels
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    // Update sidebar items
    document.querySelectorAll('.sidebar-item').forEach(n => n.classList.remove('active'));
    const sidebarItem = document.querySelector(`.sidebar-item[data-tab="${tab}"]`);
    if (sidebarItem) sidebarItem.classList.add('active');

    // Show selected panel
    const panel = document.getElementById('tab-' + tab);
    if (panel) panel.classList.add('active');

    // Load data for tab
    if (tab === 'crm') { loadCrmData(); }
};

// ===== EVENT DELEGATION FOR CRM BUTTONS =====
// Using event delegation to ensure buttons work even if they're dynamically loaded
document.addEventListener('click', function(e) {
    // Check if clicked element or its parent is a button with specific onclick attribute
    const target = e.target.closest('button');
    if (!target) return;
    
    const onclick = target.getAttribute('onclick');
    if (!onclick) return;
    
    // Handle CRM specific buttons that might not trigger properly
    if (onclick.includes('showAddCrmContact')) {
        e.preventDefault();
        e.stopPropagation();
        showAddCrmContact();
    } else if (onclick.includes('showAddSequence')) {
        e.preventDefault();
        e.stopPropagation();
        showAddSequence();
    } else if (onclick.includes('showImportCrmContacts')) {
        e.preventDefault();
        e.stopPropagation();
        showImportCrmContacts();
    }
});
