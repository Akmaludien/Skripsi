/**
 * STMKG Monitoring System - Shared Utilities
 */

// ─── API Base ────────────────────────────────
const API = {
    get: async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
    },
    post: async (url, data) => {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    }
};

// ─── WebSocket Connection ────────────────────
class WSClient {
    constructor() {
        this.ws = null;
        this.listeners = {};
        this.reconnectDelay = 3000;
        this.connect();
    }

    connect() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${location.host}/ws`);

        this.ws.onopen = () => {
            console.log('[WS] Connected');
            this.updateConnectionStatus(true);
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.emit(msg.type, msg.data);
            } catch (e) {
                console.error('[WS] Parse error:', e);
            }
        };

        this.ws.onclose = () => {
            console.log('[WS] Disconnected, reconnecting...');
            this.updateConnectionStatus(false);
            setTimeout(() => this.connect(), this.reconnectDelay);
        };

        this.ws.onerror = () => {
            this.ws.close();
        };
    }

    on(type, callback) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(callback);
    }

    emit(type, data) {
        if (this.listeners[type]) {
            this.listeners[type].forEach(cb => cb(data));
        }
    }

    updateConnectionStatus(connected) {
        const dot = document.querySelector('.live-dot');
        if (dot) {
            dot.style.background = connected ? '#22c55e' : '#ef4444';
        }
    }
}

// Global WS instance
const ws = new WSClient();

// ─── Theme Toggle ────────────────────────────
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);

    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            btn.innerHTML = next === 'dark' ? '🌙' : '☀️';
        });
        btn.innerHTML = saved === 'dark' ? '🌙' : '☀️';
    }
}

// ─── Mobile Sidebar ──────────────────────────
function initSidebar() {
    const btn = document.querySelector('.mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar');
    if (btn && sidebar) {
        btn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
        // Close on click outside
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !btn.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        });
    }
}

// ─── Active Nav Link ─────────────────────────
function setActiveNav() {
    const path = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (path === href || (path === '/' && href === '/index.html')) {
            link.classList.add('active');
        }
    });
}

// ─── Utility Functions ───────────────────────
function formatNumber(num, decimals = 1) {
    if (num === null || num === undefined) return 'N/A';
    return Number(num).toFixed(decimals);
}

function timeAgo(dateStr) {
    if (!dateStr) return 'N/A';
    const now = Date.now();
    const past = new Date(dateStr).getTime();
    const diffMs = now - past;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Baru saja';
    if (diffMin < 60) return `${diffMin} menit lalu`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} jam lalu`;
    return `${Math.floor(diffHr / 24)} hari lalu`;
}

function getCategoryClass(category) {
    if (!category) return '';
    return category.toLowerCase().replace(' ', '-');
}

function getCategoryColor(category) {
    switch ((category || '').toUpperCase()) {
        case 'RINGAN': return '#22c55e';
        case 'SEDANG': return '#f97316';
        case 'LEBAT': return '#ef4444';
        case 'SANGAT LEBAT': return '#7c3aed';
        default: return '#94a3b8';
    }
}

function getTypeColor(type) {
    switch ((type || '').toUpperCase()) {
        case 'AWS': return '#2563eb';
        case 'ARG': return '#22c55e';
        case 'AAWS': return '#f97316';
        default: return '#94a3b8';
    }
}

/**
 * Get BMKG Rainfall Category (24h Accumulated)
 */
function getRainfallCategory(val) {
    if (val === null || val === undefined || val < 0.5) return { label: 'Tidak Hujan', class: 'cat-none', color: '#E2E8F0' };
    if (val < 20) return { label: 'Hujan Ringan', class: 'cat-light', color: '#38A169' };
    if (val < 50) return { label: 'Hujan Sedang', class: 'cat-moderate', color: '#ECC94B' };
    if (val < 100) return { label: 'Hujan Lebat', class: 'cat-heavy', color: '#ED8936' };
    return { label: 'Hujan Sangat Lebat', class: 'cat-very-heavy', color: '#E53E3E' };
}

