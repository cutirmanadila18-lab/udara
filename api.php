<?php
date_default_timezone_set('Asia/Jakarta');
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// ====================================================================
// KONFIGURASI CACHE IQAIR AIR QUALITY
// ====================================================================
$cacheFile = __DIR__ . '/iqair_cache.json';
$dataJsonFile = __DIR__ . '/data.json';
$dataJsFile = __DIR__ . '/data.js';

$cacheDuration = 300; // 5 menit
$forceRefresh = isset($_GET['refresh']) && ($_GET['refresh'] == '1' || $_GET['refresh'] == 'true');

// Jika cache masih baru, kirim langsung
if (!$forceRefresh && file_exists($cacheFile) && (time() - filemtime($cacheFile) < $cacheDuration)) {
    $cached = file_get_contents($cacheFile);
    if (!empty($cached)) {
        echo $cached;
        exit;
    }
}

// ====================================================================
// DAFTAR KOTA UTAMA INDONESIA
// ====================================================================
$cities = [
    ['name' => 'Jakarta', 'province' => 'DKI Jakarta', 'lat' => -6.2088, 'lng' => 106.8456],
    ['name' => 'Tangerang Selatan', 'province' => 'Banten', 'lat' => -6.2889, 'lng' => 106.7179],
    ['name' => 'Tangerang', 'province' => 'Banten', 'lat' => -6.1783, 'lng' => 106.6319],
    ['name' => 'Bekasi', 'province' => 'Jawa Barat', 'lat' => -6.2383, 'lng' => 106.9756],
    ['name' => 'Depok', 'province' => 'Jawa Barat', 'lat' => -6.4025, 'lng' => 106.7942],
    ['name' => 'Bogor', 'province' => 'Jawa Barat', 'lat' => -6.5971, 'lng' => 106.8060],
    ['name' => 'Bandung', 'province' => 'Jawa Barat', 'lat' => -6.9175, 'lng' => 107.6191],
    ['name' => 'Semarang', 'province' => 'Jawa Tengah', 'lat' => -6.9667, 'lng' => 110.4167],
    ['name' => 'Surakarta (Solo)', 'province' => 'Jawa Tengah', 'lat' => -7.5755, 'lng' => 110.8243],
    ['name' => 'Yogyakarta', 'province' => 'DI Yogyakarta', 'lat' => -7.7956, 'lng' => 110.3695],
    ['name' => 'Surabaya', 'province' => 'Jawa Timur', 'lat' => -7.2575, 'lng' => 112.7521],
    ['name' => 'Malang', 'province' => 'Jawa Timur', 'lat' => -7.9666, 'lng' => 112.6326],
    ['name' => 'Denpasar', 'province' => 'Bali', 'lat' => -8.6705, 'lng' => 115.2126],
    ['name' => 'Mataram', 'province' => 'Nusa Tenggara Barat', 'lat' => -8.5833, 'lng' => 116.1167],
    ['name' => 'Kupang', 'province' => 'Nusa Tenggara Timur', 'lat' => -10.1772, 'lng' => 123.6070],
    ['name' => 'Lhokseumawe', 'province' => 'Aceh', 'lat' => 5.1801, 'lng' => 97.1507],
    ['name' => 'Banda Aceh', 'province' => 'Aceh', 'lat' => 5.5483, 'lng' => 95.3238],
    ['name' => 'Medan', 'province' => 'Sumatera Utara', 'lat' => 3.5952, 'lng' => 98.6722],
    ['name' => 'Padang', 'province' => 'Sumatera Barat', 'lat' => -0.9471, 'lng' => 100.4172],
    ['name' => 'Pekanbaru', 'province' => 'Riau', 'lat' => 0.5071, 'lng' => 101.4478],
    ['name' => 'Batam', 'province' => 'Kepulauan Riau', 'lat' => 1.1301, 'lng' => 104.0529],
    ['name' => 'Jambi', 'province' => 'Jambi', 'lat' => -1.6101, 'lng' => 103.6131],
    ['name' => 'Palembang', 'province' => 'Sumatera Selatan', 'lat' => -2.9761, 'lng' => 104.7754],
    ['name' => 'Bandar Lampung', 'province' => 'Lampung', 'lat' => -5.4500, 'lng' => 105.2667],
    ['name' => 'Pontianak', 'province' => 'Kalimantan Barat', 'lat' => -0.0263, 'lng' => 109.3425],
    ['name' => 'Banjarmasin', 'province' => 'Kalimantan Selatan', 'lat' => -3.3194, 'lng' => 114.5908],
    ['name' => 'Balikpapan', 'province' => 'Kalimantan Timur', 'lat' => -1.2379, 'lng' => 116.8529],
    ['name' => 'Samarinda', 'province' => 'Kalimantan Timur', 'lat' => -0.5022, 'lng' => 117.1536],
    ['name' => 'Makassar', 'province' => 'Sulawesi Selatan', 'lat' => -5.1477, 'lng' => 119.4327],
    ['name' => 'Manado', 'province' => 'Sulawesi Utara', 'lat' => 1.4748, 'lng' => 124.8421],
    ['name' => 'Palu', 'province' => 'Sulawesi Tengah', 'lat' => -0.9003, 'lng' => 119.8779],
    ['name' => 'Ambon', 'province' => 'Maluku', 'lat' => -3.6554, 'lng' => 128.1908],
    ['name' => 'Jayapura', 'province' => 'Papua', 'lat' => -2.5916, 'lng' => 140.6690]
];

