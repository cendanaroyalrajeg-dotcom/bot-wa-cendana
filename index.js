<?php
// Konfigurasi Database InfinityFree Royal Rajeg Cendana
$host     = "sql205.infinityfree.com";
$user     = "if0_41828680"; 
$pass     = "Q7BLxZKxAgslm"; 
$db_name  = "if0_41828680_royal_rajeg_cendana";

$koneksi = mysqli_connect($host, $user, $pass, $db_name);

if (!$koneksi) {
    echo json_encode(["status" => "error", "pesan" => "Gagal koneksi database"]);
    exit();
}

// Mendapatkan tahun dan bulan saat ini (Format: YYYY-MM, contoh: 2026-07)
$tahun_bulan_ini = date('Y-m'); 

// 1. Total Penerimaan Uang Masuk s/d saat ini (Table: cash_in)
$q_in_all = mysqli_query($koneksi, "SELECT SUM(AMOUNT) as total FROM cash_in");
$d_in_all = mysqli_fetch_assoc($q_in_all);
$total_masuk_sd = $d_in_all['total'] ?? 0;

// 2. Total Pengeluaran Uang Kas s/d saat ini (Table: cash_out)
$q_out_all = mysqli_query($koneksi, "SELECT SUM(AMOUNT) as total FROM cash_out");
$d_out_all = mysqli_fetch_assoc($q_out_all);
$total_keluar_sd = $d_out_all['total'] ?? 0;

// Total Sisa Uang Kas s/d saat ini
$sisa_kas_sd = $total_masuk_sd - $total_keluar_sd;

// 3. Jumlah Penerimaan Uang Masuk di bulan ini
$q_in_bulan = mysqli_query($koneksi, "SELECT SUM(AMOUNT) as total FROM cash_in WHERE DATE LIKE '$tahun_bulan_ini%'");
$d_in_bulan = mysqli_fetch_assoc($q_in_bulan);
$masuk_bulan_ini = $d_in_bulan['total'] ?? 0;

// 4. Jumlah Pengeluaran Uang Keluar di bulan ini (Table: cash_out)
$q_out_bulan = mysqli_query($koneksi, "SELECT SUM(AMOUNT) as total FROM cash_out WHERE DATE LIKE '$tahun_bulan_ini%'");
$d_out_bulan = mysqli_fetch_assoc($q_out_bulan);
$keluar_bulan_ini = $d_out_bulan['total'] ?? 0;

// 5. Mutasi saldo bulan ini (Kas Masuk Bulan Ini - Kas Keluar Bulan Ini)
$mutasi_bulan_ini = $masuk_bulan_ini - $keluar_bulan_ini;

// Susun hasil data dalam bentuk JSON
$respon = [
    "periode_bulan" => $tahun_bulan_ini,
    "kumulatif" => [
        "total_masuk_sd" => (int)$total_masuk_sd,
        "total_keluar_sd" => (int)$total_keluar_sd,
        "sisa_kas_sd" => (int)$sisa_kas_sd
    ],
    "bulan_ini" => [
        "masuk_bulan_ini" => (int)$masuk_bulan_ini,
        "keluar_bulan_ini" => (int)$keluar_bulan_ini,
        "mutasi_bulan_ini" => (int)$mutasi_bulan_ini
    ]
];

header('Content-Type: application/json; charset=utf-8');
echo json_encode($respon);
?>