/**
 * Data Quality Control (QC) Flagging
 */
function checkDataQC(field, value) {
    if (value === null || value === undefined) return { valid: true }; // N/A is handled separately
    
    const limits = {
        temp: { min: 10, max: 45 },
        rh: { min: 10, max: 100 },
        batt: { min: 10.5, max: 15.0 },
        rr: { min: 0, max: 500 }
    };

    const limit = limits[field];
    if (!limit) return { valid: true };

    if (value < limit.min || value > limit.max) {
        return { valid: false, message: `Anomaly: ${value} outside range (${limit.min}-${limit.max})` };
    }
    return { valid: true };
}

// Create circular progress SVG
function createCircleProgress(value, max, color, size = 56) {
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const percent = Math.min(value / max, 1);
    const offset = circumference * (1 - percent);

    return `
        <div class="circle-progress" style="width:${size}px;height:${size}px">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${radius}"/>
                <circle class="fill" cx="${size / 2}" cy="${size / 2}" r="${radius}"
                    stroke="${color}"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${offset}"/>
            </svg>
            <span class="value">${formatNumber(value, 0)}</span>
        </div>
    `;
}

// Format date for display
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
}

// ─── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initSidebar();
    setActiveNav();
    initNotifications();
    initClock();
});

// ─── Live Clock ──────────────────────────────
function initClock() {
    const container = document.querySelector('.system-live-text');
    if (!container) return;
    
    const strongTag = container.querySelector('strong');
    if (strongTag) {
        const clockDiv = document.createElement('div');
        clockDiv.id = 'liveClock';
        clockDiv.style.fontWeight = '700';
        clockDiv.style.fontSize = '1.15em';
        clockDiv.style.color = '#3b82f6';
        clockDiv.style.margin = '6px 0';
        
        // Update Dashboard Home Clock if exists
        const homeDate = document.getElementById('homeLiveDate');
        const homeTime = document.getElementById('homeLiveTime');

        const updateClocks = () => {
            const time = new Date();
            const dateStr = time.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const timeStr = time.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
            
            clockDiv.textContent = timeStr;
            if (homeDate && homeTime) {
                homeDate.textContent = dateStr;
                homeTime.textContent = timeStr;
            }
        };

        // Initial set
        strongTag.insertAdjacentElement('afterend', clockDiv);
        updateClocks();
        setInterval(updateClocks, 1000);
    }
}

// ─── Notification System ─────────────────────
function initNotifications() {
    const btn = document.getElementById('notifBtn');
    const dropdown = document.getElementById('notifDropdown');
    if (!btn || !dropdown) return;

    // Toggle dropdown
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isShowing = dropdown.classList.toggle('show');
        if (isShowing) {
            const badge = document.getElementById('notifBadge');
            if (badge) {
                badge.style.display = 'none';
                badge.textContent = '0';
            }
        }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });

    // Load notifications
    loadRainNotifications();

    // Listen for real-time alerts via WebSocket
    ws.on('alert', (data) => {
        addRealtimeNotification(data);
    });
}

async function loadRainNotifications() {
    const badge = document.getElementById('notifBadge');
    const body = document.getElementById('notifBody');
    if (!body) return;

    // Only show real-time notifications (no historical data)
    body.innerHTML = '<div class="notif-empty">✅ Tidak ada peringatan hujan lebat saat ini</div>';
    if (badge) badge.style.display = 'none';
}

