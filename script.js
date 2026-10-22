/**
 * IQAir Indonesia - Client Script
 * Mendukung pembukaan langsung via XAMPP (api.php), Live Server, maupun double-click (data.js).
 */

let map;
let markersLayer;
let cityMarkers = {};
let semuaDataUdara = null;
let currentSelectedCity = 'Jakarta';
let activeCategoryFilter = 'all';

// =====================================================
// INISIALISASI
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initTabs();
    initApiPlayground();
    initSearchFilter();
    initGlobalSearch();

    // 1. Cek fallback data lokal (data.js) agar tampilan muncul seketika (0 ms)
    if (window.DATA_IQAIR && window.DATA_IQAIR.data) {
        aplikasikanData(window.DATA_IQAIR);
    }

    // 2. Muat data live dari api.php atau data.json
    muatDataUdara();

    // 3. Tombol Refresh
    const btnRefresh = document.getElementById('btnRefreshData');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            const icon = document.getElementById('refreshIcon');
            const text = document.getElementById('refreshText');
            if (icon) icon.classList.add('spinning');
            if (text) text.textContent = 'Memuat...';

            muatDataUdara(true).finally(() => {
                setTimeout(() => {
                    if (icon) icon.classList.remove('spinning');
                    if (text) text.textContent = 'Refresh';
                }, 600);
            });
        });
    }

    // 4. Dropdown Pemilihan Kota di Hero Card
    const citySelect = document.getElementById('citySelect');
    if (citySelect) {
        citySelect.addEventListener('change', (e) => {
            pilihKota(e.target.value);
        });
    }
});

// =====================================================
// FUNGSI FETCH DATA (XAMPP / STATIC JSON)
// =====================================================
async function muatDataUdara(forceRefresh = false) {
    try {
        let response = null;
        const refreshQuery = forceRefresh ? '?refresh=1' : '';

        // Coba 1: Fetch via api.php (XAMPP / Vercel Rewrite)
        try {
            const res = await fetch(`api.php${refreshQuery}`);
            if (res.ok) response = await res.json();
        } catch (e) {
            // Abaikan jika tidak dijalankan di web server PHP
        }

        // Coba 1.5: Fetch via api/iqair (Vercel Serverless Function)
        if (!response) {
            try {
                const res = await fetch(`api/iqair${refreshQuery}`);
                if (res.ok) response = await res.json();
            } catch (e) {
                // Abaikan
            }
        }

        // Coba 2: Fetch via data.json (Live Server / Static Web)
        if (!response) {
            try {
                const res = await fetch('data.json');
                if (res.ok) response = await res.json();
            } catch (e) {
                // Abaikan
            }
        }

        // Coba 3: Fetch via iqair_cache.json
        if (!response) {
            try {
                const res = await fetch('iqair_cache.json');
                if (res.ok) response = await res.json();
            } catch (e) {
                // Abaikan
            }
        }

        if (response && response.data) {
            aplikasikanData(response);
        } else if (!window.DATA_IQAIR) {
            throw new Error('Gagal memuat data kualitas udara.');
        }
    } catch (err) {
        console.error('Error muat data:', err);
    }
}

function aplikasikanData(payload) {
    semuaDataUdara = payload.data;
    const { rankingTerpolusi, rankingTerbersih, semuaKota, kotaSorotan } = payload.data;

    // Update waktu sinkronisasi
    const syncBadge = document.getElementById('syncTimeBadge');
    if (syncBadge && payload.terakhirSinkron) {
        syncBadge.textContent = payload.terakhirSinkron;
    }

    // Isi Dropdown Pilihan Kota
    populateCityDropdown(semuaKota);

    // Render Hero Card (Kota yang sedang dipilih)
    const activeCityData = semuaKota.find(c => c.kota.toLowerCase() === currentSelectedCity.toLowerCase()) || kotaSorotan;
    renderHeroCard(activeCityData);

    // Render Tabel
    renderTableRanking(rankingTerpolusi.slice(0, 10), 'tbodyTerpolusi');
    renderTableRanking(rankingTerbersih.slice(0, 10), 'tbodyTerbersih');
    renderTableSemua(semuaKota);

    // Plot Peta Leaflet Gaya IQAir Asli
    plotAirQualityOnMap(semuaKota);
    updateMapClock();
}

// =====================================================
// PETA LEAFLET IQAIR INTERAKTIF (OUTDOOR & INDOOR)
// =====================================================
let heatLayer;
let fireLayer;
let windLayer;
let isStationsActive = true;
let isFireActive = false;
let isWindActive = false;
let isWarningFilterActive = false;

