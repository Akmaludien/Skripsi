// Global state for chart rendering
let fullHistory = [];
let currentChartType = 'all';
let currentChartTime = 24;
let _mainChartInstance = null;

function renderNewWidgets(station, data) {
    const grid = document.getElementById('metricsGrid');
    if (!grid) return;

    // FIX: Override default 4-column grid from summary-grid class
    grid.style.display = 'block';

    const fNum = val => val === undefined || val === null ? '--' : Number(val).toFixed(1);
    
    // Helper functions
    const getCardinalDirection = (angle) => {
        if (angle === undefined || angle === null) return '--';
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        return directions[Math.round(angle / 45) % 8];
    };
    
    // Apparent Temperature (Australian / BMKG)
    const calculateApparentTemp = (temp, rh, ws) => {
        if (temp === undefined || temp === null) return temp;
        // Hitung tekanan uap air (vapor pressure)
        const e = (rh / 100) * 6.105 * Math.exp((17.27 * temp) / (237.7 + temp));
        // Hitung Apparent Temperature
        let apparentTemp = temp + (0.33 * e) - (0.70 * ws) - 4.0;
        
        return apparentTemp;
    };

    const getHumidityDesc = (rh) => {
        if (rh < 40) return 'Kering';
        if (rh <= 60) return 'Nyaman';
        if (rh <= 80) return 'Lembap — cukup nyaman';
        return 'Sangat Lembap';
    };

    const getPressureDesc = (press) => {
        if (press < 1005) return 'Rendah';
        if (press > 1015) return 'Tinggi';
        return 'Normal — stabil';
    };

    const getBeaufort = (ms) => {
        if (ms < 0.5) return { scale: 0, desc: 'Tenang', width: '0%' };
        if (ms < 1.5) return { scale: 1, desc: 'Udara Mengalir', width: '8%' };
        if (ms < 3.3) return { scale: 2, desc: 'Sepoi-sepoi', width: '16%' };
        if (ms < 5.5) return { scale: 3, desc: 'Angin Lemah', width: '25%' };
        if (ms < 7.9) return { scale: 4, desc: 'Angin Sedang', width: '33%' };
        if (ms < 10.7) return { scale: 5, desc: 'Angin Segar', width: '41%' };
        if (ms < 13.8) return { scale: 6, desc: 'Angin Kuat', width: '50%' };
        if (ms < 17.1) return { scale: 7, desc: 'Kencang', width: '58%' };
        if (ms < 20.7) return { scale: 8, desc: 'Sangat Kencang', width: '66%' };
        return { scale: 9, desc: 'Badai', width: '80%' };
    };

    const getSolarDesc = (sr) => {
        if (sr < 10) return { cond: 'Malam/Gelap', active: 0 };
        if (sr < 200) return { cond: 'Berawan/Rendah', active: 1 };
        if (sr < 600) return { cond: 'Cerah/Sedang', active: 2 };
        return { cond: 'Terik/Tinggi', active: 3 };
    };

    const isARG = station.type === 'ARG';
    const tempVal = Number(data.temp || data.log_temp || 0);
    const rainVal = Number(data.rr || 0);
    const battPcnt = Math.min(100, Math.max(0, ((data.batt || 12) - 10.5) / (13.8 - 10.5) * 100));
    
    let metricsHTML = '';
    
    if (isARG) {
        metricsHTML = `
        <div class="metrics-grid-v2-arg">
            <!-- Suhu Widget -->
            <div class="metric-card-v2 accent-orange">
                <div class="metric-v2-header">🌡️ Suhu Logger</div>
                <div class="metric-v2-value">${fNum(tempVal)}<span>°C</span></div>
                <div class="metric-v2-subtitle">Suhu sistem normal</div>
                <div>
                    <div class="metric-v2-progress"><div class="metric-v2-progress-fill orange" style="width: ${Math.min(100, tempVal/50*100)}%;"></div></div>
                    <div class="metric-v2-range"><span>0°</span><span>50°</span></div>
                </div>
            </div>
            
            <!-- Curah Hujan Widget -->
            <div class="metric-card-v2 accent-blue">
                <div class="metric-v2-header">🌧️ Curah Hujan</div>
                <div class="metric-v2-value">${fNum(rainVal)}<span>mm</span></div>
                <div class="metric-v2-subtitle" style="color: ${getRainfallCategory(rainVal).color};">☀ ${getRainfallCategory(rainVal).label}</div>
                <div>
                    <div class="metric-v2-progress"><div class="metric-v2-progress-fill blue" style="width: ${Math.min(100, rainVal)}%;"></div></div>
                    <div class="metric-v2-range"><span>0</span><span>100mm+</span></div>
                </div>
            </div>
            
            <!-- Power Status -->
            <div class="metric-card-v2 accent-green">
                <div class="metric-v2-header">⚡ Status Daya</div>
                <div class="power-list-v2" style="margin-top: 10px; flex: 1;">
                    <div class="power-item-v2"><span>Sumber</span><strong style="color: #10b981;">Panel Surya</strong></div>
                    <div class="power-item-v2"><span>Tegangan</span><strong>${fNum(data.batt)} V</strong></div>
                    <div class="power-item-v2"><span>Baterai</span><strong><div class="battery-bar-v2"><div class="battery-bar-fill-v2 green" style="width: ${battPcnt}%; background: #10b981;"></div></div> ${battPcnt.toFixed(0)}%</strong></div>
                </div>
            </div>
        </div>
        `;
    } else {
        const rhVal = Number(data.rh || 0);
        const pressVal = Number(data.press || 1000);
        const wsVal = Number(data.ws || 0);
        const heatIndex = calculateApparentTemp(tempVal, rhVal, wsVal);
        const wdVal = Number(data.wd || 0);
        const srVal = Number(data.sr || 0);
        
        const bf = getBeaufort(wsVal);
        const srDesc = getSolarDesc(srVal);

        metricsHTML = `
        <div class="metrics-grid-v2-top">
            <!-- Suhu -->
            <div class="metric-card-v2 accent-orange">
                <div class="metric-v2-header">🌡️ Suhu</div>
                <div class="metric-v2-value">${fNum(tempVal)}<span>°C</span></div>
                <div class="metric-v2-subtitle">Terasa seperti ${fNum(heatIndex)}°C</div>
                <div>
                    <div class="metric-v2-progress"><div class="metric-v2-progress-fill orange" style="width: ${Math.min(100, tempVal/50*100)}%;"></div></div>
                    <div class="metric-v2-range"><span>0°</span><span>50°</span></div>
                </div>
            </div>
            
            <!-- Kelembapan -->
            <div class="metric-card-v2 accent-green">
                <div class="metric-v2-header">💧 Kelembapan</div>
                <div class="metric-v2-value">${fNum(rhVal)}<span>%</span></div>
                <div class="metric-v2-subtitle">${getHumidityDesc(rhVal)}</div>
                <div>
                    <div class="metric-v2-progress"><div class="metric-v2-progress-fill green" style="width: ${Math.min(100, rhVal)}%;"></div></div>
                    <div class="metric-v2-range"><span>0%</span><span>100%</span></div>
                </div>
            </div>
            
            <!-- Curah Hujan -->
            <div class="metric-card-v2 accent-blue">
                <div class="metric-v2-header">🌧️ Curah Hujan</div>
                <div class="metric-v2-value">${fNum(rainVal)}<span>mm</span></div>
                <div class="metric-v2-subtitle" style="color: ${getRainfallCategory(rainVal).color};">☀ ${getRainfallCategory(rainVal).label}</div>
                <div>
                    <div class="metric-v2-progress"><div class="metric-v2-progress-fill blue" style="width: ${Math.min(100, rainVal)}%;"></div></div>
                    <div class="metric-v2-range"><span>0</span><span>100mm+</span></div>
                </div>
            </div>
            
            <!-- Tekanan -->
            <div class="metric-card-v2 accent-purple">
                <div class="metric-v2-header">🎯 Tekanan</div>
                <div class="metric-v2-value">${fNum(pressVal)}<span>hPa</span></div>
                <div class="metric-v2-subtitle">${getPressureDesc(pressVal)}</div>
                <div>
                    <div class="metric-v2-progress"><div class="metric-v2-progress-fill purple" style="width: ${Math.max(0, Math.min(100, (pressVal-950)/(1050-950)*100))}%;"></div></div>
                    <div class="metric-v2-range"><span>950</span><span>1050</span></div>
                </div>
            </div>
        </div>

        <div class="metrics-grid-v2-bottom">
            <!-- Wind -->
            <div class="metric-card-v2 wide-card">
                <div class="metric-v2-left" style="flex: 0.9;">
                    <div class="metric-v2-header" style="position:absolute; top:16px; left:20px;">🌬️ Angin</div>
                    <div style="width: 70px; height: 70px; border: 2px dashed rgba(148, 163, 184, 0.3); border-radius: 50%; position: relative; display: flex; align-items: center; justify-content: center; margin-top: 25px;">
                        <div style="position: absolute; top: -15px; font-size: 0.65rem; font-weight: 800; color: var(--text-muted);">N</div>
                        <div style="position: absolute; right: -12px; font-size: 0.65rem; font-weight: 800; color: var(--text-muted);">E</div>
                        <div style="position: absolute; bottom: -15px; font-size: 0.65rem; font-weight: 800; color: var(--text-muted);">S</div>
                        <div style="position: absolute; left: -15px; font-size: 0.65rem; font-weight: 800; color: var(--text-muted);">W</div>
                        <div style="width: 4px; height: 35px; background: linear-gradient(to top, transparent 50%, #f97316 50%); position: absolute; transform: rotate(${wdVal}deg); transition: transform 0.8s; border-radius: 2px; transform-origin: bottom center; top: 0px;"></div>
                        <div style="width: 8px; height: 8px; background: var(--bg-card); border: 2px solid #f97316; border-radius: 50%; z-index: 2;"></div>
                    </div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-primary); margin-top: 15px;">${fNum(wdVal)}° ${getCardinalDirection(wdVal)}</div>
                </div>
                <div class="metric-v2-right" style="flex: 1.1;">
                    <div class="metric-v2-value" style="font-size: 2.2rem;">${fNum(wsVal)}<span style="font-size:0.9rem;">m/s</span></div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;">Maks: ${fNum(data.ws_max || 0)} m/s</div>
                    <div style="font-size: 0.7rem; color: var(--text-secondary);">Skala Beaufort</div>
                    <div class="beaufort-bars">
                        <div class="b-bar ${bf.scale > 0 ? 'active' : ''}"></div>
                        <div class="b-bar ${bf.scale > 2 ? 'active' : ''}"></div>
                        <div class="b-bar ${bf.scale > 4 ? 'active' : ''}"></div>
                        <div class="b-bar ${bf.scale > 6 ? 'active' : ''}"></div>
                        <div class="b-bar ${bf.scale > 8 ? 'active' : ''}"></div>
                    </div>
                    <div style="font-size: 0.7rem; font-weight: 600;">${bf.desc}</div>
                </div>
            </div>

            <!-- Solar -->
            <div class="metric-card-v2 wide-card">
                <div class="metric-v2-left" style="flex: 0.9;">
                    <div class="metric-v2-header" style="position:absolute; top:16px; left:20px;">☀️ Radiasi Matahari</div>
                    <div style="width: 80px; height: 80px; border-radius: 50%; background: conic-gradient(#f59e0b ${Math.min(100, srVal/1000*100)}%, var(--gray-200) 0); display: flex; align-items: center; justify-content: center; margin-top: 20px; position: relative;">
                        <div style="width: 68px; height: 68px; background: var(--bg-card); border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <div style="font-size: 1.1rem; font-weight: 800; color: #f59e0b;">${fNum(srVal)}</div>
                            <div style="font-size: 0.6rem; font-weight: 600; color: var(--text-muted);">W/m²</div>
                        </div>
                    </div>
                </div>
                <div class="metric-v2-right" style="flex: 1.1;">
                    <div style="font-size: 0.7rem; color: var(--text-secondary);">Kondisi</div>
                    <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">${srDesc.cond}</div>
                    <div style="font-size: 0.7rem; color: var(--text-secondary);">Intensitas</div>
                    <div style="font-size: 0.7rem; font-weight: 500; color: var(--text-muted); display: flex; align-items: center; gap: 4px;"><span style="color: ${srDesc.active === 1 ? '#f59e0b' : 'var(--gray-300)'}">●</span> 0-200 Rendah</div>
                    <div style="font-size: 0.7rem; font-weight: 500; color: var(--text-muted); display: flex; align-items: center; gap: 4px;"><span style="color: ${srDesc.active === 2 ? '#f59e0b' : 'var(--gray-300)'}">●</span> 200-600 Sedang</div>
                    <div style="font-size: 0.7rem; font-weight: 500; color: var(--text-muted); display: flex; align-items: center; gap: 4px;"><span style="color: ${srDesc.active === 3 ? '#f59e0b' : 'var(--gray-300)'}">●</span> 600+ Tinggi</div>
                </div>
            </div>

            <!-- Power Status -->
            <div class="metric-card-v2">
                <div class="metric-v2-header">⚡ Status Daya</div>
                <div class="power-list-v2" style="margin-top: 15px; flex: 1;">
                    <div class="power-item-v2"><span>Sumber</span><strong style="color: #10b981;">Panel Surya</strong></div>
                    <div class="power-item-v2"><span>Tegangan</span><strong>${fNum(data.batt)} V</strong></div>
                    <div class="power-item-v2"><span>Baterai</span><strong><div class="battery-bar-v2"><div class="battery-bar-fill-v2 green" style="width: ${battPcnt}%; background: #10b981;"></div></div> ${battPcnt.toFixed(0)}%</strong></div>
                </div>
            </div>
        </div>
        `;
    }

    grid.innerHTML = metricsHTML;
}

