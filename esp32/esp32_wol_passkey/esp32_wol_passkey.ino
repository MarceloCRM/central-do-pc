/*
  Wake-on-LAN remoto com passkey — lado do ESP32

  O ESP32 consulta o Worker a cada POLL_MS. Quando você autoriza com digital/rosto
  no celular, o Worker responde "1" e o ESP32 envia o magic packet para o PC.

  Segurança do canal:
  - O DEVICE_SECRET nunca trafega: cada consulta leva um nonce aleatório e um HMAC-SHA256.
  - A resposta do Worker também vem com HMAC (sobre o mesmo nonce). Se o HMAC não bater,
    o ESP32 ignora a resposta. Por isso é seguro usar setInsecure() no TLS: ninguém
    consegue forjar um "ligar" sem conhecer o DEVICE_SECRET.

  Placa: ESP32 Dev Module (Arduino IDE / PlatformIO). Sem bibliotecas externas.
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WiFiUdp.h>
#include <esp_system.h>
#include "mbedtls/md.h"

// ===== CONFIGURE AQUI =====
// Wi-Fi, DEVICE_SECRET, endereço do Worker (WORKER_HOST) e MAC do PC (MAC_PC) ficam em
// secrets.h, fora do Git. Copie secrets.example.h para secrets.h, nesta mesma pasta, e preencha.
#include "secrets.h"

const uint32_t POLL_MS = 5000;        // intervalo entre consultas
const uint16_t MAX_FALHAS = 60;       // ~5 min sem sucesso -> reinicia o ESP32
// ==========================

WiFiUDP udp;
uint16_t falhas = 0;

String hmacHex(const String& msg) {
  uint8_t out[32];
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_hmac(info,
                  (const uint8_t*)DEVICE_SECRET, strlen(DEVICE_SECRET),
                  (const uint8_t*)msg.c_str(), msg.length(),
                  out);
  char hex[65];
  for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", out[i]);
  return String(hex);
}

String nonceAleatorio() {
  char buf[33];
  for (int i = 0; i < 4; i++) sprintf(buf + i * 8, "%08x", (unsigned int)esp_random());
  return String(buf);
}

// Comparação em tempo constante
bool iguais(const String& a, const String& b) {
  if (a.length() != b.length()) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < a.length(); i++) diff |= (uint8_t)(a[i] ^ b[i]);
  return diff == 0;
}

void enviarMagicPacket() {
  uint8_t pacote[102];
  for (int i = 0; i < 6; i++) pacote[i] = 0xFF;
  for (int i = 0; i < 16; i++) {
    for (int j = 0; j < 6; j++) pacote[6 + i * 6 + j] = MAC_PC[j];
  }

  // 3 envios por garantia (UDP não confirma entrega)
  for (int i = 0; i < 3; i++) {
    udp.beginPacket(WiFi.broadcastIP(), 9);
    udp.write(pacote, sizeof(pacote));
    udp.endPacket();
    delay(100);
  }
  Serial.println("Magic packet enviado");
}

// Retorna true se a consulta funcionou E a resposta foi autenticada.
// 'wake' recebe true quando o Worker mandou ligar o PC.
bool consultarWorker(bool& wake) {
  wake = false;

  String nonce = nonceAleatorio();
  String sig = hmacHex("poll|" + nonce);

  WiFiClientSecure client;
  client.setInsecure();  // integridade garantida pelo HMAC (veja o cabeçalho)

  HTTPClient http;
  http.setConnectTimeout(8000);
  http.setTimeout(8000);
  String url = String("https://") + WORKER_HOST + "/api/device/poll";
  if (!http.begin(client, url)) return false;
  http.addHeader("X-Nonce", nonce);
  http.addHeader("X-Sig", sig);

  int code = http.GET();
  if (code != 200) {
    Serial.printf("Consulta falhou (HTTP %d)\n", code);
    http.end();
    return false;
  }
  String body = http.getString();
  http.end();
  body.trim();

  // Formato esperado: "<0|1> <hmac-hex de 64 caracteres>"
  if (body.length() != 66 || body[1] != ' ') {
    Serial.println("Resposta em formato inesperado");
    return false;
  }
  char w = body[0];
  if (w != '0' && w != '1') return false;

  String recebido = body.substring(2);
  String esperado = hmacHex("resp|" + nonce + "|" + String(w));
  if (!iguais(recebido, esperado)) {
    Serial.println("HMAC da resposta NÃO confere — ignorando");
    return false;
  }

  wake = (w == '1');
  return true;
}

void conectarWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Conectando ao Wi-Fi");
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Conectado! IP: ");
    Serial.println(WiFi.localIP());
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  conectarWiFi();
}

void loop() {
  static uint32_t ultimaConsulta = 0;
  static bool primeira = true;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi fora do ar, tentando reconectar...");
    WiFi.reconnect();
    delay(3000);
    if (++falhas >= MAX_FALHAS) ESP.restart();
    return;
  }

  if (!primeira && millis() - ultimaConsulta < POLL_MS) {
    delay(50);
    return;
  }
  primeira = false;
  ultimaConsulta = millis();

  bool wake = false;
  if (consultarWorker(wake)) {
    falhas = 0;
    if (wake) {
      Serial.println("Pedido autorizado por passkey: ligando o PC");
      enviarMagicPacket();
    }
  } else if (++falhas >= MAX_FALHAS) {
    Serial.println("Falhas demais, reiniciando...");
    ESP.restart();
  }
}
