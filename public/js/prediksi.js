/**
 * Prediksi Curah Hujan Page Logic
 * Interactive Leaflet map with real station coordinates,
 * date picker, type/region filters, bar chart, category distribution
 */

let predMap, rainfallBarChart;
let allPredictions = [];
let currentDay = 0;
let mapMarkers = [];

document.addEventListener('DOMContentLoaded', () => {
    initDatePicker();
    generateDayTabs();
    loadRegions();
    loadPredictions();
    loadModelPerformance();
    setupFilters();
});

// ─── Date Picker ───────────────────────────────────
function initDatePicker() {
    const picker = document.getElementById('datePicker');
    const today = new Date();
    picker.value = today.toISOString().split('T')[0];
    picker.min = today.toISOString().split('T')[0];
    const maxDate = new Date(today.getTime() + 7 * 86400000);
    picker.max = maxDate.toISOString().split('T')[0];

    picker.addEventListener('change', () => {
        const selected = new Date(picker.value);
        const diff = Math.round((selected - today) / 86400000);
        currentDay = Math.max(0, Math.min(7, diff));
        // Update active day tab
        document.querySelectorAll('.day-tab').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.day) === currentDay);
        });
        loadPredictions();
    });
}

// ─── Day Tabs ──────────────────────────────────────
function generateDayTabs() {
    const container = document.getElementById('dayTabs');
    const days = [];
    const today = new Date();
    for (let i = 0; i < 8; i++) {
        const date = new Date(today.getTime() + i * 86400000);
        const dayName = i === 0 ? 'Hari Ini' : date.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short' });
        const dateStr = date.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' });
        days.push({ index: i, label: `${dayName}, ${dateStr}` });
    }

    container.innerHTML = days.map(d => `
        <button class="day-tab ${d.index === 0 ? 'active' : ''}" data-day="${d.index}">${d.label}</button>
    `).join('');

    container.querySelectorAll('.day-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.day-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDay = parseInt(btn.dataset.day);
            // Sync date picker
            const newDate = new Date(Date.now() + currentDay * 86400000);
            document.getElementById('datePicker').value = newDate.toISOString().split('T')[0];
            loadPredictions();
        });
    });
}

// ─── Load Regions for Filter ───────────────────────
async function loadRegions() {
    try {
        const regions = await API.get('/api/regions');
        const sel = document.getElementById('regionFilter');
        regions.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = r;
            sel.appendChild(opt);
        });
    } catch (e) {
        console.error('Failed to load regions:', e);
    }
}

// ─── Setup Filters ─────────────────────────────────
function setupFilters() {
    document.getElementById('typeFilter').addEventListener('change', () => {
        loadPredictions();
        loadModelPerformance();
    });
    document.getElementById('regionFilter').addEventListener('change', loadPredictions);
}