function renderChart(station, history) {
    fullHistory = history || []; // Store globally for re-rendering
    window.currentStationType = station.type; // Save for updateChart logic
    updateChart();
    
    const pSelect = document.getElementById('chartParamSelect');
    const tSelect = document.getElementById('chartTimeSelect');
    
    if (pSelect) {
        pSelect.innerHTML = '<option value="all">Semua Parameter Utama</option>';
        if (station.type === 'ARG') {
            pSelect.innerHTML += '<option value="temp">Temperatur Logger (°C)</option>';
            pSelect.innerHTML += '<option value="rr">Curah Hujan (mm)</option>';
            pSelect.innerHTML += '<option value="batt">Baterai / Voltage (V)</option>';
        } else {
            // AWS & AAWS: identik — semua punya 9 parameter termasuk radiasi matahari
            pSelect.innerHTML += '<option value="temp">Suhu Udara (°C)</option>';
            pSelect.innerHTML += '<option value="rh">Kelembapan (%)</option>';
            pSelect.innerHTML += '<option value="rr">Curah Hujan (mm)</option>';
            pSelect.innerHTML += '<option value="press">Tekanan Udara (hPa)</option>';
            pSelect.innerHTML += '<option value="ws">Kecepatan Angin (m/s)</option>';
            pSelect.innerHTML += '<option value="wd">Arah Angin (°)</option>';
            pSelect.innerHTML += '<option value="sr">Radiasi Matahari (W/m²)</option>';
            pSelect.innerHTML += '<option value="batt">Baterai / Voltage (V)</option>';
        }
    }

    if(pSelect && !pSelect.hasAttribute('data-bound')) {
        pSelect.setAttribute('data-bound', 'true');
        pSelect.addEventListener('change', (e) => { currentChartType = e.target.value; updateChart(); });
    }
    if(tSelect && !tSelect.hasAttribute('data-bound')) {
        tSelect.setAttribute('data-bound', 'true');
        tSelect.addEventListener('change', async (e) => { 
            currentChartTime = parseFloat(e.target.value); 
            // If viewing > 24h, fetch more history
            if (currentChartTime > 24) {
                try {
                    const params = new URLSearchParams(window.location.search);
                    const stId = params.get('id');
                    const extendedHistory = await API.get(`/api/stations/${stId}/history?hours=${Math.ceil(currentChartTime)}`);
                    fullHistory = extendedHistory || [];
                } catch (err) { console.error('Failed to fetch extended history:', err); }
            }
            updateChart(); 
        });
    }
}

