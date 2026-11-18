// Copie para secrets.h (nesta pasta) e preencha. O secrets.h não vai para o Git.
#pragma once

const char* WIFI_SSID = "NOME DA REDE 2.4 GHz";
const char* WIFI_PASS = "SENHA DO WI-FI";

// Exatamente o mesmo valor de: npx wrangler secret put DEVICE_SECRET
const char* DEVICE_SECRET = "COLE AQUI";

// Endereço do Worker, sem "https://" e sem barra no final.
const char* WORKER_HOST = "wol-passkey.SEU-USUARIO.workers.dev";

// MAC da placa de rede do PC que o ESP32 liga (o agent\acordar-pela-rede.ps1 mostra).
// AA-BB-CC-DD-EE-FF -> {0xAA,0xBB,0xCC,0xDD,0xEE,0xFF}
const uint8_t MAC_PC[6] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF};