// ─── Load Predictions ──────────────────────────────
async function loadPredictions() {
    try {
        const stationType = document.getElementById('typeFilter').value;
        const region = document.getElementById('regionFilter').value;

        let params = [`day=${currentDay}`];
        if (stationType !== 'all') params.push(`station_type=${stationType}`);
        if (region !== 'all') params.push(`region=${encodeURIComponent(region)}`);

        allPredictions = await API.get(`/api/predictions?${params.join('&')}`);

        renderSummaryStats(allPredictions);
        renderPredictionMap(allPredictions);
        renderPredictionTable(allPredictions);
        renderRainfallBarChart(allPredictions);
        renderCategoryDistribution(allPredictions);

        // Update subtitle
        const targetDate = new Date(Date.now() + currentDay * 86400000);
        document.getElementById('tableSubtitle').textContent =
            `Prediksi untuk ${targetDate.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
    } catch (e) {
        console.error('Failed to load predictions:', e);
    }
}

// ─── Summary Stats ─────────────────────────────────
function renderSummaryStats(predictions) {
    const total = predictions.length;
    const highRisk = predictions.filter(p =>
        p.category === 'LEBAT' || p.category === 'SANGAT LEBAT').length;

    // Max rainfall prediction
    const maxRf = total > 0
        ? Math.max(...predictions.map(p => p.predicted_rainfall)).toFixed(1) : '0';

    // Affected regions (unique regions with heavy rain)
    const affectedRegions = new Set(
        predictions.filter(p => p.predicted_rainfall > 50).map(p => p.region)
    ).size;

    document.getElementById('sumStations').textContent = total;
    document.getElementById('sumHighRisk').textContent = highRisk;
    document.getElementById('sumMaxRainfall').textContent = maxRf;
    document.getElementById('sumAffectedRegions').textContent = affectedRegions;
}

// ─── Interactive Leaflet Map ───────────────────────
function renderPredictionMap(predictions) {
    if (!predMap) {
        predMap = L.map('predictionMap', {
            zoomControl: true,
            scrollWheelZoom: true
        }).setView([-6.9, 107.6], 8);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; CartoDB',
            maxZoom: 18
        }).addTo(predMap);

        setTimeout(() => predMap.invalidateSize(), 300);
    }

    // Clear old markers
    mapMarkers.forEach(m => predMap.removeLayer(m));
    mapMarkers = [];

    predictions.forEach(p => {
        if (!p.latitude || !p.longitude) return;

        const color = getCategoryColor(p.category);
        const radius = 6 + Math.min(p.predicted_rainfall / 15, 10);

        const marker = L.circleMarker([p.latitude, p.longitude], {
            radius: radius,
            fillColor: color,
            color: '#fff',
            weight: 2,
            fillOpacity: 0.85
        }).addTo(predMap);

        const confColor = p.confidence >= 85 ? '#22c55e' : p.confidence >= 70 ? '#eab308' : '#ef4444';

        marker.bindPopup(`
            <div style="min-width:200px;font-family:Inter,sans-serif">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                    <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.68rem;font-weight:700;color:#fff;background:${getTypeColor(p.station_type)}">${p.station_type}</span>
                    <strong style="font-size:0.9rem">${p.station_name}</strong>
                </div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px"><i class="ri-map-pin-line"></i> ${p.location}${p.elevation > 0 ? ` • ${p.elevation}m asl` : ''}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                    <div style="background:var(--bg-main);border-radius:6px;padding:8px;text-align:center">
                        <div style="font-size:0.68rem;color:var(--text-muted)">PREDIKSI</div>
                        <div style="font-size:1.2rem;font-weight:800;color:${color}">${formatNumber(p.predicted_rainfall)} mm</div>
                    </div>
                    <div style="background:var(--bg-main);border-radius:6px;padding:8px;text-align:center">
                        <div style="font-size:0.68rem;color:var(--text-muted)">KATEGORI</div>
                        <div style="font-size:0.82rem;font-weight:700;color:${color}">${p.category}</div>
                    </div>
                </div>
                <div style="margin-top:8px;font-size:0.78rem;display:flex;align-items:center;gap:6px">
                    <span>Confidence:</span>
                    <strong style="color:${confColor}">${formatNumber(p.confidence)}%</strong>
                    <div style="flex:1;height:4px;background:rgba(148,163,184,0.15);border-radius:2px;overflow:hidden">
                        <div style="width:${p.confidence}%;height:100%;background:${confColor};border-radius:2px"></div>
                    </div>
                </div>
                <div style="margin-top:8px;text-align:center">
                    <a href="/detail.html?id=${p.station_id}" style="color:#2563eb;font-weight:600;font-size:0.78rem">Lihat Detail Stasiun →</a>
                </div>
            </div>
        `);

        mapMarkers.push(marker);
    });
}

// ─── Prediction Table ──────────────────────────────
function renderPredictionTable(predictions) {
    const tbody = document.getElementById('predictionBody');
    if (predictions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)"><i class="ri-sun-cloudy-line"></i> Belum ada data prediksi untuk parameter yang dipilih</td></tr>';
        return;
    }

    tbody.innerHTML = predictions.map((p, i) => {
        const rfClass = getRainfallClass(p.predicted_rainfall);
        const catClass = getCategoryClass(p.category);
        const confColor = p.confidence >= 85 ? 'var(--success)' : p.confidence >= 70 ? 'var(--warning)' : 'var(--danger)';

        return `
        <tr style="cursor:pointer" onclick="focusStation(${p.latitude}, ${p.longitude})">
            <td style="font-weight:600;color:var(--text-muted)">${String(i + 1).padStart(2, '0')}</td>
            <td>
                <div style="font-weight:600">${p.station_name}</div>
                <div style="font-size:0.7rem;color:var(--text-muted)"><i class="ri-map-pin-line"></i> ${p.location}</div>
            </td>
            <td><span class="type-badge type-${p.station_type.toLowerCase()}">${p.station_type}</span></td>
            <td class="rainfall-value ${rfClass}">${formatNumber(p.predicted_rainfall)} mm</td>
            <td><span class="badge-category ${catClass}">${p.category}</span></td>
            <td>
                <span style="font-weight:600;color:${confColor}">${formatNumber(p.confidence)}%</span>
                <div class="confidence-bar">
                    <div class="confidence-fill" style="width:${p.confidence}%;background:${confColor}"></div>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

function getRainfallClass(rainfall) {
    if (rainfall > 100) return 'sangat-lebat';
    if (rainfall > 50) return 'lebat';
    if (rainfall > 20) return 'sedang';
    return 'ringan';
}

window.focusStation = function(lat, lng) {
    if (predMap && lat && lng) {
        predMap.setView([lat, lng], 12, { animate: true });
        
        // Find marker with this lat/lng and open popup
        if (mapMarkers) {
            mapMarkers.forEach(m => {
                const pos = m.getLatLng();
                if (Math.abs(pos.lat - lat) < 0.0001 && Math.abs(pos.lng - lng) < 0.0001) {
                    m.openPopup();
                }
            });
        }

        // Scroll smoothly to map so mobile users see the map
        const mapEl = document.getElementById('predictionMap');
        if (mapEl) {
            mapEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
};

// ─── Rainfall Bar Chart ────────────────────────────
function renderRainfallBarChart(predictions) {
    const ctx = document.getElementById('rainfallBarChart').getContext('2d');

    if (rainfallBarChart) {
        rainfallBarChart.destroy();
    }

    // Take top 20 for readability
    const top = predictions.slice(0, 20);
    const labels = top.map(p => p.station_name.replace('AWS ', '').replace('ARG ', '').replace('AAWS ', ''));
    const data = top.map(p => p.predicted_rainfall);
    const colors = top.map(p => getCategoryColor(p.category));

    rainfallBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Prediksi Curah Hujan (mm)',
                data,
                backgroundColor: colors.map(c => c + '99'),
                borderColor: colors,
                borderWidth: 1.5,
                borderRadius: 5,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleFont: { family: 'Inter' },
                    bodyFont: { family: 'Inter' },
                    cornerRadius: 8,
                    padding: 12,
                    callbacks: {
                        label: ctx => `${ctx.raw} mm`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: 'rgba(148,163,184,0.1)' },
                    ticks: { font: { family: 'Inter', size: 10 }, color: '#94a3b8' },
                    title: { display: true, text: 'Curah Hujan (mm)', font: { family: 'Inter', size: 11 }, color: '#94a3b8' }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { family: 'Inter', size: 10 }, color: '#94a3b8' }
                }
            }
        }
    });
}

