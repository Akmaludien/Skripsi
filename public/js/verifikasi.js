document.addEventListener('DOMContentLoaded', () => {
    initVerifikasi();
});

let verificationData = null;
let charts = {};
let errorMap;

// Current Filters
let currentType = 'all';
let currentSeason = 'all';
let currentDate = '';

async function initVerifikasi() {
    try {
        // Fetch Model Overall Performance (Global)
        const perfResponse = await fetch('/api/model-performance');
        const perf = await perfResponse.json();
        
        document.getElementById('valRmse').textContent = perf.rmse ? perf.rmse.toFixed(2) : '0.0';
        document.getElementById('valBaselineRmse').textContent = perf.baseline_rmse ? perf.baseline_rmse.toFixed(2) : '0.0';
        document.getElementById('valMae').textContent = perf.mae ? perf.mae.toFixed(2) : '0.0';
        document.getElementById('valR2').textContent = perf.r_squared.toFixed(3);
        if (perf.accuracy !== undefined) {
            const accVal = perf.accuracy > 1 ? perf.accuracy : perf.accuracy * 100;
            document.getElementById('valAccuracy').textContent = accVal.toFixed(1) + '%';
        }

        // Setup UI Listeners
        setupFilterListeners();

        // Initial Data Fetch
        await fetchAndRenderVerification();

    } catch (error) {
        console.error('Failed to initialize verification page:', error);
    }
}

function setupFilterListeners() {
    const typeFilter = document.getElementById('typeFilter');
    const dateFilter = document.getElementById('dateFilter');
    const searchInput = document.getElementById('verifySearch');
    const seasonBtn = document.querySelectorAll('[data-season]');

    if (typeFilter) {
        typeFilter.addEventListener('change', (e) => {
            currentType = e.target.value;
            fetchAndRenderVerification();
        });
    }

    if (dateFilter) {
        dateFilter.addEventListener('change', (e) => {
            currentDate = e.target.value;
            currentSeason = 'all'; // reset season if specific date is chosen
            document.querySelectorAll('[data-season]').forEach(b => b.classList.remove('active'));
            document.querySelector('[data-season="all"]').classList.add('active');
            fetchAndRenderVerification();
        });
    }

    seasonBtn.forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-season]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentSeason = e.target.getAttribute('data-season');
            currentDate = ''; // reset date if season is chosen
            if (dateFilter) dateFilter.value = '';
            fetchAndRenderVerification();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            if (!verificationData || !verificationData.data) return;
            const term = e.target.value.toLowerCase();
            const filteredData = verificationData.data.filter(d => 
                d.station_name.toLowerCase().includes(term) || 
                d.station_type.toLowerCase().includes(term)
            );
            updateTable(filteredData);
        });
    }
}

window.changeSeason = function(season, btn) {
    // This is handled by event listeners now, but keeping for inline onclick safety
};