function getCategoryInfo($aqi) {
    if ($aqi <= 50) {
        return [
            'level' => 'Baik',
            'color' => '#10b981',
            'badgeClass' => 'badge-good',
            'emoji' => '😊',
            'description' => 'Kualitas udara sangat baik dan tidak berisiko bagi kesehatan.',
            'recommendation' => 'Udara segar! Sangat ideal untuk beraktivitas di luar dan membuka ventilasi jendela.'
        ];
    } elseif ($aqi <= 100) {
        return [
            'level' => 'Sedang',
            'color' => '#f59e0b',
            'badgeClass' => 'badge-moderate',
            'emoji' => '😐',
            'description' => 'Kualitas udara dapat diterima untuk umum, namun kelompok sensitif perlu waspada.',
            'recommendation' => 'Kelompok sensitif (asma/alergi) disarankan mengurangi aktivitas berat di luar ruangan.'
        ];
    } elseif ($aqi <= 150) {
        return [
            'level' => 'Tidak Sehat bagi Sensitif',
            'color' => '#f97316',
            'badgeClass' => 'badge-sensitive',
            'emoji' => '😷',
            'description' => 'Anak-anak, lansia, dan penderita penyakit paru rentan mengalami gangguan pernapasan.',
            'recommendation' => 'Kenakan masker saat bepergian dan tutup jendela untuk menghindari polusi udara.'
        ];
    } elseif ($aqi <= 200) {
        return [
            'level' => 'Tidak Sehat',
            'color' => '#ef4444',
            'badgeClass' => 'badge-unhealthy',
            'emoji' => '🤢',
            'description' => 'Kualitas udara buruk. Setiap orang dapat mulai merasakan dampak kesehatan.',
            'recommendation' => 'Gunakan masker berstandar N95/KN95, nyalakan air purifier, dan hindari olahraga luar ruangan.'
        ];
    } elseif ($aqi <= 300) {
        return [
            'level' => 'Sangat Tidak Sehat',
            'color' => '#a855f7',
            'badgeClass' => 'badge-very-unhealthy',
            'emoji' => '🚨',
            'description' => 'Peringatan darurat kesehatan! Seluruh populasi kemungkinan besar terdampak serius.',
            'recommendation' => 'Tetap berada di dalam ruangan, tutup semua ventilasi luar, dan operasikan penyaring udara.'
        ];
    } else {
        return [
            'level' => 'Berbahaya',
            'color' => '#881337',
            'badgeClass' => 'badge-hazardous',
            'emoji' => '☠️',
            'description' => 'Kondisi berbahaya! Waspada risiko kesehatan tingkat kritis bagi seluruh masyarakat.',
            'recommendation' => 'Hindari seluruh aktivitas di luar ruangan. Gunakan respirator bila terpaksa bepergian.'
        ];
    }
}