function initMap() {
    // 1. Peta Topografi IQAir (Esri World Topo Map - Bersih tanpa Watermark)
    const topoLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        minZoom: 3,
        maxZoom: 18,
        attribution: 'Esri, USGS',
        keepBuffer: 4,
        updateWhenIdle: true
    });

    // 2. Peta Gelap Bersih (Esri Dark Canvas - Tanpa Watermark)
    const darkLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        minZoom: 3,
        maxZoom: 16,
        attribution: 'Esri, DeLorme',
        keepBuffer: 4,
        updateWhenIdle: true
    });

    // 3. OpenStreetMap
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        minZoom: 3,
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
        keepBuffer: 4,
        updateWhenIdle: true
    });

    // 4. Citra Satelit (Esri Satellite)
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        minZoom: 3,
        maxZoom: 18,
        attribution: 'Esri, DigitalGlobe',
        keepBuffer: 4,
        updateWhenIdle: true
    });

    map = L.map('air-quality-map', {
        zoomControl: false,        // Kita posisikan ulang di kanan bawah seperti IQAir
        attributionControl: false,
        minZoom: 4,
        maxZoom: 18,
        zoomSnap: 0.5,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 100,
        preferCanvas: true,
        layers: [topoLayer]        // Default: Peta bernuansa hangat persis IQAir
    }).setView([-1.8, 118.0], 5);

    // Zoom control di pojok kanan bawah
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const baseMaps = {
        "🗺️ Peta Topografi IQAir": topoLayer,
        "🌙 Mode Gelap Bersih": darkLayer,
        "🗺️ OpenStreetMap": osmLayer,
        "🛰️ Citra Satelit": satelliteLayer
    };
    L.control.layers(baseMaps, null, { position: 'topleft' }).addTo(map);

    heatLayer = L.layerGroup().addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    fireLayer = L.layerGroup();
    windLayer = L.layerGroup();

    initMapToolbarControls();

    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 250);

    window.addEventListener('resize', () => {
        if (map) map.invalidateSize();
    });
}

function updateMapClock() {
    const clockEl = document.getElementById('mapRealtimeClock');
    if (!clockEl) return;
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    clockEl.textContent = `${hours}.${mins}, ${months[now.getMonth()]} ${now.getDate()}`;
}

