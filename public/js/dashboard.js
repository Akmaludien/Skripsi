
/**
 * Dashboard Page Logic
 */

let map, rainfallChart;
let allStations = [];

document.addEventListener('DOMContentLoaded', () => {
    showLoadingSkeleton();
    loadDashboard();
    loadPersistedNotifications();
});

function showLoadingSkeleton() {
    const grid = document.getElementById('stationCardsGrid');
    if (grid) {
        grid.innerHTML = Array(8).fill('').map(() => `
            <div class="skeleton-card">
                <div class="skeleton skeleton-line short"></div>
                <div class="skeleton skeleton-line medium"></div>
                <div style="display:flex;gap:12px;justify-content:center;margin-top:16px">
                    <div class="skeleton skeleton-circle"></div>
                    <div class="skeleton skeleton-circle"></div>
                    <div class="skeleton skeleton-circle"></div>
                </div>
            </div>
        `).join('');
    }
}

async function loadDashboard() {
    try {
        // Show loading skeleton while data loads
        const grid = document.getElementById('stationCardsGrid');
        if (grid) showSkeleton(grid, 8);

        const [summary, rainfallData, stations] = await Promise.all([
            API.get('/api/dashboard/summary'),
            API.get('/api/dashboard/rainfall-summary'),
            API.get('/api/stations')
        ]);

        allStations = stations;
        renderSummary(summary, stations);
        initMap(stations);
        // renderRainfallChart(rainfallData); // Chart removed from UI
        renderStationCards(stations);
        setupFilters();
        loadPredictionSummary();

        // Listen for real-time updates
        ws.on('sensor_update', handleRealtimeUpdate);
        ws.on('alert', handleRealtimeAlert);
    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}

function renderSummary(data, stations) {
    document.getElementById('totalStations').textContent = `${data.online_stations}/${data.total_stations}`;
    document.getElementById('onlineText').textContent = `Online ${data.online_percentage}%`;
    document.getElementById('onlineBadge').textContent = `Online ${data.online_percentage}%`;

    if (data.online_percentage < 100) {
        document.getElementById('onlineBadge').className = 'badge badge-warning';
    }

    document.getElementById('alertCount').textContent = data.active_alerts;
    if (data.active_alerts > 0 && data.alert_details.length > 0) {
        const topAlert = data.alert_details[0];
        document.getElementById('alertBadge').textContent = topAlert.severity;
        document.getElementById('alertBadge').className = `badge badge-${topAlert.severity === 'SIAGA' || topAlert.severity === 'AWAS' ? 'danger' : 'warning'}`;
        document.getElementById('alertSub').textContent = 'Peringatan';
    }

    // Find station with highest current real-time rainfall from the list of stations
    let maxRain = 0;
    let maxStationName = '-';

    if (stations && stations.length > 0) {
        // Warna marker berdasarkan freshness data (mirip AWS Center BMKG)
    function getStatusColor(lastUpdate) {
        if (!lastUpdate) return '#6b7280'; // Abu-abu: belum pernah ada data
        const diffMs = Date.now() - new Date(lastUpdate).getTime();
        const diffMin = diffMs / 60000;
        if (diffMin <= 30) return '#22c55e';    // Hijau: <= 30 menit
        if (diffMin <= 60) return '#eab308';    // Kuning: 31-60 menit
        if (diffMin <= 1440) return '#f97316';  // Oranye: 1-24 jam
        if (diffMin <= 43200) return '#ef4444'; // Merah: 1-30 hari
        return '#6b7280';                        // Abu-abu: > 30 hari
    }

    stations.forEach(s => {
            const rr = s.realtime_rr || 0;
            if (rr >= maxRain) {
                maxRain = rr;
                maxStationName = s.name;
            }
        });
    }

    // Fallback to backend value if all stations are 0 or no stations array is passed
    if (maxRain === 0 && data.max_rainfall_24h && data.max_rainfall_24h.value > 0) {
        maxRain = data.max_rainfall_24h.value;
        maxStationName = data.max_rainfall_24h.station_name || '-';
    }

    if (maxRain === 0) {
        document.getElementById('maxRainfall').innerHTML = `0.0 <span style="font-size:0.9rem;font-weight:400">mm</span>`;
        document.getElementById('maxRainfallStation').textContent = `☀️ Cerah / Tidak Ada Hujan`;
    } else {
        document.getElementById('maxRainfall').innerHTML = `${formatNumber(maxRain)} <span style="font-size:0.9rem;font-weight:400">mm</span>`;
        document.getElementById('maxRainfallStation').textContent = `📍 ${maxStationName}`;
    }
}

async function loadPredictionSummary() {
    try {
        const predictions = await API.get('/api/predictions?day=0');
        if (predictions && predictions.length > 0) {
            // Get today's date in local time for comparison
            const todayDate = new Date();
            const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth()+1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
            
            const heavy = predictions.filter(p => {
                if (!p.target_date) return false;
                return p.predicted_rainfall > 50 && p.target_date.startsWith(todayStr);
            });
            
            document.getElementById('predHeavy').textContent = heavy.length;
            if (heavy.length > 0) {
                document.getElementById('predHeavySub').textContent = `${heavy.length} stasiun diprediksi hujan lebat`;
                document.getElementById('predHeavy').style.color = 'var(--danger)';
            } else {
                document.getElementById('predHeavySub').textContent = 'Tidak ada prediksi hujan lebat hari ini';
            }
        }
    } catch (e) {
        document.getElementById('predHeavy').textContent = '0';
        document.getElementById('predHeavySub').textContent = 'Data prediksi tidak tersedia';
    }
}

let appMarkers = {};
function initMap(stations) {
    map = L.map('map', {
        zoomControl: true,
        scrollWheelZoom: true
    }).setView([-6.9, 107.6], 8);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 18
    }).addTo(map);

    const awsGroup = L.layerGroup().addTo(map);
    const argGroup = L.layerGroup().addTo(map);
    const aawsGroup = L.layerGroup().addTo(map);

    // Warna marker berdasarkan freshness data (mirip AWS Center BMKG)
    function getStatusColor(lastUpdate) {
        if (!lastUpdate) return '#6b7280'; // Abu-abu: belum pernah ada data
        const diffMs = Date.now() - new Date(lastUpdate).getTime();
        const diffMin = diffMs / 60000;
        if (diffMin <= 30) return '#22c55e';    // Hijau: <= 30 menit
        if (diffMin <= 60) return '#eab308';    // Kuning: 31-60 menit
        if (diffMin <= 1440) return '#f97316';  // Oranye: 1-24 jam
        if (diffMin <= 43200) return '#ef4444'; // Merah: 1-30 hari
        return '#6b7280';                        // Abu-abu: > 30 hari
    }

    stations.forEach(s => {
        const color = getStatusColor(s.latest_data_time || s.last_update);
        const size = 18;
        const half = size / 2;
        const radius = 7;

        let svgHtml = '';
        if (s.type === 'ARG') { // Circle
            svgHtml = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${half}" cy="${half}" r="${radius}" fill="${color}" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/></svg>`;
        } else if (s.type === 'AWS') { // Triangle
            svgHtml = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><polygon points="${half},2 ${size - 2},${size - 2} 2,${size - 2}" fill="${color}" stroke="rgba(255,255,255,0.8)" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
        } else { // AAWS Diamond
            svgHtml = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><polygon points="${half},2 ${size - 2},${half} ${half},${size - 2} 2,${half}" fill="${color}" stroke="rgba(255,255,255,0.8)" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
        }

        const customIcon = L.divIcon({
            html: svgHtml,
            className: '',
            iconSize: [size, size],
            iconAnchor: [half, half]
        });

        const marker = L.marker([s.latitude, s.longitude], { icon: customIcon });

        if (s.type === 'AWS') marker.addTo(awsGroup);
        else if (s.type === 'ARG') marker.addTo(argGroup);
        else if (s.type === 'AAWS') marker.addTo(aawsGroup);

        appMarkers[s.id] = marker;

        marker.bindPopup(`
            <div class="map-popup">
                <span class="badge-type ${s.type.toLowerCase()}">${s.type}</span>
                <h4>${s.name}</h4>
                <p>📍 ${s.location}</p>
                <p>🌧️ Curah Hujan: <strong>${formatNumber(s.latest_rr != null ? s.latest_rr : 0)} mm</strong></p>
                ${s.type !== 'ARG' ? `
                <p>🌡️ Suhu: <strong>${s.latest_temp != null ? formatNumber(s.latest_temp) + '°C' : '-'}</strong></p>
                <p>💧 RH: <strong>${s.latest_rh != null ? formatNumber(s.latest_rh) + '%' : '-'}</strong></p>
                ${s.latest_ws != null ? `<p>💨 Angin: <strong>${formatNumber(s.latest_ws)} m/s</strong></p>` : ''}
                ` : ''}
                <p style="font-size:0.75rem;color:#94a3b8;margin-top:4px">⏱️ ${s.latest_data_time ? timeAgo(s.latest_data_time) : 'Belum ada data'}</p>
                <p style="margin-top:6px"><a href="/detail.html?id=${s.id}" style="color:#3b82f6;font-weight:600">Lihat Detail →</a></p>
            </div>
        `);
    });

    // Legend
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
        const div = L.DomUtil.create('div', 'map-legend');
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; min-width:140px" id="legendToggleBtn">
                <h4 style="margin:0; font-size:0.75rem; font-weight:bold; color:var(--text-primary);">Tampilkan Legenda</h4>
                <span id="legendToggleIcon" style="font-size:0.8rem; margin-left: 8px;">👁️</span>
            </div>
            <div id="legendContent" style="display:none; margin-top:12px;">
                <h4>Tipe Stasiun <span style="font-size:0.7rem;font-weight:normal;color:#64748b">(Klik Filter)</span></h4>
                <div class="legend-item filter-click" id="filter-aws" style="display:flex;align-items:center;cursor:pointer;user-select:none;transition:opacity 0.2s"><svg width="12" height="12" style="margin-right:8px;overflow:visible"><polygon points="6,0 12,12 0,12" style="fill:#cbd5e1"/></svg> AWS</div>
                <div class="legend-item filter-click" id="filter-arg" style="display:flex;align-items:center;cursor:pointer;user-select:none;transition:opacity 0.2s"><svg width="12" height="12" style="margin-right:8px;overflow:visible"><circle cx="6" cy="6" r="6" style="fill:#cbd5e1"/></svg> ARG</div>
                <div class="legend-item filter-click" id="filter-aaws" style="display:flex;align-items:center;cursor:pointer;user-select:none;transition:opacity 0.2s"><svg width="12" height="12" style="margin-right:8px;overflow:visible"><polygon points="6,0 12,6 6,12 0,6" style="fill:#cbd5e1"/></svg> AAWS</div>
                <hr style="border:0;border-top:1px solid rgba(255,255,255,0.1);margin:8px 0">
                <h4>Status Data <span style="font-size:0.7rem;font-weight:normal;color:#64748b">(Freshness)</span></h4>
                <div class="legend-item" style="display:flex;align-items:center"><svg width="10" height="10" style="margin-right:8px"><circle cx="5" cy="5" r="5" fill="#22c55e"/></svg> &le; 30 Menit</div>
                <div class="legend-item" style="display:flex;align-items:center"><svg width="10" height="10" style="margin-right:8px"><circle cx="5" cy="5" r="5" fill="#eab308"/></svg> 31 - 60 Menit</div>
                <div class="legend-item" style="display:flex;align-items:center"><svg width="10" height="10" style="margin-right:8px"><circle cx="5" cy="5" r="5" fill="#f97316"/></svg> 1 - 24 Jam</div>
                <div class="legend-item" style="display:flex;align-items:center"><svg width="10" height="10" style="margin-right:8px"><circle cx="5" cy="5" r="5" fill="#ef4444"/></svg> 1 - 30 Hari</div>
                <div class="legend-item" style="display:flex;align-items:center"><svg width="10" height="10" style="margin-right:8px"><circle cx="5" cy="5" r="5" fill="#6b7280"/></svg> > 30 Hari</div>
            </div>
        `;

        setTimeout(() => {
            const toggleBtn = document.getElementById('legendToggleBtn');
            const content = document.getElementById('legendContent');
            const icon = document.getElementById('legendToggleIcon');
            const title = toggleBtn.querySelector('h4');
            
            if(toggleBtn) {
                toggleBtn.onclick = () => {
                    if (content.style.display === 'none') {
                        content.style.display = 'block';
                        icon.textContent = '🙈';
                        title.textContent = 'Sembunyikan Legenda';
                    } else {
                        content.style.display = 'none';
                        icon.textContent = '👁️';
                        title.textContent = 'Tampilkan Legenda';
                    }
                };
            }
            const setupToggle = (id, group) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.onclick = () => {
                    if (map.hasLayer(group)) {
                        map.removeLayer(group);
                        el.style.opacity = '0.35';
                    } else {
                        map.addLayer(group);
                        el.style.opacity = '1';
                    }
                };
            };
            setupToggle('filter-aws', awsGroup);
            setupToggle('filter-arg', argGroup);
            setupToggle('filter-aaws', aawsGroup);
        }, 50);

        return div;
    };
    legend.addTo(map);

    setTimeout(() => map.invalidateSize(), 300);
}

function renderRainfallChart(data) {
    const ctx = document.getElementById('rainfallChart').getContext('2d');

    const colors = data.map(d => {
        const r = d.total_rainfall;
        if (r > 100) return '#7c3aed';
        if (r > 50) return '#ef4444';
        if (r > 20) return '#f97316';
        return '#22c55e';
    });

    rainfallChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.name.replace('AWS ', '').replace('ARG ', '').replace('AAWS ', '')),
            datasets: [{
                label: 'Curah Hujan (mm)',
                data: data.map(d => d.total_rainfall || 0),
                backgroundColor: colors,
                borderRadius: 6,
                borderSkipped: false,
                barThickness: 28,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleFont: { family: 'Inter' },
                    bodyFont: { family: 'Inter' },
                    cornerRadius: 8,
                    padding: 12,
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(148,163,184,0.1)' },
                    ticks: {
                        font: { family: 'Inter', size: 11 },
                        color: '#94a3b8'
                    },
                    title: {
                        display: true,
                        text: 'Curah Hujan (mm)',
                        font: { family: 'Inter', size: 11 },
                        color: '#94a3b8'
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { family: 'Inter', size: 10 },
                        color: '#94a3b8',
                        maxRotation: 45,
                        minRotation: 25
                    }
                }
            }
        }
    });
}

function renderStationCards(stations) {
    const grid = document.getElementById('stationCardsGrid');
    const label = document.getElementById('stationCountLabel');

    // Shuffle stations but show up to 8 random ones
    const shuffled = [...stations].sort(() => Math.random() - 0.5);
    const displayed = shuffled.slice(0, 8);

    if (label) {
        label.textContent = `(${displayed.length} dari ${stations.length} stasiun)`;
    }

    grid.innerHTML = displayed.map(s => {
        const isOnline = s.status !== 'Offline';
        const statusColor = s.status.includes('Alert') ? 'var(--danger)' :
            s.status.includes('Warning') ? 'var(--warning)' :
                s.status === 'Offline' ? 'var(--gray-400)' : 'var(--success)';
        const statusDotClass = s.status === 'Offline' ? 'offline' : 'online';
        const statusLabel = s.status || 'Unknown';

        const rrQC = checkDataQC('rr', s.latest_rr);
        const tempQC = checkDataQC('temp', s.latest_temp || s.latest_log_temp);
        const battQC = checkDataQC('batt', s.latest_batt);

        return `
        <div class="station-card type-${s.type.toLowerCase()}" onclick="focusStationOnMap(${s.latitude}, ${s.longitude}, '${s.id}')" data-type="${s.type}" data-status="${s.status || 'Unknown'}">
            <div class="station-card-header">
                <span class="badge-type ${s.type.toLowerCase()}">${s.type}</span>
                <span class="slc-status">
                    <span class="status-dot ${statusDotClass}" style="background:${statusColor};${isOnline ? 'box-shadow:0 0 6px ' + statusColor : ''}"></span>
                    <span style="color: ${statusColor}; font-size: 0.7rem">${statusLabel}</span>
                </span>
            </div>
            <div class="station-card-name">${s.name}</div>
            <div class="station-card-meta">📍 ${s.location}</div>
            <div class="station-metrics">
                <div class="metric-circle ${!rrQC.valid ? 'qc-warning' : ''}" title="${!rrQC.valid ? rrQC.message : ''}">
                    ${createCircleProgress(s.latest_rr || 0, 100, rrQC.valid ? getTypeColor(s.type) : '#ef4444')}
                    <div class="metric-label">Curah Hujan<br>(mm) ${!rrQC.valid ? '⚠️' : ''}</div>
                    <div style="font-size:0.6rem; font-weight:700; color:${getRainfallCategory(s.latest_rr).color}; text-align:center; margin-top:2px;">${getRainfallCategory(s.latest_rr).label}</div>
                </div>
                ${s.type === 'ARG' ? `
                <div class="metric-circle ${!tempQC.valid ? 'qc-warning' : ''}" title="${!tempQC.valid ? tempQC.message : ''}">
                    ${createCircleProgress(s.latest_log_temp || 0, 40, tempQC.valid ? '#f97316' : '#ef4444')}
                    <div class="metric-label">Log Temp (°C) ${!tempQC.valid ? '⚠️' : ''}</div>
                </div>
                <div class="metric-circle ${!battQC.valid ? 'qc-warning' : ''}" title="${!battQC.valid ? battQC.message : ''}">
                    ${createCircleProgress(s.latest_batt || 0, 15, battQC.valid ? '#eab308' : '#ef4444')}
                    <div class="metric-label">Baterai (V) ${!battQC.valid ? '⚠️' : ''}</div>
                </div>
                ` : `
                <div class="metric-circle ${!tempQC.valid ? 'qc-warning' : ''}" title="${!tempQC.valid ? tempQC.message : ''}">
                    ${createCircleProgress(s.latest_temp || 0, 40, tempQC.valid ? '#f97316' : '#ef4444')}
                    <div class="metric-label">Suhu (°C) ${!tempQC.valid ? '⚠️' : ''}</div>
                </div>
                <div class="metric-circle">
                    ${createCircleProgress(s.latest_rh || 0, 100, '#06b6d4')}
                    <div class="metric-label">Kelembapan<br>(%)</div>
                </div>
                `}
            </div>
        </div>
        `;
    }).join('');
}

function setupFilters() {
    document.querySelectorAll('.filter-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const type = btn.dataset.filter;
            const filtered = type === 'all' ? allStations : allStations.filter(s => s.type === type);
            renderStationCards(filtered);
        });
    });
}

window.focusStationOnMap = function(lat, lng, id) {
    if (map && lat && lng) {
        map.setView([lat, lng], 13, { animate: true });
        if (appMarkers[id]) {
            appMarkers[id].openPopup();
        }
        const mapEl = document.getElementById('map');
        if (mapEl) {
            mapEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
};

let isDashboardDirty = false;

// UI Auto-Refresh Loop (Maksimal 1 kali per menit)
setInterval(() => {
    if (isDashboardDirty) {
        // Render UI Cards
        const typeBtn = document.querySelector('.filter-pill.active');
        const type = typeBtn ? typeBtn.dataset.filter : 'all';
        const filtered = type === 'all' ? allStations : allStations.filter(s => s.type === type);
        renderStationCards(filtered);

        // Refresh summary stats
        API.get('/api/dashboard/summary').then(s => renderSummary(s, allStations)).catch(() => { });

        isDashboardDirty = false;
    }
}, 60000); // 60.000 ms = 1 Menit

// Fallback polling every 5 minutes (in case WebSocket disconnects)
setInterval(async () => {
    try {
        const [summary, stations] = await Promise.all([
            API.get('/api/dashboard/summary'),
            API.get('/api/stations')
        ]);
        allStations = stations;
        renderSummary(summary, stations);
        const typeBtn = document.querySelector('.filter-pill.active');
        const type = typeBtn ? typeBtn.dataset.filter : 'all';
        const filtered = type === 'all' ? allStations : allStations.filter(s => s.type === type);
        renderStationCards(filtered);
    } catch (e) { /* silent */ }
}, 300000); // 5 minutes

// Real-time handlers
function handleRealtimeUpdate(data) {
    // 1. Update data lokal di memory tanpa merender UI secara langsung
    const stationIndex = allStations.findIndex(s => s.id === data.station_id);
    if (stationIndex !== -1) {
        if (data.rr !== undefined) allStations[stationIndex].latest_rr = data.rr;
        if (data.realtime_rr !== undefined) allStations[stationIndex].realtime_rr = data.realtime_rr;
        if (data.temp !== undefined) allStations[stationIndex].latest_temp = data.temp;
        if (data.rh !== undefined) allStations[stationIndex].latest_rh = data.rh;
        if (data.ws !== undefined) allStations[stationIndex].latest_ws = data.ws;
        if (data.log_temp !== undefined) allStations[stationIndex].latest_log_temp = data.log_temp;
        if (data.batt !== undefined) allStations[stationIndex].latest_batt = data.batt;
        
        isDashboardDirty = true; // Tandai bahwa ada data baru yang butuh dirender nanti

        // 2. Update Hujan Tertinggi Saat Ini in real-time instantly
        let maxRain = 0;
        let maxStationName = '-';
        allStations.forEach(s => {
            const rr = s.realtime_rr || 0;
            if (rr >= maxRain) {
                maxRain = rr;
                maxStationName = s.name;
            }
        });
        const maxRainfallEl = document.getElementById('maxRainfall');
        const maxRainfallStationEl = document.getElementById('maxRainfallStation');
        if (maxRainfallEl && maxRainfallStationEl) {
            maxRainfallEl.innerHTML = `${formatNumber(maxRain)} <span style="font-size:0.9rem;font-weight:400">mm</span>`;
            maxRainfallStationEl.textContent = `📍 ${maxStationName}`;
        }
    }

    // Flash the station card untuk efek realtime visual (hanya CSS outline, tidak me-render ulang seluruh elemen)
    setTimeout(() => {
        const card = document.querySelector(`[onclick*="${data.station_id}"]`);
        if (card) {
            card.style.boxShadow = '0 0 20px rgba(37, 99, 235, 0.9)';
            card.style.transition = 'box-shadow 0.3s ease';
            setTimeout(() => { card.style.boxShadow = ''; }, 2000);
        }
    }, 100);
}

let notifications = JSON.parse(localStorage.getItem('weather_notifications') || '[]');

function loadPersistedNotifications() {
    renderNotifications();
}

function handleRealtimeAlert(alert) {
    console.log('[Alert]', alert);
    const newNotif = {
        id: Date.now(),
        station_name: alert.station_name || 'Stasiun',
        message: alert.message || `Curah hujan tinggi terdeteksi di ${alert.station_name || 'lokasi'}`,
        severity: alert.severity || 'WASPADA',
        time: new Date().toISOString()
    };
    notifications.unshift(newNotif);
    if (notifications.length > 20) notifications = notifications.slice(0, 20); // max 20
    localStorage.setItem('weather_notifications', JSON.stringify(notifications));
    renderNotifications();
    
    // Add visual cue
    const badge = document.getElementById('notifBadge');
    if (badge) {
        badge.style.display = 'flex';
        badge.textContent = notifications.length;
        badge.classList.add('pulse');
        setTimeout(() => badge.classList.remove('pulse'), 2000);
    }
}

function renderNotifications() {
    const notifBody = document.getElementById('notifBody');
    const badge = document.getElementById('notifBadge');
    
    if (!notifBody) return;
    
    if (notifications.length === 0) {
        notifBody.innerHTML = '<div class="notif-empty" style="padding: 15px; text-align: center; color: var(--text-muted);">Tidak ada peringatan saat ini</div>';
        if (badge) badge.style.display = 'none';
        return;
    }
    
    if (badge) {
        badge.style.display = 'flex';
        badge.textContent = notifications.length;
    }
    
    let html = '';
    notifications.forEach(n => {
        const color = n.severity === 'AWAS' ? '#ef4444' : (n.severity === 'SIAGA' ? '#f97316' : '#eab308');
        html += `
            <div class="notif-item" style="padding: 12px; border-bottom: 1px solid var(--border-color);">
                <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
                    <strong style="color: ${color}; font-size: 0.85rem;">${n.severity}</strong>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${timeAgo(n.time)}</span>
                </div>
                <div style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">${n.station_name}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">${n.message}</div>
            </div>
        `;
    });
    // Add a clear button at the end
    html += `
        <div style="text-align: center; padding: 10px; background: var(--bg-card); border-top: 1px solid var(--border-color); border-radius: 0 0 8px 8px;">
            <button onclick="clearNotifications()" style="background:none; border:none; color: #ef4444; cursor:pointer; font-size: 0.85rem; font-weight: 600;">Hapus Semua Notifikasi</button>
        </div>
    `;
    notifBody.innerHTML = html;
}

window.clearNotifications = function() {
    notifications = [];
    localStorage.setItem('weather_notifications', JSON.stringify([]));
    renderNotifications();
};

const notifBtn = document.getElementById('notifBtn');
if (notifBtn) {
    notifBtn.addEventListener('click', () => {
        const dropdown = document.getElementById('notifDropdown');
        if (dropdown) dropdown.classList.toggle('show');
    });
}
// --- Modal Peringkat Cuaca Ekstrem ---
const extremeBtn = document.getElementById('extremeBtn');
const extremeModal = document.getElementById('extremeModal');
const closeExtremeModal = document.getElementById('closeExtremeModal');
const extremeList = document.getElementById('extremeList');
const extremeStory = document.getElementById('extremeStory');

if (extremeBtn) {
    extremeBtn.addEventListener('click', async () => {
        extremeModal.classList.add('show');
        extremeList.innerHTML = '<div style="text-align:center; padding: 20px;">Memuat data...</div>';
        if (extremeStory) extremeStory.innerHTML = 'Memuat ringkasan analitik...';
        
        try {
            const res = await fetch('/api/extreme-weather');
            const data = await res.json();
            
            if (data.length === 0) {
                extremeList.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Belum ada data ekstrem 30 hari terakhir.</div>';
                if (extremeStory) extremeStory.style.display = 'none';
                return;
            }
            
            if (extremeStory) extremeStory.style.display = 'block';
            let html = '';
            
            // Generate Story
            const topStation = data[0];
            let impact = '';
            if (topStation.max_rainfall > 100) impact = 'sangat lebat yang berpotensi memicu bencana banjir bandang atau longsor';
            else if (topStation.max_rainfall >= 50) impact = 'lebat yang berpotensi memicu genangan air atau pohon tumbang';
            else impact = 'sedang hingga lebat yang perlu diwaspadai';
            
            if (extremeStory) {
                extremeStory.innerHTML = `💡 <strong>Analitik Cerdas:</strong> Dalam 30 hari terakhir, wilayah <strong>${topStation.location} (${topStation.station_name})</strong> menjadi titik paling rawan. Stasiun ini mencatatkan curah hujan tertinggi mencapai <strong>${topStation.max_rainfall} mm</strong>, masuk dalam kategori hujan ${impact}.`;
            }

            data.forEach((st, idx) => {
                const rankClass = idx < 3 ? `rank-${idx+1}` : '';
                
                // Wording Label
                let labelHtml = '';
                if (st.max_rainfall > 100) {
                    labelHtml = `<div style="font-size: 0.75rem; color: #ef4444; margin-top: 4px;">🚨 Sangat Lebat (Siaga Banjir)</div>`;
                } else if (st.max_rainfall >= 50) {
                    labelHtml = `<div style="font-size: 0.75rem; color: #f59e0b; margin-top: 4px;">⚠️ Lebat (Waspada Genangan)</div>`;
                } else {
                    labelHtml = `<div style="font-size: 0.75rem; color: #10b981; margin-top: 4px;">🟢 Sedang (Kategori Aman)</div>`;
                }

                html += `
                    <div class="extreme-item ${rankClass}">
                        <div class="rank">#${idx + 1}</div>
                        <div class="extreme-info">
                            <div class="extreme-name">${st.station_name}</div>
                            <div class="extreme-loc">${st.location}</div>
                            ${labelHtml}
                        </div>
                        <div class="extreme-value" style="display:flex; flex-direction:column; justify-content:center; align-items:flex-end;">
                            <div>${st.max_rainfall} <small>mm</small></div>
                        </div>
                    </div>
                `;
            });
            extremeList.innerHTML = html;
        } catch (e) {
            extremeList.innerHTML = '<div style="text-align:center; padding: 20px; color: #ef4444;">Gagal memuat data. Pastikan InfluxDB aktif.</div>';
            if (extremeStory) extremeStory.innerHTML = 'Gagal memuat analitik.';
            console.error('Error fetching extreme weather:', e);
        }
    });
}

if (closeExtremeModal) {
    closeExtremeModal.addEventListener('click', () => {
        extremeModal.classList.remove('show');
    });
    extremeModal.addEventListener('click', (e) => {
        if (e.target === extremeModal) extremeModal.classList.remove('show');
    });
}