async function fetchAndRenderVerification() {
    try {
        let params = new URLSearchParams();
        if (currentType !== 'all') params.append('type', currentType);
        if (currentSeason !== 'all') params.append('season', currentSeason);
        if (currentDate) params.append('date', currentDate);

        const response = await fetch(`/api/verification?${params.toString()}`);
        verificationData = await response.json();

        const container = document.querySelector('.content-body');
        const emptyMsgId = 'emptyVerifyMsg';
        const existingEmpty = document.getElementById(emptyMsgId);
        if (existingEmpty) existingEmpty.remove();

        if (verificationData.data && verificationData.data.length > 0) {
            // Update Date Picker to reflect actual data date
            if (verificationData.date && verificationData.date !== 'Multiple Dates' && verificationData.date !== 'N/A') {
                const df = document.getElementById('dateFilter');
                if (df && !currentDate) df.value = verificationData.date;
            }

            // Show all cards
            document.querySelectorAll('.content-body > .card, .verification-grid > .card').forEach(c => c.style.display = 'block');

            // Render
            populateStationFilter(verificationData.data);
            initErrorMap(verificationData.data);
            renderCharts(verificationData.data);
            updateTable(verificationData.data);

        } else {
            // Hide cards and show empty state
            document.querySelectorAll('.content-body > .card, .verification-grid > .card').forEach(c => {
                if (!c.innerHTML.includes('MUSIM') && !c.innerHTML.includes('TANGGAL PREDIKSI')) {
                    c.style.display = 'none';
                }
            });

            const infoMsg = document.createElement('div');
            infoMsg.id = emptyMsgId;
            infoMsg.className = 'card';
            infoMsg.style.padding = '40px';
            infoMsg.style.marginTop = '24px';
            infoMsg.style.textAlign = 'center';
            infoMsg.style.borderLeft = '4px solid var(--primary)';
            infoMsg.innerHTML = `
                <div style="font-size: 3.5rem; margin-bottom: 20px;">📊</div>
                <h3 style="font-size: 1.4rem; margin-bottom: 12px;">Data Verifikasi Belum Tersedia</h3>
                <p style="color: var(--text-muted); max-width: 600px; margin: 0 auto 24px; line-height: 1.6;">
                    Sistem belum menemukan data perbandingan untuk parameter yang dipilih. 
                </p>
                <div style="display: inline-block; text-align: left; background: rgba(0,0,0,0.2); padding: 16px 24px; border-radius: 12px; margin-bottom: 24px;">
                    <ul style="margin: 0; padding-left: 20px; color: var(--text-secondary); font-size: 0.9rem;">
                        <li>Belum ada rekaman prediksi untuk rentang waktu ini.</li>
                        <li>Data observasi riil di InfluxDB belum masuk atau masih kosong.</li>
                        <li>Stasiun dengan tipe tersebut sedang offline.</li>
                    </ul>
                </div>
            `;
            container.appendChild(infoMsg);
        }
    } catch (e) {
        console.error('Error fetching verification data:', e);
    }
}

function initErrorMap(data) {
    if (!errorMap) {
        errorMap = L.map('errorMap').setView([-6.9, 107.6], 8);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(errorMap);
    }

    // Clear existing markers
    errorMap.eachLayer((layer) => {
        if (layer instanceof L.CircleMarker) errorMap.removeLayer(layer);
    });

    data.forEach(d => {
        if (!d.latitude || !d.longitude) return;

        const absError = Math.abs(d.error);
        const color = d.error > 5 ? '#ef4444' : (d.error < -5 ? '#3b82f6' : '#22c55e');
        const radius = Math.max(5, Math.min(20, 5 + absError));

        const marker = L.circleMarker([d.latitude, d.longitude], {
            radius: radius,
            fillColor: color,
            color: '#fff',
            weight: 1,
            fillOpacity: 0.7
        }).addTo(errorMap);

        const catPred = getRainfallCategory(d.predicted_rainfall);
        const catAct = getRainfallCategory(d.actual_rainfall);

        marker.bindPopup(`
            <div style="font-family: 'Inter', sans-serif;">
                <h4 style="margin:0 0 8px 0">${d.station_name}</h4>
                <div style="font-size:0.85rem">
                    Prediksi: <b>${parseFloat(d.predicted_rainfall).toFixed(1)} mm</b> (<span style="color:${catPred.color}">${catPred.label}</span>)<br>
                    Aktual: <b>${parseFloat(d.actual_rainfall).toFixed(1)} mm</b> (<span style="color:${catAct.color}">${catAct.label}</span>)<br>
                    <hr style="margin:8px 0; border:0; border-top:1px solid #eee">
                    Error: <b style="color:${color}">${d.error > 0 ? '+' : ''}${d.error} mm</b>
                </div>
            </div>
        `);
    });
}

function populateStationFilter(data) {
    const filter = document.getElementById('stationFilter');
    if (!filter) return;
    
    // Reset options
    filter.innerHTML = '<option value="all">Semua Stasiun</option>';
    
    const stations = [...new Set(data.map(d => d.station_name))].sort();
    
    stations.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        filter.appendChild(option);
    });

    // Remove old listeners to prevent duplicates
    const newFilter = filter.cloneNode(true);
    filter.parentNode.replaceChild(newFilter, filter);

    newFilter.addEventListener('change', (e) => {
        const selected = e.target.value;
        const filteredData = selected === 'all' ? verificationData.data : verificationData.data.filter(d => d.station_name === selected);
        
        updateChartData(filteredData);
        updateTable(filteredData);
        
        // Zoom map to station
        if (selected !== 'all') {
            const s = verificationData.data.find(d => d.station_name === selected);
            if (s && s.latitude) errorMap.setView([s.latitude, s.longitude], 12);
        } else {
            errorMap.setView([-6.9, 107.6], 8);
        }
    });
}