function updateChart() {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (_mainChartInstance) _mainChartInstance.destroy();

    const cutoff = Date.now() - (currentChartTime * 3600000);
    const filteredHistory = fullHistory.filter(d => new Date(d.timestamp).getTime() > cutoff);
    
    const labels = filteredHistory.map(d => {
        const date = new Date(d.timestamp);
        if (currentChartTime > 24) {
            return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' + 
                   date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    });

    const datasets = [];
    const colors = { 
        temp: '#f97316', rh: '#10b981', rr: '#3b82f6', press: '#8b5cf6', 
        sr: '#f59e0b', ws: '#06b6d4', wd: '#ef4444', batt: '#22c55e' 
    };
    const scales = { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } } };
    
    let sType = window.currentStationType || 'AWS';
    let isAll = currentChartType === 'all';

    try {
        // Shared parameters
        if (isAll || currentChartType === 'rr') {
            datasets.push({ label: 'Rainfall (mm)', data: filteredHistory.map(d => d.rr), type: 'bar', backgroundColor: 'rgba(59, 130, 246, 0.4)', borderColor: colors.rr, borderWidth: 1, yAxisID: 'yRain', order: 10 });
            scales.yRain = { type: 'linear', position: 'left', title: { display: true, text: 'Hujan (mm)' }, beginAtZero: true };
        }
        if (isAll || currentChartType === 'temp') {
            datasets.push({ label: 'Suhu (°C)', data: filteredHistory.map(d => d.temp || d.log_temp), type: 'line', borderColor: colors.temp, tension: 0.4, borderWidth: 2, pointRadius: 0, yAxisID: 'yTemp', order: 1 });
            scales.yTemp = { type: 'linear', position: 'right', title: { display: true, text: 'Suhu (°C)' } };
        }
        if (isAll || currentChartType === 'batt') {
            datasets.push({ label: 'Baterai (V)', data: filteredHistory.map(d => d.batt), type: 'line', borderColor: colors.batt, tension: 0.4, borderWidth: 1.5, pointRadius: 0, yAxisID: 'yBatt', order: 20 });
            scales.yBatt = { type: 'linear', position: 'left', title: { display: true, text: 'Baterai (V)' }, grid: { display: false } };
        }

        // AWS/AAWS specific
        if (sType !== 'ARG') {
            if (isAll || currentChartType === 'rh') {
                datasets.push({ label: 'Kelembapan (%)', data: filteredHistory.map(d => d.rh), type: 'line', borderColor: colors.rh, tension: 0.4, borderDash: [5, 5], borderWidth: 2, pointRadius: 0, yAxisID: 'yRh', order: 2 });
                scales.yRh = { type: 'linear', position: 'right', title: { display: true, text: 'RH (%)' }, grid: { display: false } };
            }
            if (isAll || currentChartType === 'press') {
                datasets.push({ label: 'Tekanan (hPa)', data: filteredHistory.map(d => d.press), type: 'line', borderColor: colors.press, tension: 0.4, borderWidth: 2, pointRadius: 0, yAxisID: 'yPress', order: 3 });
                scales.yPress = { type: 'linear', position: 'left', title: { display: true, text: 'Tekanan (hPa)' }, grid: { display: false } };
            }
            if (isAll || currentChartType === 'ws') {
                datasets.push({ label: 'Kec. Angin (m/s)', data: filteredHistory.map(d => d.ws), type: 'line', borderColor: colors.ws, tension: 0.4, borderWidth: 2, pointRadius: 0, yAxisID: 'yWs', order: 4 });
                scales.yWs = { type: 'linear', position: 'left', title: { display: true, text: 'Angin (m/s)' }, grid: { display: false } };
            }
            if (currentChartType === 'wd') {
                datasets.push({ label: 'Arah Angin (°)', data: filteredHistory.map(d => d.wd), type: 'scatter', backgroundColor: colors.wd, pointRadius: 4, yAxisID: 'yWd' });
                scales.yWd = { type: 'linear', position: 'right', min: 0, max: 360, title: { display: true, text: 'Arah (°)' } };
            }
            if (currentChartType === 'sr' || isAll) {
                // AWS & AAWS semua punya sensor radiasi matahari
                datasets.push({ label: 'Radiasi (W/m²)', data: filteredHistory.map(d => d.sr), type: 'line', borderColor: colors.sr, backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, yAxisID: 'ySr', order: 5 });
                scales.ySr = { type: 'linear', position: 'left', title: { display: true, text: 'Radiasi (W/m²)' }, beginAtZero: true, grid: { display: false } };
            }
        }

        _mainChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: true }, tooltip: { backgroundColor: '#1e293b' } },
                scales: scales
            }
        });
    } catch(e) { console.error('Chart init error:', e); }
}

