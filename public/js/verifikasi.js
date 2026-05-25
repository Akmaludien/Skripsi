document.addEventListener('DOMContentLoaded', () => {
    initVerifikasi();
});

let verificationData = null;
let charts = {};
let errorMap;

async function initVerifikasi() {
    try {
        // Fetch Model Overall Performance
        const perfResponse = await fetch('/api/model-performance');
        const perf = await perfResponse.json();
        
        document.getElementById('valRmse').textContent = perf.rmse ? perf.rmse.toFixed(2) : '0.0';
        document.getElementById('valMae').textContent = perf.mae ? perf.mae.toFixed(2) : '0.0';
        document.getElementById('valR2').textContent = perf.r_squared.toFixed(3);
        if (perf.accuracy !== undefined) {
            const accVal = perf.accuracy > 1 ? perf.accuracy : perf.accuracy * 100;
            document.getElementById('valAccuracy').textContent = accVal.toFixed(1) + '%';
        }

        // Fetch Daily Verification Data
        const response = await fetch('/api/verification');
        verificationData = await response.json();

        if (verificationData.data && verificationData.data.length > 0) {
            populateStationFilter(verificationData.data);
            initErrorMap(verificationData.data);
            renderCharts(verificationData.data);
            updateTable(verificationData.data);

            // Setup Search Filter for Table
            const searchInput = document.getElementById('verifySearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    const term = e.target.value.toLowerCase();
                    const filteredData = verificationData.data.filter(d => 
                        d.station_name.toLowerCase().includes(term) || 
                        d.station_type.toLowerCase().includes(term)
                    );
                    updateTable(filteredData);
                });
            }
        } else {
            // Show explanation for empty data
            const container = document.querySelector('.content-body') || document.querySelector('.main-content') || document.body;
            const infoMsg = document.createElement('div');
            infoMsg.className = 'card';
            infoMsg.style.padding = '40px';
            infoMsg.style.marginTop = '24px';
            infoMsg.style.textAlign = 'center';
            infoMsg.style.borderLeft = '4px solid var(--primary)';
            infoMsg.innerHTML = `
                <div style="font-size: 3.5rem; margin-bottom: 20px;">📊</div>
                <h3 style="font-size: 1.4rem; margin-bottom: 12px;">Data Verifikasi Belum Tersedia</h3>
                <p style="color: var(--text-muted); max-width: 600px; margin: 0 auto 24px; line-height: 1.6;">
                    Sistem belum menemukan data perbandingan untuk tanggal <b>${verificationData.date || 'kemarin'}</b>. 
                    Hal ini biasanya terjadi jika:
                </p>
                <div style="display: inline-block; text-align: left; background: rgba(0,0,0,0.2); padding: 16px 24px; border-radius: 12px; margin-bottom: 24px;">
                    <ul style="margin: 0; padding-left: 20px; color: var(--text-secondary); font-size: 0.9rem;">
                        <li>Belum ada rekaman prediksi yang dibuat pada hari tersebut.</li>
                        <li>Data observasi riil di InfluxDB belum masuk atau masih kosong.</li>
                        <li>Stasiun sedang dalam pemeliharaan (Offline).</li>
                    </ul>
                </div>
                <div style="font-size: 0.85rem; color: var(--primary); font-weight: 600;">
                    ℹ️ Verifikasi otomatis dijalankan setiap hari pada pukul 00:00 WIB.
                </div>
            `;
            if (container) {
                container.appendChild(infoMsg);
            }
            
            // Hide empty containers
            const errMapEl = document.getElementById('errorMap');
            if (errMapEl && errMapEl.parentElement) {
                errMapEl.parentElement.style.display = 'none';
            }
            const cards = document.querySelectorAll('.content-body > .card, .main-content > .card, .card');
            if (cards) {
                cards.forEach(c => {
                    if (c && (c.querySelector('canvas') || c.querySelector('#errorMap'))) {
                        c.style.display = 'none';
                    }
                });
            }
        }
    } catch (error) {
        console.error('Failed to initialize verification page:', error);
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

function updateMetrics(summary) {
    document.getElementById('valRmse').textContent = summary.rmse.toFixed(2);
    document.getElementById('valMae').textContent = summary.mae.toFixed(2);
}

function populateStationFilter(data) {
    const filter = document.getElementById('stationFilter');
    const stations = [...new Set(data.map(d => d.station_name))].sort();
    
    stations.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        filter.appendChild(option);
    });

    filter.addEventListener('change', (e) => {
        const selected = e.target.value;
        const filteredData = selected === 'all' ? data : data.filter(d => d.station_name === selected);
        updateCharts(filteredData);
        updateTable(filteredData);
        // Zoom map to station
        if (selected !== 'all') {
            const s = data.find(d => d.station_name === selected);
            if (s && s.latitude) errorMap.setView([s.latitude, s.longitude], 12);
        } else {
            errorMap.setView([-6.9, 107.6], 8);
        }
    });
}

function renderCharts(data) {
    const ctx1 = document.getElementById('verificationChart').getContext('2d');
    const ctx2 = document.getElementById('errorDistChart').getContext('2d');

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

    // Chart 2: Error Scatter
    charts.error = new Chart(ctx2, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Prediction Error',
                data: data.map(d => ({ x: d.actual_rainfall, y: d.predicted_rainfall })),
                backgroundColor: 'rgba(239, 68, 68, 0.5)',
                pointRadius: 6,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Aktual (mm)' }, beginAtZero: true },
                y: { title: { display: true, text: 'Prediksi (mm)' }, beginAtZero: true }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const d = data[context.dataIndex];
                            return `${d.station_name}: Pred ${parseFloat(d.predicted_rainfall).toFixed(1)}mm vs Act ${parseFloat(d.actual_rainfall).toFixed(1)}mm (Err: ${parseFloat(d.error).toFixed(1)}mm)`;
                        }
                    }
                }
            }
        }
    });
}

function updateCharts(data) {
    if (charts.comparison) {
        charts.comparison.data.labels = data.map(d => d.station_name);
        charts.comparison.data.datasets[0].data = data.map(d => d.predicted_rainfall);
        charts.comparison.data.datasets[1].data = data.map(d => d.actual_rainfall);
        charts.comparison.update();
    }
    if (charts.error) {
        charts.error.data.datasets[0].data = data.map(d => ({ x: d.actual_rainfall, y: d.predicted_rainfall }));
        charts.error.update();
    }
}

function updateTable(data) {
    const body = document.getElementById('verifyBody');
    body.innerHTML = '';

    data.forEach(d => {
        const tr = document.createElement('tr');
        const diffClass = d.error > 5 ? 'diff-pos' : (d.error < -5 ? 'diff-pos' : 'diff-neutral');
        const catAct = getRainfallCategory(d.actual_rainfall);
        
        tr.innerHTML = `
            <td><strong>${d.station_name}</strong><br><small>${d.station_type}</small></td>
            <td>${parseFloat(d.predicted_rainfall).toFixed(1)} mm</td>
            <td>${parseFloat(d.actual_rainfall).toFixed(1)} mm<br><span style="font-size:0.7rem; color:${catAct.color}; font-weight:700">${catAct.label}</span></td>
            <td class="${diffClass}">${d.error > 0 ? '+' : ''}${parseFloat(d.error).toFixed(1)} mm</td>
        `;
        body.appendChild(tr);
    });
}