function addRealtimeNotification(alertData) {
    const body = document.getElementById('notifBody');
    const badge = document.getElementById('notifBadge');
    if (!body) return;

    // Remove "no alerts" message if present
    const empty = body.querySelector('.notif-empty');
    if (empty) empty.remove();

    const severity = (alertData.severity === 'SIAGA') ? 'danger' : 'warning';
    const item = document.createElement('div');
    item.className = `notif-item ${severity}`;
    if (alertData.station_id) {
        item.style.cursor = 'pointer';
        item.onclick = () => {
            // Gunakan station_id untuk navigasi ke halaman detail
            window.location.href = `/detail.html?id=${encodeURIComponent(alertData.station_id)}`;
        };
    }
    // Tampilkan station_name (nama asli) jika tersedia, bukan station_id
    const displayName = alertData.station_name || alertData.station_id;
    item.innerHTML = `
        <div class="notif-title ${severity}">🚨 ${alertData.severity}: ${alertData.alert_type}</div>
        <div class="notif-detail"><b>${displayName}</b> — ${alertData.message}</div>
        <div class="notif-time">Baru saja</div>
    `;
    body.prepend(item);

    // Update badge
    if (badge) {
        const current = parseInt(badge.textContent) || 0;
        badge.textContent = current + 1;
        badge.style.display = 'flex';
    }
}


// ─── Loading Skeleton ────────────────────────
function showSkeleton(container, count = 4) {
    if (!container) return;
    container.innerHTML = Array(count).fill(`
        <div class="skeleton-card">
            <div class="skeleton-line" style="width:60%;height:12px;margin-bottom:8px"></div>
            <div class="skeleton-line" style="width:40%;height:10px;margin-bottom:16px"></div>
            <div class="skeleton-line" style="width:100%;height:56px;border-radius:50%"></div>
        </div>
    `).join('');
}

// ─── Auto-refresh Fallback (if WebSocket disconnects) ────
let wsReconnectFallback = null;

function startAutoRefreshFallback() {
    if (wsReconnectFallback) return;
    wsReconnectFallback = setInterval(() => {
        // Only refresh if WS is disconnected
        if (!ws.ws || ws.ws.readyState !== WebSocket.OPEN) {
            console.log('[Fallback] WS disconnected, polling data...');
            // Trigger page-specific refresh if available
            if (typeof loadDashboard === 'function') loadDashboard();
            if (typeof loadStations === 'function') loadStations();
        }
    }, 300000); // Every 5 minutes
}

// Start fallback polling after page load
setTimeout(startAutoRefreshFallback, 10000);


// ─── Browser Push Notifications ──────────────
function initBrowserNotifications() {
    if (!('Notification' in window)) return;
    
    // Request permission on first interaction
    document.addEventListener('click', function requestOnce() {
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
        document.removeEventListener('click', requestOnce);
    }, { once: true });

    // Listen for heavy rain alerts via WebSocket
    ws.on('alert', (data) => {
        if (Notification.permission !== 'granted') return;
        if (!data || !data.severity) return;

        const title = `⚠️ ${data.severity}: ${data.alert_type}`;
        const body = `${data.station_name || data.station_id} — ${data.message}`;
        const icon = '/img/stmkg-logo.png';

        const notif = new Notification(title, { body, icon, tag: data.station_id });
        notif.onclick = () => {
            window.focus();
            if (data.station_id) {
                window.location.href = `/detail.html?id=${encodeURIComponent(data.station_id)}`;
            }
            notif.close();
        };

        // Auto close after 10 seconds
        setTimeout(() => notif.close(), 10000);
    });

    // Also notify on heavy rain sensor updates
    ws.on('sensor_update', (data) => {
        if (Notification.permission !== 'granted') return;
        const rr = data.realtime_rr || data.rr || 0;
        if (rr < 50) return; // Only notify for heavy rain

        const stationName = data.station_name || data.station_id;
        const category = rr > 100 ? 'SANGAT LEBAT' : 'LEBAT';
        
        const notif = new Notification(`🌧️ Hujan ${category}!`, {
            body: `${stationName}: ${rr.toFixed(1)} mm terdeteksi`,
            icon: '/img/stmkg-logo.png',
            tag: `rain_${data.station_id}` // Prevent duplicate notifications per station
        });
        notif.onclick = () => {
            window.focus();
            window.location.href = `/detail.html?id=${encodeURIComponent(data.station_id)}`;
            notif.close();
        };
        setTimeout(() => notif.close(), 8000);
    });
}

// Initialize browser notifications
initBrowserNotifications();