// ─── 7-Day Prediction ──────────────────────────────
let predChart;

async function loadStationPredictions(stationId) {
    const alert = document.getElementById('floodRiskAlert');
    const icon = document.getElementById('floodIcon');
    const title = document.getElementById('floodTitle');
    const detail = document.getElementById('floodDetail');
    const tbody = document.getElementById('predDayBody');

    if (!alert || !tbody) return; // Feature not enabled in HTML

    try {
        // Fetch predictions for all 7 days for the station
        const allDayPreds = [];
        for (let d = 0; d < 7; d++) {
            try {
                const preds = await API.get(`/api/predictions?day=${d}`);
                const stationPred = preds.find(p => p.station_id === stationId);
                if (stationPred) {
                    stationPred._day = d;
                    allDayPreds.push(stationPred);
                } else {
                    allDayPreds.push({ _day: d, predicted_rainfall: 0, category: 'TIDAK HUJAN', confidence: 0, _empty: true });
                }
            } catch {
                allDayPreds.push({ _day: d, predicted_rainfall: 0, category: 'TIDAK HUJAN', confidence: 0, _empty: true });
            }
        }

        // Determine flood risk
        const maxRainfall = Math.max(...allDayPreds.map(p => p.predicted_rainfall));
        const heavyDays = allDayPreds.filter(p => p.predicted_rainfall > 50);
        const veryHeavyDays = allDayPreds.filter(p => p.predicted_rainfall > 100);

        if (veryHeavyDays.length > 0) {
            alert.style.background = 'rgba(239,68,68,0.12)';
            alert.style.border = '1px solid rgba(239,68,68,0.3)';
            icon.textContent = '🔴';
            title.textContent = 'BAHAYA – Potensi Banjir Tinggi!';
            title.style.color = '#ef4444';
            detail.textContent = `${veryHeavyDays.length} hari diprediksi curah hujan sangat lebat (maks ${formatNumber(maxRainfall)}mm). Waspadai banjir, longsor, dan genangan. Segera siapkan dan perika jalur evakuasi di sekitar stasiun.`;
        } else if (heavyDays.length > 0) {
            alert.style.background = 'rgba(249,115,22,0.12)';
            alert.style.border = '1px solid rgba(249,115,22,0.3)';
            icon.textContent = '🚨';
            title.textContent = 'SIAGA – Potensi Hujan Lebat';
            title.style.color = '#f97316';
            detail.textContent = `${heavyDays.length} hari diprediksi hujan lebat (maks ${formatNumber(maxRainfall)}mm). Waspadai genangan dan potensi banjir di daerah rawan.`;
        } else if (maxRainfall > 20) {
            alert.style.background = 'rgba(234,179,8,0.12)';
            alert.style.border = '1px solid rgba(234,179,8,0.3)';
            icon.textContent = '⚠️';
            title.textContent = 'WASPADA – Hujan Sedang';
            title.style.color = '#eab308';
            detail.textContent = `Prediksi curah hujan sedang (maks ${formatNumber(maxRainfall)}mm). Kondisi cenderung aman, namun tetap waspada jika stasiun berada di kawasan langganan banjir.`;
        } else {
            alert.style.background = 'rgba(34,197,94,0.12)';
            alert.style.border = '1px solid rgba(34,197,94,0.3)';
            icon.textContent = '✅';
            title.textContent = 'AMAN – Potensi Banjir Rendah';
            title.style.color = '#22c55e';
            detail.textContent = `Berdasarkan prediksi cuaca 7 hari ke depan (maks ${formatNumber(maxRainfall)}mm), daerah di sekitar stasiun relatif kondusif dan aman dari ancaman banjir intensitas presipitasi.`;
        }

        // Render chart
        renderPredictionChart(allDayPreds);

        // Render table
        const today = new Date();
        tbody.innerHTML = allDayPreds.map(p => {
            const date = new Date(today.getTime() + p._day * 86400000);
            const dayLabel = p._day === 0 ? 'Hari Ini' : date.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short' });
            const catColor = getCategoryColor(p.category);
            const confColor = p.confidence >= 85 ? '#22c55e' : p.confidence >= 70 ? '#eab308' : '#ef4444';

            return `
            <tr style="border-bottom:1px solid rgba(148,163,184,0.1)">
                <td style="padding:10px 8px;font-weight:600">${dayLabel}</td>
                <td style="padding:10px 8px;text-align:center;font-weight:700;color:${catColor}">${formatNumber(p.predicted_rainfall)} mm</td>
                <td style="padding:10px 8px;text-align:center">
                    <span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:0.75rem;font-weight:700;background:${catColor}22;color:${catColor}">${p.category}</span>
                </td>
                <td style="padding:10px 8px;text-align:center">
                    <span style="font-weight:600;color:${confColor}">${p._empty ? '--' : formatNumber(p.confidence) + '%'}</span>
                </td>
            </tr>
            `;
        }).join('');

    } catch (e) {
        console.error('Failed to load predictions:', e);
        icon.textContent = '❓';
        title.textContent = 'Data Prediksi Tidak Tersedia';
        title.style.color = 'var(--text-muted)';
        detail.textContent = 'Tidak dapat memuat histori analisis dan prediksi 7 hari untuk site ini.';
        alert.style.background = 'rgba(148,163,184,0.08)';
        alert.style.border = '1px solid rgba(148,163,184,0.15)';
    }
}