// ─── Category Distribution ─────────────────────────
function renderCategoryDistribution(predictions) {
    const container = document.getElementById('categoryDist');
    const total = predictions.length || 1;

    const categories = [
        { name: 'Ringan', key: 'RINGAN', color: '#22c55e', range: '0 – 20 mm' },
        { name: 'Sedang', key: 'SEDANG', color: '#f97316', range: '20 – 50 mm' },
        { name: 'Lebat', key: 'LEBAT', color: '#ef4444', range: '50 – 100 mm' },
        { name: 'Sangat Lebat', key: 'SANGAT LEBAT', color: '#7c3aed', range: '> 100 mm' },
    ];

    container.innerHTML = categories.map(cat => {
        const count = predictions.filter(p => p.category === cat.key).length;
        const pct = ((count / total) * 100).toFixed(0);

        return `
        <div class="cat-dist-item">
            <div class="cat-dist-dot" style="background:${cat.color}"></div>
            <div style="flex:1">
                <div class="cat-dist-info">
                    <span class="cat-dist-name" style="color:${cat.color}">${cat.name}</span>
                    <span class="cat-dist-count">${count} stasiun (${pct}%)</span>
                </div>
                <div class="cat-dist-bar">
                    <div class="cat-dist-fill" style="width:${pct}%;background:${cat.color}"></div>
                </div>
                <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px">${cat.range}</div>
            </div>
        </div>
        `;
    }).join('');
}

let modelMetricsData = null;

async function loadModelPerformance() {
    try {
        if (!modelMetricsData) {
            modelMetricsData = await API.get('/api/model-performance');
        }
        
        const stationType = document.getElementById('typeFilter').value;
        let perf;
        if (stationType === 'all' || !modelMetricsData[stationType]) {
            perf = modelMetricsData['AWS'];
        } else {
            perf = modelMetricsData[stationType];
        }

        if (document.getElementById('perfRmse')) document.getElementById('perfRmse').textContent = formatNumber(perf.rmse);
        if (document.getElementById('perfMae')) document.getElementById('perfMae').textContent = formatNumber(perf.mae);
        if (document.getElementById('perfR2')) {
            document.getElementById('perfR2').textContent = formatNumber(perf.r2, 3);
            if (document.getElementById('perfR2Change')) {
                document.getElementById('perfR2Change').innerHTML = perf.r2 >= 0 ? '<i class="ri-check-line"></i> Positive Fit' : '<i class="ri-alert-line"></i> Negative Fit';
                document.getElementById('perfR2Change').style.color = perf.r2 >= 0 ? 'var(--success)' : 'var(--warning)';
            }
        }
        
        if (document.getElementById('perfPod')) document.getElementById('perfPod').textContent = formatNumber(perf.pod, 3);
        if (document.getElementById('perfFar')) document.getElementById('perfFar').textContent = formatNumber(perf.far, 3);
        if (document.getElementById('perfCsi')) document.getElementById('perfCsi').textContent = formatNumber(perf.csi, 3);

    } catch (e) {
        console.error('Failed to load model performance:', e);
    }
}