function renderCharts(data) {
    const ctx1 = document.getElementById('verificationChart').getContext('2d');
    const ctx2 = document.getElementById('errorDistChart').getContext('2d');

    if (charts.comparison) charts.comparison.destroy();
    if (charts.error) charts.error.destroy();

    // Chart 1: Comparison
    charts.comparison = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: data.map(d => d.station_name),
            datasets: [
                {
                    label: 'Prediksi (mm)',
                    data: data.map(d => d.predicted_rainfall),
                    backgroundColor: 'rgba(79, 70, 229, 0.6)',
                    borderColor: 'rgb(79, 70, 229)',
                    borderWidth: 1
                },
                {
                    label: 'Aktual (mm)',
                    data: data.map(d => d.actual_rainfall),
                    backgroundColor: 'rgba(34, 197, 94, 0.6)',
                    borderColor: 'rgb(34, 197, 94)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Curah Hujan (mm)' }
                }
            }
        }
    });

    // Chart 2: Error Scatter with 1:1 Reference Line
    const maxVal = Math.max(...data.map(d => Math.max(d.actual_rainfall, d.predicted_rainfall))) + 10;
    
    charts.error = new Chart(ctx2, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Prediction Error',
                    data: data.map(d => ({ x: d.actual_rainfall, y: d.predicted_rainfall })),
                    backgroundColor: 'rgba(239, 68, 68, 0.5)',
                    pointRadius: 6,
                    pointHoverRadius: 8
                },
                {
                    label: 'Sempurna (1:1)',
                    data: [{x: 0, y: 0}, {x: maxVal, y: maxVal}],
                    type: 'line',
                    borderColor: 'rgba(148, 163, 184, 0.5)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Aktual (mm)' }, beginAtZero: true, max: maxVal },
                y: { title: { display: true, text: 'Prediksi (mm)' }, beginAtZero: true, max: maxVal }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 1) return 'Garis Referensi (1:1)';
                            const d = data[context.dataIndex];
                            return `${d.station_name}: Pred ${parseFloat(d.predicted_rainfall).toFixed(1)}mm vs Act ${parseFloat(d.actual_rainfall).toFixed(1)}mm (Err: ${parseFloat(d.error).toFixed(1)}mm)`;
                        }
                    }
                }
            }
        }
    });

    renderConfusionMatrix(data);
    renderTypeBreakdown(data);
}

function renderConfusionMatrix(data) {
    const ctx = document.getElementById('confusionMatrixChart').getContext('2d');
    if (charts.confusion) charts.confusion.destroy();
    
    // 5x5 Matrix including TIDAK HUJAN
    const cats = ['TIDAK HUJAN', 'RINGAN', 'SEDANG', 'LEBAT', 'SANGAT LEBAT'];
    
    const matrix = {
        'TIDAK HUJAN': { 'TIDAK HUJAN': 0, 'RINGAN': 0, 'SEDANG': 0, 'LEBAT': 0, 'SANGAT LEBAT': 0 },
        'RINGAN': { 'TIDAK HUJAN': 0, 'RINGAN': 0, 'SEDANG': 0, 'LEBAT': 0, 'SANGAT LEBAT': 0 },
        'SEDANG': { 'TIDAK HUJAN': 0, 'RINGAN': 0, 'SEDANG': 0, 'LEBAT': 0, 'SANGAT LEBAT': 0 },
        'LEBAT': { 'TIDAK HUJAN': 0, 'RINGAN': 0, 'SEDANG': 0, 'LEBAT': 0, 'SANGAT LEBAT': 0 },
        'SANGAT LEBAT': { 'TIDAK HUJAN': 0, 'RINGAN': 0, 'SEDANG': 0, 'LEBAT': 0, 'SANGAT LEBAT': 0 }
    };

    data.forEach(d => {
        const catAct = getRainfallCategory(d.actual_rainfall).name.toUpperCase();
        const catPred = getRainfallCategory(d.predicted_rainfall).name.toUpperCase();
        if(matrix[catAct] && matrix[catAct][catPred] !== undefined) {
            matrix[catAct][catPred]++;
        }
    });

    charts.confusion = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: cats.map(c => 'Act: ' + c),
            datasets: [
                { label: 'Pred Tidak Hujan', data: cats.map(c => matrix[c]['TIDAK HUJAN']), backgroundColor: '#94a3b8' },
                { label: 'Pred Ringan', data: cats.map(c => matrix[c]['RINGAN']), backgroundColor: '#3b82f6' },
                { label: 'Pred Sedang', data: cats.map(c => matrix[c]['SEDANG']), backgroundColor: '#22c55e' },
                { label: 'Pred Lebat', data: cats.map(c => matrix[c]['LEBAT']), backgroundColor: '#eab308' },
                { label: 'Pred Sgt Lebat', data: cats.map(c => matrix[c]['SANGAT LEBAT']), backgroundColor: '#ef4444' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Jumlah Observasi' } } },
            plugins: { tooltip: { mode: 'index' } }
        }
    });
}