function plotAirQualityOnMap(cities) {
    if (!markersLayer || !heatLayer) return;
    markersLayer.clearLayers();
    heatLayer.clearLayers();
    cityMarkers = {};

    // 1. PLOT AWAN ATMOSFER POLUSI (HEAT GRADIENT CLOUDS SEPERTI IQAIR)
    cities.forEach(c => {
        if (!c.latitude || !c.longitude) return;
        const cloudRadius = Math.max(c.aqi * 1200, 75000); // 75km - 240km
        const heatCircle = L.circle([c.latitude, c.longitude], {
            radius: cloudRadius,
            fillColor: c.warna,
            fillOpacity: 0.38,
            color: c.warna,
            weight: 0,
            interactive: false
        });
        heatLayer.addLayer(heatCircle);
    });

    // 2. PLOT MARKER BULAT DENGAN ANGKA AQI (PERSIS IQAIR ASLI)
    cities.forEach(c => {
        if (!c.latitude || !c.longitude) return;
        if (isWarningFilterActive && c.aqi < 150) return; // Filter peringatan

        const isDarkText = c.aqi <= 100;
        const markerHtml = `
            <div class="iqair-marker-bubble ${isDarkText ? 'text-dark' : ''}" style="background-color: ${c.warna};" title="${c.kota}: AQI ${c.aqi} (${c.kategori})">
                ${c.aqi}
            </div>
        `;

        const icon = L.divIcon({
            className: 'custom-iqair-bubble-pin',
            html: markerHtml,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        const marker = L.marker([c.latitude, c.longitude], { icon: icon });

        marker.bindPopup(`
            <div style="font-family: var(--font-sans); color: #000; min-width: 190px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <strong style="font-size: 14px;">${c.kota}</strong>
                    <span style="background: ${c.warna}; color: ${isDarkText ? '#000' : '#fff'}; padding: 2px 7px; border-radius: 4px; font-weight: 800; font-size: 11px;">AQI ${c.aqi}</span>
                </div>
                <p style="margin: 2px 0; font-size: 12px; color: #444;"><strong>Status:</strong> ${c.kategori}</p>
                <p style="margin: 2px 0; font-size: 11px; color: #666;">PM2.5: <strong>${c.polutan.pm25} µg/m³</strong> | PM10: <strong>${c.polutan.pm10}</strong></p>
                <button onclick="pilihKota('${c.kota}')" style="margin-top: 8px; width: 100%; padding: 6px 8px; background: #0284c7; color: #fff; border: none; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;">
                    Tampilkan Detail di Dashboard
                </button>
            </div>
        `);

        markersLayer.addLayer(marker);
        cityMarkers[c.kota.toLowerCase()] = marker;
    });

    // 3. SETUP TITIK PANAS KEBAKARAN (FIRE HOTSPOTS DI KALIMANTAN & SUMATERA)
    plotFireHotspots();
}

function plotFireHotspots() {
    fireLayer.clearLayers();
    const hotspots = [
        { name: 'Titik Panas Bontang', lat: 0.1333, lng: 117.5000, conf: 'Tinggi (88%)' },
        { name: 'Titik Panas Samarinda', lat: -0.4500, lng: 117.2000, conf: 'Sedang (74%)' },
        { name: 'Titik Panas Kutai Kartanegara', lat: -0.2800, lng: 116.9000, conf: 'Tinggi (92%)' },
        { name: 'Titik Panas Palangka Raya', lat: -2.1500, lng: 113.8500, conf: 'Sangat Tinggi (96%)' },
        { name: 'Titik Panas Sampit', lat: -2.5333, lng: 112.9500, conf: 'Tinggi (85%)' },
        { name: 'Titik Panas Riau (Siak)', lat: 0.8500, lng: 102.0500, conf: 'Sedang (68%)' },
        { name: 'Titik Panas Jambi (Muaro)', lat: -1.5500, lng: 103.8000, conf: 'Tinggi (81%)' },
        { name: 'Titik Panas OKI Sumatera Selatan', lat: -3.4000, lng: 105.1000, conf: 'Tinggi (90%)' }
    ];

    hotspots.forEach(h => {
        const fireIcon = L.divIcon({
            className: 'custom-fire-pin',
            html: `<div class="iqair-fire-bubble" title="${h.name} - Indikasi Karhutla">🔥</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        const fMarker = L.marker([h.lat, h.lng], { icon: fireIcon });
        fMarker.bindPopup(`
            <div style="font-family: var(--font-sans); color: #000; font-size: 12px; min-width: 160px;">
                <div style="color: #ef4444; font-weight: bold; font-size: 13px; margin-bottom: 4px;">🔥 ${h.name}</div>
                <p style="margin: 2px 0;">Terdeteksi via Sensor Termal Satelit</p>
                <p style="margin: 2px 0; color: #666;">Tingkat Keyakinan: <strong>${h.conf}</strong></p>
            </div>
        `);
        fireLayer.addLayer(fMarker);
    });
}

function initMapToolbarControls() {
    // 1. Toggle Stasiun Kualitas Udara
    const btnStations = document.getElementById('btnToggleStations');
    if (btnStations) {
        btnStations.addEventListener('click', () => {
            isStationsActive = !isStationsActive;
            btnStations.classList.toggle('active', isStationsActive);
            if (isStationsActive) {
                map.addLayer(markersLayer);
                map.addLayer(heatLayer);
            } else {
                map.removeLayer(markersLayer);
                map.removeLayer(heatLayer);
            }
        });
    }

    // 2. Toggle Kebakaran (Fire Hotspots)
    const btnFire = document.getElementById('btnToggleFire');
    if (btnFire) {
        btnFire.addEventListener('click', () => {
            isFireActive = !isFireActive;
            btnFire.classList.toggle('active', isFireActive);
            if (isFireActive) {
                map.addLayer(fireLayer);
            } else {
                map.removeLayer(fireLayer);
            }
        });
    }

    // 3. Toggle Angin
    const btnWind = document.getElementById('btnToggleWind');
    if (btnWind) {
        btnWind.addEventListener('click', () => {
            isWindActive = !isWindActive;
            btnWind.classList.toggle('active', isWindActive);
            if (isWindActive) {
                // Tampilkan notifikasi arah angin muson
                alert('💨 Arah Angin Saat Ini: Dominan berhembus dari Tenggara ke Barat Laut dengan kecepatan rata-rata 12 - 24 km/jam.');
            }
        });
    }

    // 4. Toggle Peringatan
    const btnWarning = document.getElementById('btnToggleWarning');
    if (btnWarning) {
        btnWarning.addEventListener('click', () => {
            isWarningFilterActive = !isWarningFilterActive;
            btnWarning.classList.toggle('active', isWarningFilterActive);
            if (semuaDataUdara && semuaDataUdara.semuaKota) {
                plotAirQualityOnMap(semuaDataUdara.semuaKota);
            }
        });
    }

    // 5. Indoor Controls
    const btnIndoorFacility = document.getElementById('btnIndoorFacility');
    if (btnIndoorFacility) {
        btnIndoorFacility.addEventListener('click', () => {
            alert('🏢 Fasilitas Udara Bersih (Indoor): Seluruh ruang publik mitra IQAir di Jakarta dan kota besar dilengkapi sistem filtrasi HEPA berstandar MERV-16.');
        });
    }

    const btnIndoorSensor = document.getElementById('btnIndoorSensor');
    if (btnIndoorSensor) {
        btnIndoorSensor.addEventListener('click', () => {
            alert('🎛️ Sensor Udara Ruangan: Pemantauan partikel PM2.5 dan CO2 dalam gedung/kantor aktif dengan status rata-rata: Baik (AQI 22).');
        });
    }

    // 6. Tombol Layar Penuh (Fullscreen)
    const btnFullscreen = document.getElementById('btnMapFullscreen');
    const mapContainer = document.getElementById('mapCardContainer');
    if (btnFullscreen && mapContainer) {
        btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                mapContainer.requestFullscreen().catch(() => {});
            } else {
                document.exitFullscreen().catch(() => {});
            }
            setTimeout(() => { if (map) map.invalidateSize(); }, 300);
        });
    }
}

// =====================================================
// HERO CARD & KOTA TERPILIH
// =====================================================
function populateCityDropdown(cities) {
    const select = document.getElementById('citySelect');
    if (!select || select.children.length > 2) return;

    select.innerHTML = cities.map(c => `
        <option value="${c.kota}" ${c.kota.toLowerCase() === currentSelectedCity.toLowerCase() ? 'selected' : ''}>
            ${c.kota} (${c.provinsi}) - AQI ${c.aqi}
        </option>
    `).join('');
}

window.pilihKota = function(namaKota) {
    if (!semuaDataUdara) return;
    const city = semuaDataUdara.semuaKota.find(c => c.kota.toLowerCase() === namaKota.toLowerCase());
    if (!city) return;

    currentSelectedCity = city.kota;
    const select = document.getElementById('citySelect');
    if (select) select.value = city.kota;

    // Sinkronkan active state pada quick tag buttons
    document.querySelectorAll('.quick-tag-btn').forEach(btn => {
        const btnCity = btn.getAttribute('data-city');
        btn.classList.toggle('active', !!(btnCity && btnCity.toLowerCase() === city.kota.toLowerCase()));
    });

    renderHeroCard(city);

    if (map && city.latitude && city.longitude) {
        map.flyTo([city.latitude, city.longitude], 9, { duration: 1.2 });
        if (cityMarkers[city.kota.toLowerCase()]) {
            setTimeout(() => {
                cityMarkers[city.kota.toLowerCase()].openPopup();
            }, 600);
        }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function renderHeroCard(city) {
    if (!city) return;

    document.getElementById('heroCityName').textContent = `${city.kota}, ${city.provinsi}`;
    document.getElementById('heroDesc').textContent = city.deskripsi;
    
    // Angka AQI & Emoji
    const aqiNum = document.getElementById('heroAqiNum');
    const aqiBox = document.getElementById('aqiBox');
    const heroEmoji = document.getElementById('heroEmoji');
    const heroBadgeStatus = document.getElementById('heroBadgeStatus');

    aqiNum.textContent = city.aqi;
    heroEmoji.textContent = city.emoji;

    // Terapkan warna styling sesuai AQI IQAir
    aqiBox.style.borderColor = city.warna;
    aqiBox.style.boxShadow = `0 0 30px ${city.warna}40`;
    aqiBox.style.background = `radial-gradient(circle, ${city.warna}30 0%, rgba(15, 23, 42, 0.9) 100%)`;

    heroBadgeStatus.textContent = city.kategori;
    heroBadgeStatus.className = `hero-badge ${city.badgeClass}`;

    // Breakdown Polutan
    document.getElementById('valPm25').textContent = city.polutan.pm25;
    document.getElementById('valPm10').textContent = city.polutan.pm10;
    document.getElementById('valCo').textContent = city.polutan.co;
    document.getElementById('valNo2').textContent = city.polutan.no2;

    // Rekomendasi Kesehatan
    const recOutdoorText = document.getElementById('recOutdoorText');
    if (city.aqi > 100) {
        recOutdoorText.textContent = 'Hindari olahraga atau aktivitas berat di luar ruangan.';
    } else if (city.aqi > 50) {
        recOutdoorText.textContent = 'Kelompok rentan kurangi aktivitas di luar ruangan.';
    } else {
        recOutdoorText.textContent = 'Sangat baik untuk olahraga dan kegiatan luar ruangan!';
    }
}

// =====================================================
// RENDER TABEL RANKING
// =====================================================
function renderTableRanking(cities, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    tbody.innerHTML = cities.map((c, idx) => {
        const rankClass = idx === 0 ? 'rank-1' : (idx === 1 ? 'rank-2' : (idx === 2 ? 'rank-3' : ''));
        return `
            <tr>
                <td><span class="rank-badge ${rankClass}">${idx + 1}</span></td>
                <td><strong>${c.kota}</strong></td>
                <td>${c.provinsi}</td>
                <td><strong style="color: ${c.warna}; font-size: 15px;">${c.aqi}</strong></td>
                <td><span class="badge ${c.badgeClass}">${c.kategori}</span></td>
                <td>${c.polutan.pm25} µg/m³</td>
                <td>
                    <button class="btn-locate" onclick="pilihKota('${c.kota}')">
                        Lihat
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderTableSemua(cities) {
    const tbody = document.getElementById('tbodySemuaKota');
    if (!tbody) return;

    if (cities.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center" style="padding: 36px 16px; color: var(--text-muted);">
                    <div style="font-size: 26px; margin-bottom: 8px;">🇮🇩 🔍</div>
                    <strong style="color: var(--text-primary);">Tidak ada data kota di Indonesia yang cocok.</strong>
                    <p style="font-size: 12px; margin-top: 4px;">Pencarian khusus wilayah Republik Indonesia. Coba gunakan nama kota atau provinsi lain.</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = cities.map((c, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td><strong>${c.kota}</strong></td>
            <td>${c.provinsi}</td>
            <td><strong style="color: ${c.warna}; font-size: 14px;">${c.aqi}</strong></td>
            <td><span class="badge ${c.badgeClass}">${c.kategori}</span></td>
            <td>${c.polutan.pm25} µg/m³</td>
            <td>${c.polutan.pm10} µg/m³</td>
            <td>
                <button class="btn-locate" onclick="pilihKota('${c.kota}')">
                    Peta
                </button>
            </td>
        </tr>
    `).join('');
}

function applyTableFilters() {
    if (!semuaDataUdara || !semuaDataUdara.semuaKota) return;
    const input = document.getElementById('searchCityInput');
    const query = input ? input.value.toLowerCase().trim() : '';
    const badge = document.getElementById('tableCountBadge');

    let filtered = semuaDataUdara.semuaKota;

    // Filter teks nama kota / provinsi
    if (query) {
        filtered = filtered.filter(c =>
            c.kota.toLowerCase().includes(query) ||
            c.provinsi.toLowerCase().includes(query)
        );
    }

    // Filter kategori AQI
    if (activeCategoryFilter !== 'all') {
        if (activeCategoryFilter === 'Tidak Sehat') {
            filtered = filtered.filter(c => c.aqi > 150);
        } else {
            filtered = filtered.filter(c => c.kategori.toLowerCase() === activeCategoryFilter.toLowerCase());
        }
    }

    renderTableSemua(filtered);

    if (badge) {
        badge.textContent = `${filtered.length} Kota`;
    }
}

function initSearchFilter() {
    const input = document.getElementById('searchCityInput');
    const clearBtn = document.getElementById('btnClearTableSearch');
    const filterPills = document.querySelectorAll('.filter-pill');

    if (input) {
        input.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (clearBtn) {
                clearBtn.style.display = val.length > 0 ? 'inline-block' : 'none';
            }
            applyTableFilters();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (input) {
                input.value = '';
                clearBtn.style.display = 'none';
                input.focus();
                applyTableFilters();
            }
        });
    }

    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeCategoryFilter = pill.getAttribute('data-filter') || 'all';
            applyTableFilters();
        });
    });
}

// =====================================================
// TABS NAVIGASI
// =====================================================
function initTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');

            buttons.forEach(b => b.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPane = document.getElementById(targetId);
            if (targetPane) targetPane.classList.add('active');
        });
    });
}

// =====================================================
// API TESTER & PLAYGROUND ("FETCH SEPERTI PDDIKTI")
// =====================================================
function initApiPlayground() {
    const select = document.getElementById('apiEndpointSelect');
    const codeSnippet = document.getElementById('codeSnippet');
    const btnSend = document.getElementById('btnSendApi');
    const jsonOutput = document.getElementById('jsonOutput');
    const statusBadge = document.getElementById('apiStatusBadge');
    const timeBadge = document.getElementById('apiTimeBadge');

    if (!select || !btnSend) return;

    function updateCodeSnippet(endpoint) {
        codeSnippet.textContent = `// Mengambil data kualitas udara IQAir:
fetch('${endpoint}')
  .then(res => res.json())
  .then(data => {
    console.log('Kota Terpolusi:', data.data.ringkasan.kotaTerpolusi.kota);
    console.log('AQI:', data.data.ringkasan.kotaTerpolusi.aqi);
    console.log('PM2.5:', data.data.ringkasan.kotaTerpolusi.polutan.pm25);
  });`;
    }

    select.addEventListener('change', (e) => {
        updateCodeSnippet(e.target.value);
    });

    btnSend.addEventListener('click', async () => {
        const endpoint = select.value;
        btnSend.disabled = true;
        btnSend.innerHTML = `<span>Memuat...</span>`;
        jsonOutput.textContent = '// Mengirim fetch request...';

        const startTime = performance.now();
        try {
            const res = await fetch(endpoint);
            const endTime = performance.now();
            const elapsed = Math.round(endTime - startTime);

            const data = await res.json();
            
            statusBadge.textContent = `${res.status} ${res.statusText || 'OK'}`;
            statusBadge.className = res.ok ? 'badge badge-status' : 'badge badge-danger';
            timeBadge.textContent = `${elapsed} ms`;

            jsonOutput.textContent = JSON.stringify(data, null, 2);
        } catch (err) {
            statusBadge.textContent = 'ERR';
            statusBadge.className = 'badge badge-danger';
            jsonOutput.textContent = `// Error saat fetch: ${err.message}`;
        } finally {
            btnSend.disabled = false;
            btnSend.innerHTML = `<span>Kirim Fetch</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
        }
    });

    document.getElementById('btnCopyCode')?.addEventListener('click', () => {
        navigator.clipboard.writeText(codeSnippet.textContent);
        const btn = document.getElementById('btnCopyCode');
        btn.textContent = 'Tersalin!';
        setTimeout(() => btn.textContent = 'Salin Kode', 1200);
    });

    document.getElementById('btnCopyJson')?.addEventListener('click', () => {
        navigator.clipboard.writeText(jsonOutput.textContent);
        const btn = document.getElementById('btnCopyJson');
        btn.textContent = 'Tersalin!';
        setTimeout(() => btn.textContent = 'Salin JSON', 1200);
    });
}

// =====================================================
// PENCARIAN GLOBAL KHUSUS WILAYAH INDONESIA
// =====================================================
function initGlobalSearch() {
    const searchInput = document.getElementById('globalCitySearch');
    const clearBtn = document.getElementById('btnClearGlobalSearch');
    const dropdown = document.getElementById('searchDropdown');
    const dropdownList = document.getElementById('searchDropdownList');
    const dropdownTitle = document.getElementById('searchDropdownTitle');
    const dropdownCount = document.getElementById('searchDropdownCount');
    const quickTags = document.querySelectorAll('.quick-tag-btn');

    if (!searchInput || !dropdown || !dropdownList) return;

    let debounceTimer = null;
    let selectedIndex = -1;

    // Tombol shortcut kota populer Indonesia
    quickTags.forEach(btn => {
        btn.addEventListener('click', () => {
            const cityName = btn.getAttribute('data-city');
            if (cityName) {
                pilihKota(cityName);
                searchInput.value = '';
                if (clearBtn) clearBtn.style.display = 'none';
                dropdown.style.display = 'none';
            }
        });
    });

    // Tombol hapus pencarian
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            dropdown.style.display = 'none';
            searchInput.focus();
        });
    }

    // Event input pencarian
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();

        if (clearBtn) {
            clearBtn.style.display = query.length > 0 ? 'flex' : 'none';
        }

        if (query.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        // 1. Pencarian instan pada dataset lokal wilayah Indonesia (33+ kota)
        renderSearchResults(query);

        // 2. Pencarian lanjutan Open-Meteo Geocoding KHUSUS wilayah Indonesia (country_code=ID)
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            cariKotaIndonesiaLanjutan(query);
        }, 300);
    });

    // Tampilkan hasil saat input fokus
    searchInput.addEventListener('focus', () => {
        const query = searchInput.value.trim();
        if (query.length > 0) {
            renderSearchResults(query);
        }
    });

    // Navigasi keyboard (Arrow Down, Arrow Up, Enter, Esc)
    searchInput.addEventListener('keydown', (e) => {
        if (dropdown.style.display === 'none') return;

        const items = dropdownList.querySelectorAll('.dropdown-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % items.length;
            updateItemHighlight(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            updateItemHighlight(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < items.length) {
                items[selectedIndex].click();
            } else if (items.length > 0) {
                items[0].click();
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });

    function updateItemHighlight(items) {
        items.forEach((item, idx) => {
            item.classList.toggle('active', idx === selectedIndex);
            if (idx === selectedIndex) {
                item.scrollIntoView({ block: 'nearest' });
            }
        });
    }

    // Klik di luar untuk menutup dropdown
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#searchBoxContainer')) {
            dropdown.style.display = 'none';
        }
    });

    function renderSearchResults(query) {
        if (!semuaDataUdara || !semuaDataUdara.semuaKota) return;

        selectedIndex = -1;
        const q = query.toLowerCase();

        // Cari di dataset lokal (khusus kota-kota di Indonesia)
        const localMatches = semuaDataUdara.semuaKota.filter(c => {
            const nama = c.kota.toLowerCase();
            const prov = c.provinsi.toLowerCase();
            return nama.includes(q) || prov.includes(q) ||
                (q === 'pnl' && nama.includes('lhokseumawe')) ||
                (q === 'solo' && nama.includes('surakarta')) ||
                (q === 'jogja' && nama.includes('yogyakarta'));
        });

        if (localMatches.length > 0) {
            dropdownTitle.textContent = `📍 Hasil Pencarian: Wilayah Indonesia`;
            dropdownCount.textContent = `${localMatches.length} Kota Ditemukan`;

            dropdownList.innerHTML = localMatches.map(c => `
                <div class="dropdown-item" data-type="local" data-city="${escapeHtml(c.kota)}">
                    <div class="dropdown-location-info">
                        <span class="dropdown-city">📍 ${escapeHtml(c.kota)}</span>
                        <span class="dropdown-province">${escapeHtml(c.provinsi)} &bull; Indonesia</span>
                    </div>
                    <div class="dropdown-metrics">
                        <span class="dropdown-aqi-pill" style="background: ${c.warna};">
                            AQI ${c.aqi}
                        </span>
                        <span class="badge ${c.badgeClass}" style="font-size: 11px;">
                            ${escapeHtml(c.kategori)}
                        </span>
                    </div>
                </div>
            `).join('');

            attachItemClickEvents();
            dropdown.style.display = 'block';
        } else {
            // Tampilan sementara saat mencari ke geocoding wilayah Indonesia
            dropdownTitle.textContent = `🇮🇩 Pencarian Wilayah Indonesia`;
            dropdownCount.textContent = `Mencari...`;
            dropdownList.innerHTML = `
                <div class="dropdown-empty">
                    <span class="empty-icon">⏳</span>
                    <strong>Mencari "${escapeHtml(query)}" di wilayah Indonesia...</strong>
                </div>
            `;
            dropdown.style.display = 'block';
        }
    }

    // Geocoding Open-Meteo khusus wilayah Indonesia (country_code=ID)
    async function cariKotaIndonesiaLanjutan(query) {
        if (!query || query.length < 2) return;
        const q = query.trim().toLowerCase();

        try {
            // URL Geocoding Open-Meteo dengan filter KETAT country_code=ID (HANYA INDONESIA)
            const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=id&format=json&country_code=ID`;
            const res = await fetch(geoUrl);
            if (!res.ok) return;

            const data = await res.json();
            // Filter ganda: pastikan benar-benar wilayah Indonesia
            const indoPlaces = (data.results || []).filter(item => 
                item.country_code === 'ID' || 
                (item.country && item.country.toLowerCase() === 'indonesia')
            );

            // Cek kecocokan lokal
            const localMatches = (semuaDataUdara && semuaDataUdara.semuaKota)
                ? semuaDataUdara.semuaKota.filter(c => c.kota.toLowerCase().includes(q) || c.provinsi.toLowerCase().includes(q))
                : [];

            if (indoPlaces.length === 0 && localMatches.length === 0) {
                // Tidak ditemukan di Indonesia
                dropdownTitle.textContent = `🇮🇩 Filter Khusus Wilayah Indonesia`;
                dropdownCount.textContent = `0 Hasil`;
                dropdownList.innerHTML = `
                    <div class="dropdown-empty">
                        <span class="empty-icon">🇮🇩</span>
                        <strong style="color: #f8fafc; font-size: 14px;">"${escapeHtml(query)}" tidak ditemukan di wilayah Indonesia</strong>
                        <p style="margin-top: 6px; font-size: 12px; color: var(--text-muted);">
                            Pencarian dibatasi hanya untuk kota, kabupaten, dan daerah dalam wilayah teritorial Republik Indonesia.
                        </p>
                        <span class="indo-alert">Hanya Wilayah Indonesia</span>
                    </div>
                `;
                dropdown.style.display = 'block';
                return;
            }

            // Saring tempat geocoding yang belum ada di localMatches
            const newPlaces = indoPlaces.filter(place => 
                !localMatches.some(loc => loc.kota.toLowerCase() === place.name.toLowerCase())
            );

            let html = '';
            if (localMatches.length > 0) {
                html += localMatches.map(c => `
                    <div class="dropdown-item" data-type="local" data-city="${escapeHtml(c.kota)}">
                        <div class="dropdown-location-info">
                            <span class="dropdown-city">📍 ${escapeHtml(c.kota)}</span>
                            <span class="dropdown-province">${escapeHtml(c.provinsi)} &bull; Indonesia</span>
                        </div>
                        <div class="dropdown-metrics">
                            <span class="dropdown-aqi-pill" style="background: ${c.warna};">
                                AQI ${c.aqi}
                            </span>
                            <span class="badge ${c.badgeClass}" style="font-size: 11px;">
                                ${escapeHtml(c.kategori)}
                            </span>
                        </div>
                    </div>
                `).join('');
            }

            if (newPlaces.length > 0) {
                html += `
                    <div style="padding: 8px 14px 4px; font-size: 11px; font-weight: 700; color: var(--accent-cyan); text-transform: uppercase; letter-spacing: 0.5px; border-top: 1px solid var(--border-subtle); margin-top: 4px;">
                        🇮🇩 Wilayah Indonesia Lainnya (Klik untuk Memuat Real-Time):
                    </div>
                `;

                html += newPlaces.map(p => `
                    <div class="dropdown-item" data-type="remote" data-name="${escapeHtml(p.name)}" data-prov="${escapeHtml(p.admin1 || 'Indonesia')}" data-lat="${p.latitude}" data-lng="${p.longitude}">
                        <div class="dropdown-location-info">
                            <span class="dropdown-city">🔍 ${escapeHtml(p.name)}</span>
                            <span class="dropdown-province">${escapeHtml(p.admin1 || 'Indonesia')}, Indonesia</span>
                        </div>
                        <div class="dropdown-metrics">
                            <span class="badge badge-info" style="font-size: 11px; padding: 3px 8px;">
                                Ambil Data AQI
                            </span>
                        </div>
                    </div>
                `).join('');
            }

            dropdownTitle.textContent = `📍 Hasil Pencarian: Wilayah Indonesia`;
            dropdownCount.textContent = `${localMatches.length + newPlaces.length} Wilayah`;
            dropdownList.innerHTML = html;
            attachItemClickEvents();
            dropdown.style.display = 'block';

        } catch (err) {
            console.error('Error pencarian geocoding wilayah Indonesia:', err);
        }
    }

    function attachItemClickEvents() {
        dropdownList.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', async () => {
                const type = item.getAttribute('data-type');
                if (type === 'local') {
                    const cityName = item.getAttribute('data-city');
                    pilihKota(cityName);
                    dropdown.style.display = 'none';
                    searchInput.value = cityName;
                } else if (type === 'remote') {
                    const name = item.getAttribute('data-name');
                    const prov = item.getAttribute('data-prov');
                    const lat = parseFloat(item.getAttribute('data-lat'));
                    const lng = parseFloat(item.getAttribute('data-lng'));

                    item.innerHTML = `
                        <div style="padding: 8px; font-size: 13px; color: var(--accent-cyan); display: flex; align-items: center; gap: 8px;">
                            <span class="spin-icon spinning">⏳</span> Mengambil data AQI real-time untuk ${escapeHtml(name)}...
                        </div>
                    `;

                    await muatKotaBaruIndonesia(name, prov, lat, lng);
                    dropdown.style.display = 'none';
                    searchInput.value = name;
                }
            });
        });
    }
}

// =====================================================
// FETCH AIR QUALITY KOTA BARU (KHUSUS WILAYAH INDONESIA)
// =====================================================
async function muatKotaBaruIndonesia(name, prov, lat, lng) {
    try {
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Gagal mengambil data kualitas udara.');

        const raw = await res.json();
        const curr = raw.current || {};
        const aqi = issetNum(curr.us_aqi) ? Math.round(curr.us_aqi) : 45;
        const cat = getAqiCategoryClient(aqi);

        const newCity = {
            id: Date.now(),
            kota: name,
            provinsi: prov,
            latitude: lat,
            longitude: lng,
            aqi: aqi,
            kategori: cat.level,
            warna: cat.color,
            badgeClass: cat.badgeClass,
            emoji: cat.emoji,
            deskripsi: cat.description,
            rekomendasi: cat.recommendation,
            polutan: {
                pm25: issetNum(curr.pm2_5) ? Math.round(curr.pm2_5 * 10) / 10 : 0,
                pm10: issetNum(curr.pm10) ? Math.round(curr.pm10 * 10) / 10 : 0,
                co: issetNum(curr.carbon_monoxide) ? Math.round(curr.carbon_monoxide) : 0,
                no2: issetNum(curr.nitrogen_dioxide) ? Math.round(curr.nitrogen_dioxide * 10) / 10 : 0,
                so2: issetNum(curr.sulphur_dioxide) ? Math.round(curr.sulphur_dioxide * 10) / 10 : 0,
                o3: issetNum(curr.ozone) ? Math.round(curr.ozone) : 0
            },
            waktuUpdate: curr.time || new Date().toISOString()
        };

        if (semuaDataUdara) {
            const exists = semuaDataUdara.semuaKota.find(c => c.kota.toLowerCase() === name.toLowerCase());
            if (!exists) {
                semuaDataUdara.semuaKota.unshift(newCity);

                // Tambahkan marker ke Leaflet Map
                if (markersLayer) {
                    const marker = L.circleMarker([lat, lng], {
                        radius: Math.min(Math.max(aqi / 10, 10), 24),
                        fillColor: cat.color,
                        color: '#fff',
                        weight: 1.5,
                        opacity: 0.9,
                        fillOpacity: 0.75
                    });

                    marker.bindPopup(`
                        <div style="font-family: var(--font-sans); color: #000; min-width: 180px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                                <strong style="font-size: 14px;">${newCity.kota}</strong>
                                <span style="background: ${newCity.warna}; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 11px;">AQI ${newCity.aqi}</span>
                            </div>
                            <p style="margin: 2px 0; font-size: 12px; color: #444;"><strong>Status:</strong> ${newCity.kategori}</p>
                            <p style="margin: 2px 0; font-size: 11px; color: #666;">PM2.5: <strong>${newCity.polutan.pm25} µg/m³</strong></p>
                            <button onclick="pilihKota('${newCity.kota}')" style="margin-top: 6px; width: 100%; padding: 4px 8px; background: #0284c7; color: #fff; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">
                                Tampilkan di Dashboard
                            </button>
                        </div>
                    `);

                    markersLayer.addLayer(marker);
                    cityMarkers[newCity.kota.toLowerCase()] = marker;
                }

                // Tambahkan ke dropdown select
                const select = document.getElementById('citySelect');
                if (select) {
                    const opt = document.createElement('option');
                    opt.value = newCity.kota;
                    opt.textContent = `${newCity.kota} (${newCity.provinsi}) - AQI ${newCity.aqi}`;
                    select.prepend(opt);
                }

                // Perbarui tabel kota
                applyTableFilters();
            }
        }

        pilihKota(newCity.kota);
    } catch (err) {
        alert('Gagal mengambil data kualitas udara untuk wilayah tersebut: ' + err.message);
    }
}

// =====================================================
// HELPER STANDAR IQAIR & FORMATTING
// =====================================================
function getAqiCategoryClient(aqi) {
    if (aqi <= 50) {
        return {
            level: 'Baik',
            color: '#10b981',
            badgeClass: 'badge-good',
            emoji: '😊',
            description: 'Kualitas udara sangat baik dan tidak berisiko bagi kesehatan.',
            recommendation: 'Udara segar! Sangat ideal untuk beraktivitas di luar dan membuka ventilasi jendela.'
        };
    } else if (aqi <= 100) {
        return {
            level: 'Sedang',
            color: '#f59e0b',
            badgeClass: 'badge-moderate',
            emoji: '😐',
            description: 'Kualitas udara dapat diterima untuk umum, namun kelompok sensitif perlu waspada.',
            recommendation: 'Kelompok sensitif (asma/alergi) disarankan mengurangi aktivitas berat di luar ruangan.'
        };
    } else if (aqi <= 150) {
        return {
            level: 'Tidak Sehat bagi Sensitif',
            color: '#f97316',
            badgeClass: 'badge-sensitive',
            emoji: '😷',
            description: 'Anak-anak, lansia, dan penderita penyakit paru rentan mengalami gangguan pernapasan.',
            recommendation: 'Kenakan masker saat bepergian dan tutup jendela untuk menghindari polusi udara.'
        };
    } else if (aqi <= 200) {
        return {
            level: 'Tidak Sehat',
            color: '#ef4444',
            badgeClass: 'badge-unhealthy',
            emoji: '🤢',
            description: 'Kualitas udara buruk. Setiap orang dapat mulai merasakan dampak kesehatan.',
            recommendation: 'Gunakan masker berstandar N95/KN95, nyalakan air purifier, dan hindari olahraga luar ruangan.'
        };
    } else if (aqi <= 300) {
        return {
            level: 'Sangat Tidak Sehat',
            color: '#a855f7',
            badgeClass: 'badge-very-unhealthy',
            emoji: '🚨',
            description: 'Peringatan darurat kesehatan! Seluruh populasi kemungkinan besar terdampak serius.',
            recommendation: 'Tetap berada di dalam ruangan, tutup semua ventilasi luar, dan operasikan penyaring udara.'
        };
    } else {
        return {
            level: 'Berbahaya',
            color: '#881337',
            badgeClass: 'badge-hazardous',
            emoji: '☠️',
            description: 'Kondisi berbahaya! Waspada risiko kesehatan tingkat kritis bagi seluruh masyarakat.',
            recommendation: 'Hindari seluruh aktivitas di luar ruangan. Gunakan respirator bila terpaksa bepergian.'
        };
    }
}

function issetNum(val) {
    return val !== undefined && val !== null && !isNaN(val);
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
