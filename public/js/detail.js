// Global state for chart rendering
let fullHistory = [];
let currentChartType = 'all';
let currentChartTime = 24;
let _mainChartInstance = null;

function renderNewWidgets(station, data) {
    const grid = document.getElementById('metricsGrid');
    if (!grid) return;

    const fNum = val => val === undefined || val === null ? '--' : Number(val).toFixed(1);
    
    const getCardinalDirection = (angle) => {
        if (angle === undefined || angle === null) return '--';
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        return directions[Math.round(angle / 45) % 8];
    };
    
    const battPcnt = ((data.batt || 12) / 15 * 100);
    const battClamped = Math.min(100, Math.max(0, battPcnt)).toFixed(0);
    
    const isARG = station.type === 'ARG';

    let metricsHTML = '';
    
    if (isARG) {
        metricsHTML = `
        <!-- ARG: Single Row with 3 Widgets -->
        <div style="grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <!-- Suhu Widget -->
            <div class="card chart-card" style="padding: 16px; margin-bottom: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Temperature Logger</div>
                        <div style="font-size: 1.8rem; font-weight: 800; color: ${checkDataQC('temp', data.temp || data.log_temp).valid ? '#f97316' : '#ef4444'}; line-height: 1.1;">
                            ${fNum(data.temp || data.log_temp)} <span style="font-size: 0.9rem; font-weight: 600;">°C</span>
                            ${!checkDataQC('temp', data.temp || data.log_temp).valid ? '<span title="' + checkDataQC('temp', data.temp || data.log_temp).message + '">⚠️</span>' : ''}
                        </div>
                    </div>
                </div>
                <div style="height: 60px; width: 100%; position: relative;"><canvas id="sparkTemp"></canvas></div>
            </div>
            
            <!-- Curah Hujan Widget -->
            <div class="card chart-card" style="padding: 16px; margin-bottom: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Rainfall</div>
                        <div style="font-size: 1.8rem; font-weight: 800; color: #3b82f6; line-height: 1.1;">${fNum(data.rr)} <span style="font-size: 0.9rem; font-weight: 600;">mm</span></div>
                        <div style="font-size: 0.7rem; font-weight: 800; color: ${getRainfallCategory(data.rr).color};">${getRainfallCategory(data.rr).label}</div>
                    </div>
                </div>
                <div style="height: 60px; width: 100%; position: relative;"><canvas id="sparkRain"></canvas></div>
            </div>
            
            <!-- Power Status -->
            <div class="card chart-card" style="padding: 20px; margin-bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <div style="width: 100%; display: flex; justify-content: space-between;">
                    <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Power Status</div>
                    <div style="color: #10b981;">🔋</div>
                </div>
                <div style="width: 100%; margin-top: 16px; padding: 16px; background: ${checkDataQC('batt', data.batt).valid ? 'rgba(0,0,0,0.2)' : 'rgba(239, 68, 68, 0.1)'}; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Voltage Source</div>
                    <div style="font-size: 1.4rem; font-weight: 800; color: ${checkDataQC('batt', data.batt).valid ? 'inherit' : '#ef4444'};">
                        ${fNum(data.batt)} <span style="font-size: 0.9rem; color: #f59e0b;">V</span>
                        ${!checkDataQC('batt', data.batt).valid ? '⚠️' : ''}
                    </div>
                </div>
            </div>
        </div>
        `;
    } else {
        metricsHTML = `
        <!-- Top Small Widgets -->
        <div style="grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <!-- Suhu Widget -->
            <div class="card chart-card" style="padding: 16px; margin-bottom: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Temperature</div>
                        <div style="font-size: 1.8rem; font-weight: 800; color: ${checkDataQC('temp', data.temp).valid ? '#f97316' : '#ef4444'}; line-height: 1.1;">
                            ${fNum(data.temp)} <span style="font-size: 0.9rem; font-weight: 600;">°C</span>
                            ${!checkDataQC('temp', data.temp).valid ? '⚠️' : ''}
                        </div>
                    </div>
                </div>
                <div style="height: 60px; width: 100%; position: relative;"><canvas id="sparkTemp"></canvas></div>
            </div>
            
            <!-- Kelembapan Widget -->
            <div class="card chart-card" style="padding: 16px; margin-bottom: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Humidity</div>
                        <div style="font-size: 1.8rem; font-weight: 800; color: ${checkDataQC('rh', data.rh).valid ? '#10b981' : '#ef4444'}; line-height: 1.1;">
                            ${fNum(data.rh)} <span style="font-size: 0.9rem; font-weight: 600;">%</span>
                            ${!checkDataQC('rh', data.rh).valid ? '⚠️' : ''}
                        </div>
                    </div>
                </div>
                <div style="height: 60px; width: 100%; position: relative;"><canvas id="sparkRh"></canvas></div>
            </div>
            
            <!-- Curah Hujan Widget -->
            <div class="card chart-card" style="padding: 16px; margin-bottom: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Rainfall</div>
                        <div style="font-size: 1.8rem; font-weight: 800; color: #3b82f6; line-height: 1.1;">${fNum(data.rr)} <span style="font-size: 0.9rem; font-weight: 600;">mm</span></div>
                        <div style="font-size: 0.7rem; font-weight: 800; color: ${getRainfallCategory(data.rr).color};">${getRainfallCategory(data.rr).label}</div>
                    </div>
                </div>
                <div style="height: 60px; width: 100%; position: relative;"><canvas id="sparkRain"></canvas></div>
            </div>
            
            <!-- Tekanan Widget -->
            <div class="card chart-card" style="padding: 16px; margin-bottom: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Pressure</div>
                        <div style="font-size: 1.8rem; font-weight: 800; color: #8b5cf6; line-height: 1.1;">${fNum(data.press)} <span style="font-size: 0.9rem; font-weight: 600;">hPa</span></div>
                    </div>
                </div>
                <div style="height: 60px; width: 100%; position: relative;"><canvas id="sparkPress"></canvas></div>
            </div>
        </div>

        <!-- Bottom Specialized Widgets -->
        <div style="grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 0px;">
            <!-- Wind Speed Gauge -->
            <div class="card chart-card" style="padding: 20px; margin-bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: space-between;">
                <div style="width: 100%; display: flex; justify-content: space-between;">
                    <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Wind Speed</div>
                    <div style="color: #3b82f6;">🌬️</div>
                </div>
                <div style="height: 120px; width: 100%; position: relative; margin-top: 10px;">
                    <canvas id="gaugeWindSpeed"></canvas>
                    <div style="position: absolute; bottom: -5px; left: 50%; transform: translateX(-50%); text-align: center;">
                        <div style="font-size: 1.4rem; font-weight: 800; line-height: 1; color: #3b82f6;">${fNum(data.ws)}</div>
                        <div style="font-size: 0.7rem; font-weight: 600; color: var(--text-muted);">m/s</div>
                    </div>
                </div>
                <div style="margin-top: 12px; font-size: 0.75rem; font-weight: 600; color: var(--text-muted);">Max: ${fNum(data.ws_max || 0)} m/s</div>
            </div>

            <!-- Wind Direction Compass -->
            <div class="card chart-card" style="padding: 20px; margin-bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: space-between;">
                <div style="width: 100%; display: flex; justify-content: space-between;">
                    <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Wind Direction</div>
                    <div style="color: #ef4444;">🧭</div>
                </div>
                <div style="height: 100px; width: 100%; position: relative; margin-top: 15px; display: flex; align-items: center; justify-content: center;">
                     <div style="width: 80px; height: 80px; border: 2px solid rgba(148, 163, 184, 0.15); border-radius: 50%; position: relative; display: flex; align-items: center; justify-content: center;">
                        <div style="position: absolute; top: 4px; font-size: 0.65rem; font-weight: 800; color: var(--text-muted);">N</div>
                        <div style="position: absolute; right: 4px; font-size: 0.65rem; font-weight: 800; color: var(--text-muted);">E</div>
                        <div style="position: absolute; bottom: 4px; font-size: 0.65rem; font-weight: 800; color: var(--text-muted);">S</div>
                        <div style="position: absolute; left: 4px; font-size: 0.65rem; font-weight: 800; color: var(--text-muted);">W</div>
                        <div style="width: 3px; height: 45px; background: linear-gradient(to top, transparent 50%, #ef4444 50%); position: absolute; transform: rotate(${data.wd || 0}deg); transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 1.5px;"></div>
                        <div style="width: 8px; height: 8px; background: var(--bg-card); border: 2px solid #ef4444; border-radius: 50%; z-index: 2;"></div>
                     </div>
                </div>
                <div style="margin-top: 12px; text-align: center;">
                    <div style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary); line-height: 1;">${fNum(data.wd)}°</div>
                    <div style="font-size: 0.7rem; font-weight: 600; color: var(--text-muted); margin-top: 2px;">${getCardinalDirection(data.wd)}</div>
                </div>
            </div>

            <!-- Solar Radiation -->
            <div class="card chart-card" style="padding: 20px; margin-bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: space-between;">
                <div style="width: 100%; display: flex; justify-content: space-between;">
                    <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Solar Radiation</div>
                    <div style="color: #f59e0b;">☀️</div>
                </div>
                <div style="height: 90px; width: 100%; position: relative; margin-top: 10px;"><canvas id="sparkSolar"></canvas></div>
                <div style="margin-top: 10px; text-align: center;">
                    <div style="font-size: 1.6rem; font-weight: 800; color: #f59e0b; line-height: 1;">${fNum(data.sr)}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">W/m²</div>
                </div>
            </div>

            <!-- Power Status -->
            <div class="card chart-card" style="padding: 20px; margin-bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <div style="width: 100%; display: flex; justify-content: space-between;">
                    <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Power Status</div>
                    <div style="color: #10b981;">🔋</div>
                </div>
                <div style="width: 100%; margin-top: 16px; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Voltage Source</div>
                    <div style="font-size: 1.4rem; font-weight: 800;">${fNum(data.batt)} <span style="font-size: 0.9rem; color: #f59e0b;">V</span></div>
                </div>
            </div>
        </div>
        `;
    }

    grid.innerHTML = metricsHTML;

    // Render Sparklines
    const history = fullHistory || [];
    const drawSparkline = (id, key, color, fillMode = false) => {
        const canvas = document.getElementById(id);
        if (!canvas) return;
        const sCtx = canvas.getContext('2d');
        const sData = history.map(d => d[key]).filter(v => v !== null && v !== undefined).slice(-24);
        if (sData.length === 0) return;
        
        let bg = 'transparent';
        if (fillMode) {
            let gradient = sCtx.createLinearGradient(0, 0, 0, 60);
            gradient.addColorStop(0, color + '66');
            gradient.addColorStop(1, color + '00');
            bg = gradient;
        }

        new Chart(sCtx, {
            type: 'line',
            data: {
                labels: sData.map((_, i) => i),
                datasets: [{
                    data: sData,
                    borderColor: color,
                    borderWidth: 2,
                    backgroundColor: bg,
                    fill: fillMode,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false } },
                layout: { padding: 0 }
            }
        });
    };

    drawSparkline('sparkTemp', isARG ? 'log_temp' : 'temp', '#f97316', true);
    if (!isARG) drawSparkline('sparkRh', 'rh', '#10b981');
    drawSparkline('sparkRain', 'rr', '#3b82f6', true);
    if (!isARG) drawSparkline('sparkPress', 'press', '#8b5cf6');
    if (!isARG) drawSparkline('sparkSolar', 'sr', '#f59e0b', true);

    // Wind Speed Gauge (Doughnut)
    if (!isARG) {
        const gaugeWs = document.getElementById('gaugeWindSpeed');
        if (gaugeWs) {
            new Chart(gaugeWs.getContext('2d'), {
                type: 'doughnut',
                data: {
                    datasets: [{
                        data: [Math.min(data.ws || 0, 20), Math.max(20 - (data.ws || 0), 0)],
                        backgroundColor: ['#3b82f6', 'rgba(255,255,255,0.05)'],
                        borderWidth: 0,
                        circumference: 180,
                        rotation: 270
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '80%',
                    plugins: { tooltip: { enabled: false } },
                    layout: { padding: 0 }
                }
            });
        }
    }
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
            pSelect.innerHTML += '<option value="batt">Baterai (V)</option>';
        } else {
            pSelect.innerHTML += '<option value="temp">Suhu Udara (°C)</option>';
            pSelect.innerHTML += '<option value="rh">Kelembapan (%)</option>';
            pSelect.innerHTML += '<option value="rr">Curah Hujan (mm)</option>';
            pSelect.innerHTML += '<option value="press">Tekanan (hPa)</option>';
            pSelect.innerHTML += '<option value="ws">Kecepatan Angin (m/s)</option>';
            pSelect.innerHTML += '<option value="wd">Arah Angin (°)</option>';
            pSelect.innerHTML += '<option value="sr">Radiasi Matahari (W/m²)</option>';
            pSelect.innerHTML += '<option value="batt">Baterai (V)</option>';
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
            if (currentChartType === 'sr' || (isAll && sType === 'AAWS')) {
                datasets.push({ label: 'Radiasi (W/m²)', data: filteredHistory.map(d => d.sr), type: 'line', borderColor: colors.sr, backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, yAxisID: 'ySr', order: 5 });
                scales.ySr = { type: 'linear', position: 'left', title: { display: true, text: 'Radiasi (W/m²)' }, beginAtZero: true };
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
                    allDayPreds.push({ _day: d, predicted_rainfall: 0, category: 'RINGAN', confidence: 0, _empty: true });
                }
            } catch {
                allDayPreds.push({ _day: d, predicted_rainfall: 0, category: 'RINGAN', confidence: 0, _empty: true });
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
    const colors = predictions.map(p => getCategoryColor(p.category));

    predChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Prediksi (mm)',
                data,
                backgroundColor: colors.map(c => c + 'CC'),
                borderColor: colors,
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
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
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapDetail);
    
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