function renderPredictionChart(predictions) {
    const ctx = document.getElementById('predictionChart').getContext('2d');
    if (predChart) predChart.destroy();

    const today = new Date();
    const labels = predictions.map(p => {
        if (p._day === 0) return 'H+0';
        return `H+${p._day}`;
    });

    const data = predictions.map(p => p.predicted_rainfall);
    const upperData = predictions.map(p => p.predicted_rainfall + (p.predicted_rainfall * ((100 - p.confidence) / 100)));
    const lowerData = predictions.map(p => Math.max(0, p.predicted_rainfall - (p.predicted_rainfall * ((100 - p.confidence) / 100))));
    const colors = predictions.map(p => getCategoryColor(p.category));

    predChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'line',
                    label: 'Batas Atas (+σ)',
                    data: upperData,
                    borderColor: 'rgba(148, 163, 184, 0.4)',
                    borderDash: [4, 4],
                    borderWidth: 1.5,
                    fill: false,
                    pointRadius: 0,
                    tension: 0.3
                },
                {
                    type: 'line',
                    label: 'Batas Bawah (-σ)',
                    data: lowerData,
                    borderColor: 'rgba(148, 163, 184, 0.4)',
                    backgroundColor: 'rgba(148, 163, 184, 0.1)',
                    borderDash: [4, 4],
                    borderWidth: 1.5,
                    fill: '-1',
                    pointRadius: 0,
                    tension: 0.3
                },
                {
                    type: 'bar',
                    label: 'Prediksi (mm)',
                    data,
                    backgroundColor: colors.map(c => c + 'CC'),
                    borderColor: colors,
                    borderWidth: 2,
                    borderRadius: 8,
                    borderSkipped: false,
                }
            ]
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
                    callbacks: {
                        label: ctx => `${ctx.raw} mm`
                    }
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
                        font: { family: 'Inter', size: 11 },
                        color: '#94a3b8'
                    }
                }
            }
        }
    });
}





