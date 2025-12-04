// ===== WHATSAPP BOT - COMPLETE JAVASCRIPT =====

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
    loadSettings();
    loadQuickActions();
    loadMedia();
    setInterval(checkStatus, 5000);
    
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
    
    authToken = '';
    localStorage.removeItem('authToken');
    toast('Logged out', 'success');
    checkAuth();
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
        
        let className, statusText;
        if (data.status === 'connected') {
            className = 'status-badge connected';
            statusText = 'Connected';
        } else if (data.status === 'qr') {
            className = 'status-badge disconnected';
            statusText = 'Scan QR';
        } else {
            className = 'status-badge disconnected';
            statusText = 'Disconnected';
        }
        
        // Update header, desktop sidebar, and mobile menu status
        updateStatusBadge('statusBadge', 'statusText', className, statusText);
        updateStatusBadge('statusBadgeDesktop', 'statusTextDesktop', className, statusText);
        updateStatusBadge('statusBadgeMobile', 'statusTextMobile', className, statusText);
    } catch (e) {
        updateStatusBadge('statusBadge', 'statusText', 'status-badge disconnected', 'Offline');
        updateStatusBadge('statusBadgeDesktop', 'statusTextDesktop', 'status-badge disconnected', 'Offline');
        updateStatusBadge('statusBadgeMobile', 'statusTextMobile', 'status-badge disconnected', 'Offline');
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
function switchTab(tab) {
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
    
    // Show selected panel
    document.getElementById('tab-' + tab).classList.add('active');
    
    // Load data for tab
    if (tab === 'home') { loadQuickActions(); loadMedia(); }
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
        <div class="list-item">
            <div class="list-item-icon">👥</div>
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(g.name)}</div>
                <div class="list-item-subtitle">${escapeHtml(g.id)}</div>
            </div>
            <button class="btn btn-danger btn-icon" onclick="deleteGroup('${escapeAttr(g.id)}')">🗑️</button>
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
        <div class="group-select-item" onclick="toggleGroupSelect(this, '${escapeAttr(g.groupId)}')">
            <input type="checkbox" value="${escapeAttr(g.groupId)}" onclick="event.stopPropagation(); updateSelectedCount()">
            <span>${escapeHtml(g.name)}</span>
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
async function sendBroadcast() {
    const message = document.getElementById('quickMessage').value.trim();
    const selected = [...document.querySelectorAll('#groupSelectList input:checked')].map(cb => cb.value);
    
    if (!message && !selectedImage) return toast('Please enter a message or select an image', 'error');
    if (!selected.length) return toast('Please select at least one group', 'error');
    
    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Sending...';
    
    try {
        let imageData = null;
        if (selectedImage) {
            imageData = await toBase64(selectedImage);
        }
        
        const res = await apiFetch(getUserApi() + '/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, groups: selected, image: imageData })
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
    if (!confirm('Delete this group?')) return;
    
    try {
        await apiFetch(getUserApi() + '/groups/' + encodeURIComponent(id), { method: 'DELETE' });
        toast('Group deleted', 'success');
        loadGroups();
    } catch (e) {
        toast('Failed to delete', 'error');
    }
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
            <div class="list-item" onclick="addDiscoveredGroup('${escapeAttr(g.id)}', '${escapeAttr(g.name)}')">
                <div class="list-item-icon">👥</div>
                <div class="list-item-content">
                    <div class="list-item-title">${escapeHtml(g.name)}</div>
                    <div class="list-item-subtitle">${g.participants || 0} members</div>
                </div>
                <span class="text-success">+ Add</span>
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
        <div class="list-item">
            <div class="list-item-icon">👤</div>
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(c.name)}</div>
                <div class="list-item-subtitle">${escapeHtml(c.number)}</div>
            </div>
            <button class="btn btn-danger btn-icon" onclick="deleteContact('${c.id}')">🗑️</button>
        </div>
    `).join('');
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
    if (!confirm('Delete this contact?')) return;
    
    try {
        await apiFetch(getUserApi() + '/contacts/' + id, { method: 'DELETE' });
        toast('Deleted', 'success');
        loadContacts();
    } catch (e) {
        toast('Failed to delete', 'error');
    }
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
        <div class="list-item">
            <div class="list-item-content" style="flex:1">
                <div class="list-item-title">
                    ${escapeHtml(r.keyword)}
                    <span class="list-item-badge ${r.enabled ? 'success' : 'disabled'}">${r.matchType || 'contains'}</span>
                    ${r.image ? '<span class="list-item-badge info">📷</span>' : ''}
                </div>
                <div class="list-item-subtitle">${escapeHtml((r.response || '').substring(0, 50))}${r.response?.length > 50 ? '...' : ''}</div>
            </div>
            <div class="toggle toggle-sm list-item-toggle ${r.enabled ? 'active' : ''}" onclick="toggleAutoReply('${r.id}')"></div>
            <button class="btn btn-danger btn-icon" onclick="deleteAutoReply('${r.id}')">🗑️</button>
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
    if (!confirm('Delete this auto reply?')) return;
    
    try {
        await apiFetch(getUserApi() + '/autoreplies/' + id, { method: 'DELETE' });
        toast('Deleted', 'success');
        loadAutoReplies();
    } catch (e) {
        toast('Failed to delete', 'error');
    }
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
        <div class="list-item">
            <div class="list-item-icon">⚡</div>
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(c.command)}</div>
                <div class="list-item-subtitle">${escapeHtml((c.response || '').substring(0, 40))}...</div>
            </div>
            <button class="btn btn-secondary btn-icon" onclick="editCommand('${c.id}')">✏️</button>
            <button class="btn btn-danger btn-icon" onclick="deleteCommand('${c.id}')">🗑️</button>
        </div>
    `).join('');
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
    if (!confirm('Delete this command?')) return;
    
    try {
        await apiFetch(getUserApi() + '/commands/' + id, { method: 'DELETE' });
        toast('Deleted', 'success');
        loadCommands();
    } catch (e) {
        toast('Failed to delete', 'error');
    }
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

function renderSchedules() {
    const searchQuery = (document.getElementById('searchSchedules')?.value || '').toLowerCase();
    
    // Split schedules into pending and sent
    const pendingSchedules = schedules.filter(s => s.status !== 'sent');
    const sentSchedules = schedules.filter(s => s.status === 'sent');
    
    // Filter pending by search query
    const filteredPending = searchQuery 
        ? pendingSchedules.filter(s => 
            (s.name || '').toLowerCase().includes(searchQuery) ||
            (s.message || '').toLowerCase().includes(searchQuery)
        )
        : pendingSchedules;
    
    // Render pending schedules
    const list = document.getElementById('scheduleList');
    if (!filteredPending.length) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📅</div>
                <div class="empty-title">${searchQuery ? 'No matching schedules' : 'No pending schedules'}</div>
                <p class="empty-text">${searchQuery ? 'Try a different search' : 'Schedule broadcasts for later'}</p>
            </div>`;
    } else {
        list.innerHTML = filteredPending.map(s => `
            <div class="schedule-item">
                <div class="flex-between mb-2">
                    <div class="schedule-name" style="font-weight: 600; color: var(--text);">${escapeHtml(s.name || 'Untitled Schedule')}</div>
                    ${s.image ? '<span class="list-item-badge info">📷</span>' : ''}
                </div>
                <div class="schedule-time" style="font-size: 13px; color: var(--primary); margin-bottom: 8px;">🕐 ${formatDate(s.scheduledTime)}</div>
                <div class="schedule-message">${escapeHtml(s.message || 'Image only')}</div>
                <div class="schedule-meta">
                    <span>📤 ${s.groups?.length || s.groupIds?.length || 0} groups</span>
                    ${s.repeat || s.recurring ? `<span>🔄 ${s.repeat || s.recurring}</span>` : ''}
                    <span class="list-item-badge warning">pending</span>
                </div>
                <div class="flex gap-2 mt-4">
                    <button class="btn btn-sm btn-secondary" onclick="duplicateSchedule('${s.id}')">📋 Duplicate</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSchedule('${s.id}')">🗑️ Delete</button>
                </div>
            </div>
        `).join('');
    }
    
    // Render archive
    renderArchive(sentSchedules, searchQuery);
}

function renderArchive(sentSchedules, searchQuery) {
    // Filter archive by search query too
    const filteredSent = searchQuery 
        ? sentSchedules.filter(s => 
            (s.name || '').toLowerCase().includes(searchQuery) ||
            (s.message || '').toLowerCase().includes(searchQuery)
        )
        : sentSchedules;
    
    // Update archive count
    const countEl = document.getElementById('archiveCount');
    if (countEl) {
        countEl.textContent = `${filteredSent.length} sent schedule${filteredSent.length !== 1 ? 's' : ''}`;
    }
    
    // Render archive list
    const archiveList = document.getElementById('archiveList');
    if (!archiveList) return;
    
    if (!filteredSent.length) {
        archiveList.innerHTML = `
            <div class="empty-state">
                <p class="text-muted">${searchQuery ? 'No matching archived schedules' : 'No archived schedules yet'}</p>
            </div>`;
    } else {
        archiveList.innerHTML = filteredSent.map(s => `
            <div class="schedule-item" style="opacity: 0.8; background: var(--bg-secondary);">
                <div class="flex-between mb-2">
                    <div class="schedule-name" style="font-weight: 600; color: var(--text);">${escapeHtml(s.name || 'Untitled Schedule')}</div>
                    <span class="list-item-badge success">✓ sent</span>
                </div>
                <div class="schedule-time" style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
                    📅 Scheduled: ${formatDate(s.scheduledTime)}
                    ${s.sentAt ? `<br>✅ Sent: ${formatDate(s.sentAt)}` : ''}
                </div>
                <div class="schedule-message" style="font-size: 13px;">${escapeHtml((s.message || 'Image only').substring(0, 100))}${(s.message || '').length > 100 ? '...' : ''}</div>
                <div class="schedule-meta">
                    <span>📤 ${s.groups?.length || s.groupIds?.length || 0} groups</span>
                </div>
                <div class="flex gap-2 mt-4">
                    <button class="btn btn-sm btn-secondary" onclick="duplicateSchedule('${s.id}')">📋 Reuse</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSchedule('${s.id}')">🗑️ Delete</button>
                </div>
            </div>
        `).join('');
    }
}

function toggleArchive() {
    const archiveList = document.getElementById('archiveList');
    const toggleText = document.getElementById('archiveToggleText');
    const countEl = document.getElementById('archiveCount');
    
    if (archiveList.classList.contains('hidden')) {
        archiveList.classList.remove('hidden');
        toggleText.textContent = 'Hide';
        if (countEl) countEl.classList.add('hidden');
    } else {
        archiveList.classList.add('hidden');
        toggleText.textContent = 'Show';
        if (countEl) countEl.classList.remove('hidden');
    }
}

function filterSchedules() {
    renderSchedules();
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
    if (!confirm('Delete this schedule?')) return;
    
    try {
        await apiFetch(getUserApi() + '/schedules/' + id, { method: 'DELETE' });
        toast('Deleted', 'success');
        loadSchedules();
    } catch (e) {
        toast('Failed to delete', 'error');
    }
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
        list.innerHTML = '<div class="empty-state"><p class="text-muted">Save message templates for quick use</p></div>';
        return;
    }
    
    list.innerHTML = templates.map((t, i) => `
        <div class="list-item" onclick="useTemplate(${i})">
            <div class="list-item-icon">📝</div>
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(t.name)}</div>
                <div class="list-item-subtitle">${escapeHtml((t.message || '').substring(0, 40))}...</div>
            </div>
            <button class="btn btn-secondary btn-icon" onclick="event.stopPropagation(); editTemplate('${t.id}')">✏️</button>
            <button class="btn btn-danger btn-icon" onclick="event.stopPropagation(); deleteTemplate('${t.id}')">🗑️</button>
        </div>
    `).join('');
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
    switchTab('home');
    toast('Template loaded!', 'success');
}

function showTemplateSelect() {
    loadTemplates().then(() => {
        const list = document.getElementById('templateSelectList');
        if (!templates.length) {
            list.innerHTML = '<div class="empty-state"><p class="text-muted">No templates saved yet</p></div>';
        } else {
            list.innerHTML = templates.map((t, i) => `
                <div class="list-item" onclick="useTemplate(${i}); closeModal('templateSelectModal')">
                    <div class="list-item-icon">📝</div>
                    <div class="list-item-content">
                        <div class="list-item-title">${escapeHtml(t.name)}</div>
                        <div class="list-item-subtitle">${escapeHtml((t.message || '').substring(0, 40))}...</div>
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
    if (!confirm('Delete this template?')) return;
    
    try {
        await apiFetch(getUserApi() + '/templates/' + id, { method: 'DELETE' });
        toast('Deleted', 'success');
        loadTemplates();
    } catch (e) {
        toast('Failed to delete', 'error');
    }
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
    
    const recent = history.slice(-20).reverse();
    list.innerHTML = recent.map(h => {
        const success = h.successCount || h.success || 0;
        const failed = h.failCount || h.failed || 0;
        return `
            <div class="list-item">
                <div class="list-item-icon">${failed === 0 ? '✅' : '⚠️'}</div>
                <div class="list-item-content">
                    <div class="list-item-title">${escapeHtml((h.message || 'Broadcast').substring(0, 30))}${h.message?.length > 30 ? '...' : ''}</div>
                    <div class="list-item-subtitle">${formatDate(h.timestamp)} • ✅ ${success} ❌ ${failed}</div>
                </div>
                ${failed > 0 ? `<button class="btn btn-sm btn-secondary" onclick="retryBroadcast('${h.id}')">🔄</button>` : ''}
            </div>
        `;
    }).join('');
}

async function clearHistory() {
    if (!confirm('Clear all history?')) return;
    
    try {
        await apiFetch(getUserApi() + '/history', { method: 'DELETE' });
        toast('History cleared', 'success');
        loadHistory();
    } catch (e) {
        toast('Failed to clear', 'error');
    }
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
            <div class="list-item">
                <div class="list-item-icon">🚫</div>
                <div class="list-item-content">
                    <div class="list-item-title">${escapeHtml(b.number || b)}</div>
                </div>
                <button class="btn btn-danger btn-icon" onclick="removeBlacklist('${b.id}')">🗑️</button>
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
            <div class="list-item">
                <div class="list-item-content">
                    <div class="list-item-title">${escapeHtml(l.from || 'Unknown')}</div>
                    <div class="list-item-subtitle">${escapeHtml((l.body || '').substring(0, 50))}...</div>
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
function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = `
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(t);
    setTimeout(() => t.remove(), 4000);
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
            <div class="list-item">
                <div class="list-item-icon">👤</div>
                <div class="list-item-content">
                    <div class="list-item-title">${escapeHtml(m.name || m.id)}</div>
                    <div class="list-item-subtitle">${m.isAdmin ? '👑 Admin' : 'Member'}</div>
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