function renderTypeBreakdown(data) {
    const ctx = document.getElementById('typeBreakdownChart').getContext('2d');
    if (charts.typeBreakdown) charts.typeBreakdown.destroy();
    
    const types = ['AWS', 'ARG', 'AAWS'];
    const metrics = types.map(t => {
        const stData = data.filter(d => d.station_type === t);
        if (stData.length === 0) return { type: t, rmse: 0, mae: 0 };
        const mse = stData.reduce((sum, d) => sum + Math.pow(d.predicted_rainfall - d.actual_rainfall, 2), 0) / stData.length;
        const mae = stData.reduce((sum, d) => sum + Math.abs(d.predicted_rainfall - d.actual_rainfall), 0) / stData.length;
        return { type: t, rmse: Math.sqrt(mse), mae: mae };
    });

    charts.typeBreakdown = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: types,
            datasets: [
                { label: 'RMSE (mm)', data: metrics.map(m => m.rmse), backgroundColor: 'rgba(79, 70, 229, 0.7)' },
                { label: 'MAE (mm)', data: metrics.map(m => m.mae), backgroundColor: 'rgba(236, 72, 153, 0.7)' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Error (mm)' } } }
        }
    });
}

function updateChartData(data) {
    if (charts.comparison) {
        charts.comparison.data.labels = data.map(d => d.station_name);
        charts.comparison.data.datasets[0].data = data.map(d => d.predicted_rainfall);
        charts.comparison.data.datasets[1].data = data.map(d => d.actual_rainfall);
        charts.comparison.update();
    }
    if (charts.error) {
        const maxVal = Math.max(...data.map(d => Math.max(d.actual_rainfall, d.predicted_rainfall))) + 10;
        charts.error.data.datasets[0].data = data.map(d => ({ x: d.actual_rainfall, y: d.predicted_rainfall }));
        charts.error.data.datasets[1].data = [{x: 0, y: 0}, {x: maxVal, y: maxVal}];
        charts.error.options.scales.x.max = maxVal;
        charts.error.options.scales.y.max = maxVal;
        charts.error.update();
    }
    // Re-render full for complex ones
    renderConfusionMatrix(data);
    renderTypeBreakdown(data);
}

function updateTable(data) {
    const body = document.getElementById('verifyBody');
    if (!body) return;
    body.innerHTML = '';

    data.forEach(d => {
        const tr = document.createElement('tr');
        const diffClass = d.error > 5 ? 'diff-pos' : (d.error < -5 ? 'diff-pos' : 'diff-neutral');
        const catAct = getRainfallCategory(d.actual_rainfall);
        const catPred = getRainfallCategory(d.predicted_rainfall);
        
        tr.innerHTML = `
            <td><strong>${d.station_name}</strong><br><small>${d.station_type}</small></td>
            <td>${parseFloat(d.predicted_rainfall).toFixed(1)} mm<br><span style="font-size:0.7rem; color:${catPred.color}; font-weight:700">${catPred.name}</span></td>
            <td>${parseFloat(d.actual_rainfall).toFixed(1)} mm<br><span style="font-size:0.7rem; color:${catAct.color}; font-weight:700">${catAct.name}</span></td>
            <td class="${diffClass}">${d.error > 0 ? '+' : ''}${parseFloat(d.error).toFixed(1)} mm</td>
        `;
        body.appendChild(tr);
    });
}
