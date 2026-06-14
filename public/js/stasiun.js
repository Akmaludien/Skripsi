/**
 * Daftar Stasiun Page – Table-based design with pagination & filters
 */

let allStations = [];
let filteredStations = [];
let currentPage = 1;
let rowsPerPage = 10;

document.addEventListener('DOMContentLoaded', () => {
    loadStations();
    setupFilters();
});



// ─── Load stations ─────────────────────────────────
async function loadStations() {
    try {
        const type = document.getElementById('typeFilter').value;
        const status = document.getElementById('statusFilter').value;
        const search = document.getElementById('searchInput').value;

        let params = [];
        if (type !== 'all') params.push(`type=${type}`);
        if (status !== 'all') params.push(`status=${encodeURIComponent(status)}`);
        if (search) params.push(`search=${encodeURIComponent(search)}`);

        allStations = await API.get(`/api/stations?${params.join('&')}`);
        filteredStations = allStations;
        currentPage = 1;
        renderTable();
        renderStatusSummary();
    } catch (e) {
        console.error('Failed to load stations:', e);
    }
}

// ─── Render Table ──────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('stationTableBody');
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredStations.slice(start, end);

    if (pageData.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8" class="empty-state">
                <div class="icon"><i class="ri-radar-line"></i></div>
                <div style="font-size:1rem;font-weight:600;margin-bottom:4px">Stasiun tidak ditemukan</div>
                <div style="font-size:0.85rem">Coba ubah filter pencarian Anda</div>
            </td></tr>
        `;
        updatePagination();
        return;
    }

    tbody.innerHTML = pageData.map((s, i) => {
        const num = start + i + 1;
        const statusClass = getStatusClass(s.status);
        const statusLabel = s.status || 'Unknown';

        const rrQC = checkDataQC('rr', s.latest_rr);
        const tempQC = checkDataQC('temp', s.latest_temp);
        const battQC = checkDataQC('batt', s.latest_batt);
        const isAnomalous = !rrQC.valid || !tempQC.valid || !battQC.valid;

        return `
        <tr class="${isAnomalous ? 'row-qc-warning' : ''}">
            <td class="row-num">${String(num).padStart(2, '0')}</td>
            <td><span class="station-id">${s.id}</span></td>
            <td class="station-name-cell">
                <a href="/detail.html?id=${s.id}">${s.name}</a>
                ${isAnomalous ? '<span style="color:#ef4444; font-size:1rem; margin-left:4px;" title="Data Anomaly Detected"><i class="ri-error-warning-line"></i></span>' : ''}
            </td>
            <td><span class="type-badge type-${s.type.toLowerCase()}">${s.type}</span></td>
            <td class="location-cell"><span class="loc-icon"><i class="ri-map-pin-line"></i></span>${s.location}</td>
            <td class="coords-cell">${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}</td>
            <td class="elevation-cell">${s.elevation !== null && s.elevation !== undefined ? s.elevation + ' m' : '-'}</td>
            <td><span class="status-badge ${statusClass}"><span class="dot"></span>${statusLabel}</span></td>
            <td><a href="/detail.html?id=${s.id}" class="action-link"><i class="ri-line-chart-line"></i> Detail</a></td>
        </tr>
        `;
    }).join('');

    updatePagination();
}

function getStatusClass(status) {
    if (!status) return 'status-offline';
    if (status.includes('Alert')) return 'status-alert';
    if (status.includes('Warning')) return 'status-warning';
    if (status === 'Offline') return 'status-offline';
    return 'status-normal';
}

// ─── Render status summary pills ───────────────────
function renderStatusSummary() {
    const container = document.getElementById('statusSummary');
    const counts = {
        total: filteredStations.length,
        normal: filteredStations.filter(s => s.status === 'Active / Normal').length,
        alert: filteredStations.filter(s => s.status === 'Active / Alert').length,
        warning: filteredStations.filter(s => s.status === 'Active / Warning').length,
        offline: filteredStations.filter(s => s.status === 'Offline').length,
    };

    container.innerHTML = `
        <span class="stat-pill"><span class="count" style="color: var(--text-primary)">${counts.total}</span> Total</span>
        <span class="stat-pill normal"><span class="count">${counts.normal}</span> Normal</span>
        <span class="stat-pill alert"><span class="count">${counts.alert}</span> Alert</span>
        <span class="stat-pill warning"><span class="count">${counts.warning}</span> Warning</span>
        <span class="stat-pill offline"><span class="count">${counts.offline}</span> Offline</span>
    `;
}

// ─── Pagination ────────────────────────────────────
function updatePagination() {
    const totalItems = filteredStations.length;
    const totalPages = Math.ceil(totalItems / rowsPerPage) || 1;
    const start = (currentPage - 1) * rowsPerPage + 1;
    const end = Math.min(currentPage * rowsPerPage, totalItems);

    document.getElementById('paginationInfo').textContent =
        totalItems > 0 ? `Menampilkan ${start}–${end} dari ${totalItems} stasiun` : 'Tidak ada data';

    const pagesContainer = document.getElementById('paginationPages');

    if (totalPages <= 1) {
        pagesContainer.innerHTML = '';
        return;
    }

    let buttons = [];
    buttons.push(`<button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`);

    for (let p = 1; p <= totalPages; p++) {
        if (p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
            buttons.push(`<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`);
        } else if (p === currentPage - 2 || p === currentPage + 2) {
            buttons.push(`<span class="page-ellipsis">…</span>`);
        }
    }

    buttons.push(`<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`);
    pagesContainer.innerHTML = buttons.join('');
}

function goToPage(page) {
    const totalPages = Math.ceil(filteredStations.length / rowsPerPage);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderTable();
    // Scroll table into view
    document.querySelector('.station-table-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function changeRowsPerPage() {
    rowsPerPage = parseInt(document.getElementById('rowsPerPage').value);
    currentPage = 1;
    renderTable();
}

// ─── Filters ───────────────────────────────────────
function setupFilters() {
    let debounce;
    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(loadStations, 300);
    });
    document.getElementById('typeFilter').addEventListener('change', loadStations);
    document.getElementById('statusFilter').addEventListener('change', loadStations);
}