let mapDetail;
let marker;

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const stationId = params.get('id');
    
    if (!stationId) {
        window.location.href = '/stasiun.html';
        return;
    }
    
    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const hours = currentChartTime || 24;
            window.open(`/api/stations/${stationId}/export?hours=${Math.ceil(hours)}`, '_blank');
        });
    }

    const btnPrint = document.getElementById('btn-print');
    if (btnPrint) {
        btnPrint.addEventListener('click', () => {
            const nameElement = document.getElementById('devStationName');
            const name = nameElement ? nameElement.textContent : 'Stasiun';
            const subtitle = document.getElementById('printSubtitle');
            if (subtitle) {
                subtitle.textContent = `${name} — Dicetak pada ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
            }
            window.print();
        });
    }
    
    loadStationDetail(stationId);
});

async function loadStationDetail(id) {
    try {
        // Load station info and history concurrently, but don't fail completely if history fails
        const stationRes = await API.get(`/api/stations/${id}`);
        if (stationRes.error) throw new Error(stationRes.error);

        let historyRes = [];
        try {
            historyRes = await API.get(`/api/stations/${id}/history`);
        } catch (histErr) {
            console.warn('[Detail] History load failed, continuing without history:', histErr.message);
        }

        // Populate basic headers
        document.getElementById('devStationName').textContent = stationRes.name;
        document.getElementById('breadcrumbName').textContent = stationRes.name;
        document.getElementById('devStationCode').textContent = stationRes.id;
        document.getElementById('devModel').textContent = stationRes.type === 'AAWS' ? 'Vaisala MAWS201' : (stationRes.type === 'ARG' ? 'Vaisala QMR102' : 'Vaisala AWS310');
        document.getElementById('devType').textContent = stationRes.type;
        document.getElementById('devCoords').textContent = `${stationRes.latitude || '-'}°, ${stationRes.longitude || '-'}°`;
        document.getElementById('devAddress').textContent = stationRes.location || 'Jawa Barat';

        const lastUpdate = new Date(stationRes.last_update || Date.now());
        document.getElementById('lastUpdateText').textContent = lastUpdate.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        
        const now = new Date();
        const diff = now - lastUpdate;
        const isOnline = diff < 3600000; // 1 hour threshold
        
        const statusDot = document.getElementById('statusDot');
        const liveText = document.getElementById('liveStatusText');
        if (isOnline) {
            statusDot.className = 'status-dot online';
            liveText.textContent = 'ONLINE';
            liveText.style.color = '#22c55e';
            statusDot.parentElement.style.background = 'rgba(34, 197, 94, 0.1)';
        } else {
            statusDot.className = 'status-dot offline';
            liveText.textContent = 'OFFLINE';
            liveText.style.color = '#ef4444';
            statusDot.parentElement.style.background = 'rgba(239, 68, 68, 0.1)';
        }

        // Initialize Map
        initDetailMap(stationRes);

        // Hide overlay
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';

        // Set global station object for other functions to use
        window.currentStation = stationRes;

        // Use latest_data from InfluxDB if available, otherwise fall back to station metadata
        const sensorData = stationRes.latest_data || stationRes;

        // Dynamic chart description based on station type
        const chartDesc = document.querySelector('.chart-card .card-header p');
        if (chartDesc) {
            if (stationRes.type === 'ARG') {
                chartDesc.textContent = 'Data Curah Hujan & Logger — Riwayat 24 Jam Terakhir';
            } else {
                chartDesc.textContent = 'Parameter Meteorologi Lengkap (8 Sensor) — Riwayat 24 Jam Terakhir';
            }
        }

        // Render data widgets and charts
        renderNewWidgets(stationRes, sensorData);
        renderChart(stationRes, historyRes);
        loadStationPredictions(id);
        handleDeviceHealth(stationRes, historyRes);

    } catch (e) {
        console.error('Failed to load station detail:', e);
        // If station not found, redirect to station list
        if (e.message && e.message.includes('404')) {
            window.location.href = '/stasiun.html';
            return;
        }
        const grid = document.getElementById('metricsGrid');
        if (grid) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                    <div style="font-size: 3rem; margin-bottom: 16px;">⚠️</div>
                    <h3 style="margin-bottom: 8px; color: var(--text-primary);">Gagal Memuat Data Stasiun</h3>
                    <p style="color: var(--text-muted); margin-bottom: 16px;">${e.message || 'Pastikan backend dan InfluxDB berjalan.'}</p>
                    <a href="/stasiun.html" style="color: #3b82f6; font-weight: 600;">← Kembali ke Daftar Stasiun</a>
                </div>`;
        }
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    }
}

function initDetailMap(station) {
    if (mapDetail) {
        mapDetail.remove();
    }
    
    const lat = station.latitude || -6.9;
    const lng = station.longitude || 107.6;
    
    mapDetail = L.map('stationMap', {
        zoomControl: false,
        attributionControl: false
    }).setView([lat, lng], 13);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', { attribution: '&copy; CartoDB' }).addTo(mapDetail);
    
    L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: getTypeColor(station.type),
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 1
    }).addTo(mapDetail);
}