// ====================================================================
// FETCH DARI OPEN-METEO ATMOSPHERIC AIR QUALITY FEED
// ====================================================================
$lats = implode(',', array_column($cities, 'lat'));
$lngs = implode(',', array_column($cities, 'lng'));
$url = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude={$lats}&longitude={$lngs}&current=us_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 8);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_USERAGENT, 'IQAir-Indonesia-Client/1.0');

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200 && !empty($response)) {
    $rawData = json_decode($response, true);
    $items = isset($rawData[0]) ? $rawData : [$rawData];

    $cityList = [];
    foreach ($items as $idx => $item) {
        $city = $cities[$idx] ?? ['name' => 'Kota', 'province' => 'Indonesia', 'lat' => 0, 'lng' => 0];
        $curr = $item['current'] ?? [];
        $aqi = isset($curr['us_aqi']) ? (int)round($curr['us_aqi']) : 50;
        $cat = getCategoryInfo($aqi);

        $cityList[] = [
            'id' => $idx + 1,
            'kota' => $city['name'],
            'provinsi' => $city['province'],
            'latitude' => $city['lat'],
            'longitude' => $city['lng'],
            'aqi' => $aqi,
            'kategori' => $cat['level'],
            'warna' => $cat['color'],
            'badgeClass' => $cat['badgeClass'],
            'emoji' => $cat['emoji'],
            'deskripsi' => $cat['description'],
            'rekomendasi' => $cat['recommendation'],
            'polutan' => [
                'pm25' => isset($curr['pm2_5']) ? round((float)$curr['pm2_5'], 1) : 0,
                'pm10' => isset($curr['pm10']) ? round((float)$curr['pm10'], 1) : 0,
                'co' => isset($curr['carbon_monoxide']) ? round((float)$curr['carbon_monoxide']) : 0,
                'no2' => isset($curr['nitrogen_dioxide']) ? round((float)$curr['nitrogen_dioxide'], 1) : 0,
                'so2' => isset($curr['sulphur_dioxide']) ? round((float)$curr['sulphur_dioxide'], 1) : 0,
                'o3' => isset($curr['ozone']) ? round((float)$curr['ozone']) : 0
            ],
            'waktuUpdate' => $curr['time'] ?? date('Y-m-d\TH:i')
        ];
    }

    $rankingTerpolusi = $cityList;
    usort($rankingTerpolusi, fn($a, $b) => $b['aqi'] <=> $a['aqi']);

    $rankingTerbersih = $cityList;
    usort($rankingTerbersih, fn($a, $b) => $a['aqi'] <=> $b['aqi']);

    $kotaSorotan = $cityList[0]; // Jakarta default

    $output = [
        'status' => 'success',
        'sumber' => 'IQAir / US EPA Air Quality Standard (Open-Meteo Atmospheric Feed)',
        'standar' => 'US AQI (Air Quality Index)',
        'terakhirSinkron' => date('d M Y, H:i:s') . ' WIB',
        'data' => [
            'kotaSorotan' => $kotaSorotan,
            'rankingTerpolusi' => $rankingTerpolusi,
            'rankingTerbersih' => $rankingTerbersih,
            'semuaKota' => $cityList,
            'ringkasan' => [
                'totalKotaDipantau' => count($cityList),
                'kotaTerpolusi' => $rankingTerpolusi[0] ?? null,
                'kotaTerbersih' => $rankingTerbersih[0] ?? null,
                'rataRataAqiNasional' => round(array_sum(array_column($cityList, 'aqi')) / count($cityList))
            ]
        ]
    ];

    $jsonStr = json_encode($output, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    @file_put_contents($cacheFile, $jsonStr);
    @file_put_contents($dataJsonFile, $jsonStr);
    @file_put_contents($dataJsFile, "window.DATA_IQAIR = " . $jsonStr . ";\n");

    echo $jsonStr;
    exit;
}

// Fallback jika fetch gagal: baca dari cache
if (file_exists($cacheFile)) {
    echo file_get_contents($cacheFile);
    exit;
}

http_response_code(500);
echo json_encode([
    'status' => 'error',
    'message' => 'Gagal mengambil data kualitas udara.'
]);