function handleDeviceHealth(station, history) {
    const healthSection = document.getElementById('healthSection');
    if (!healthSection) return;

    // Show for all station types

    healthSection.style.display = 'block';

    const batts = history.map(d => d.batt).filter(v => v > 0);
    if (batts.length === 0) return;

    const currentBatt = batts[batts.length - 1];
    const avgBatt = batts.reduce((a, b) => a + b, 0) / batts.length;
    const startBatt = batts[0];
    const delta = currentBatt - startBatt;

    // Health Score calculation (simple version)
    // 12V system, 10.5V is empty, 13.8V is full charging
    let score = ((currentBatt - 10.5) / (13.8 - 10.5)) * 100;
    score = Math.min(100, Math.max(0, score));

    document.getElementById('healthScore').textContent = `${score.toFixed(0)}%`;
    document.getElementById('battAvg').textContent = `${currentBatt.toFixed(1)} V`;
    document.getElementById('battDelta').textContent = `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(2)}V`;
    document.getElementById('battDelta').style.color = delta >= 0 ? '#22c55e' : '#ef4444';
    document.getElementById('battBar').style.width = `${score}%`;

    const statusBadge = document.getElementById('healthStatusBadge');
    const msg = document.getElementById('healthMessage');

    if (score > 85) {
        statusBadge.textContent = 'EXCELLENT';
        statusBadge.style.background = 'rgba(16, 185, 129, 0.1)';
        statusBadge.style.color = '#10b981';
        healthSection.style.borderLeftColor = '#10b981';
        msg.textContent = 'Semua sistem beroperasi normal. Pasokan daya dari panel surya sangat stabil. Tidak diperlukan tindakan pemeliharaan.';
    } else if (score > 60) {
        statusBadge.textContent = 'GOOD';
        statusBadge.style.background = 'rgba(59, 130, 246, 0.1)';
        statusBadge.style.color = '#3b82f6';
        healthSection.style.borderLeftColor = '#3b82f6';
        msg.textContent = 'Status daya dalam kondisi baik. Pastikan panel surya tidak tertutup debu atau bayangan pohon untuk menjaga efisiensi pengisian.';
    } else if (score > 30) {
        statusBadge.textContent = 'WARNING';
        statusBadge.style.background = 'rgba(234, 179, 8, 0.1)';
        statusBadge.style.color = '#eab308';
        healthSection.style.borderLeftColor = '#eab308';
        msg.textContent = 'Tegangan baterai menurun. Disarankan untuk menjadwalkan pengecekan fisik baterai dan konektor kabel dalam waktu dekat.';
    } else {
        statusBadge.textContent = 'CRITICAL';
        statusBadge.style.background = 'rgba(239, 68, 68, 0.1)';
        statusBadge.style.color = '#ef4444';
        healthSection.style.borderLeftColor = '#ef4444';
        msg.textContent = 'PERINGATAN: Tegangan baterai sangat rendah! Risiko data loss tinggi. Segera kirim teknisi untuk penggantian baterai atau perbaikan sistem pengisian.';
    }
}


// Fungsi dieksport sebagai EventListener di dalam DOMContentLoaded
