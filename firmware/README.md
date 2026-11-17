# Firmware - Monitoramento da Qualidade do Ar com ESP32

Código C++ para ESP32 responsável pela leitura contínua dos sensores de qualidade do ar (Adafruit SGP30 e MQ135), indicação visual por LEDs e publicação periódica de telemetria no ThingSpeak via HTTPS.

---

## 🛠️ Hardware e Pinagem

### Componentes Utilizados
- **Microcontrolador:** ESP32 Dev Module (30 ou 38 pinos)
- **Sensor I2C:** Adafruit SGP30 (eCO2 e TVOC)
- **Sensor Analógico:** MQ-135 (com calibração de baseline e suavização exponencial)
- **Sinalização Visual:** 3 LEDs (Verde, Amarelo, Vermelho) com resistores (ex: 220Ω ou 330Ω)

### Mapeamento dos Pinos (GPIOs)

| Componente | Pino ESP32 | Função / Protocolo |
|------------|------------|-------------------|
| **MQ135**  | GPIO 34    | Entrada Analógica (ADC1_CH6, com atenuação 11dB) |
| **SGP30 SDA** | GPIO 21 | Linha de Dados I2C |
| **SGP30 SCL** | GPIO 22 | Linha de Clock I2C |
| **LED Verde** | GPIO 25 | Saída Digital (Nível 0: BOA) |
| **LED Amarelo** | GPIO 27 | Saída Digital (Nível 1: MODERADA) |
| **LED Vermelho** | GPIO 26 | Saída Digital (Nível 2: RUIM) |

---

## 📚 Bibliotecas Necessárias

No Arduino IDE, abra o **Gerenciador de Bibliotecas** (`Ctrl+Shift+I` ou `Sketch -> Incluir Biblioteca -> Gerenciar Bibliotecas...`) e instale:

1. **Adafruit SGP30 Sensor** (por Adafruit) — e suas dependências (`Adafruit BusIO`, `Adafruit Unified Sensor`).
2. Bibliotecas nativas do core ESP32 (já inclusas no pacote ESP32):
   - `WiFi.h`
   - `WiFiClientSecure.h`
   - `HTTPClient.h`
   - `Wire.h`

---

## 🔐 Configuração das Credenciais (`secrets.h`)

Por motivos de segurança, o arquivo com credenciais de rede e chave do ThingSpeak **não é versionado no Git** (protegido pelo `.gitignore`).

1. Copie o arquivo de exemplo `secrets.example.h` para criar `secrets.h` dentro de `/firmware/main/`:
   ```bash
   cp firmware/main/secrets.example.h firmware/main/secrets.h
   ```

2. Edite `firmware/main/secrets.h` e informe seus dados reais:
   ```cpp
   #ifndef SECRETS_H
   #define SECRETS_H

   #define WIFI_SSID "SEU_WIFI"
   #define WIFI_PASSWORD "SUA_SENHA_WIFI"
   #define THINGSPEAK_WRITE_KEY "SUA_WRITE_API_KEY"

   #endif
   ```

---

## 🚀 Como Carregar no ESP32 (Arduino IDE)

1. Instale o pacote de suporte às placas ESP32 no Arduino IDE:
   - Acesse **Arquivo > Preferências**.
   - Em *URLs do Gerenciador de Placas Adicionais*, adicione:  
     `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Vá em **Ferramentas > Placa > Gerenciador de Placas**, procure por `esp32` (por Espressif Systems) e clique em **Instalar**.

2. Abra o arquivo principal do firmware:
   - Abra `/firmware/main/main.ino` no Arduino IDE (a pasta deve se chamar `main` para respeitar o padrão da IDE).

3. Configure os parâmetros da placa no menu **Ferramentas**:
   - **Placa:** `ESP32 Dev Module`
   - **Upload Speed:** `921600` ou `115200`
   - **CPU Frequency:** `240MHz (WiFi/BT)`
   - **Flash Frequency:** `80MHz`
   - **Porta:** Selecione a porta serial correspondente (ex: `/dev/ttyUSB0` no Linux ou `COMx` no Windows).

4. Compile e faça o upload clicando no botão **Carregar** (`Ctrl+U`).

5. Abra o **Monitor Serial** (`Ctrl+Shift+M`) a **115200 baud** para acompanhar a inicialização, calibração inicial (30 segundos) e o envio dos dados.

---

## 📊 Níveis de Qualidade e Telemetria

O firmware opera com 3 níveis de classificação de ar, alinhados diretamente aos 3 LEDs físicos e ao contrato da API:

| Nível | Classificação | LED Ativo   | Alerta (field4) | Nível (field5) |
|:-----:|:-------------:|:-----------:|:---------------:|:--------------:|
|   0   | BOA           | Verde       | 0 (Normal)      | 0              |
|   1   | MODERADA      | Amarelo     | 1 (Alerta)      | 1              |
|   2   | RUIM          | Vermelho    | 1 (Alerta)      | 2              |

### Mapeamento dos Campos no ThingSpeak
- **field1:** eCO2 (SGP30) em ppm.
- **field2:** TVOC (SGP30) em ppb.
- **field3:** Variação de tensão do MQ135 (delta suavizado em relação ao baseline) em Volts.
- **field4:** Status de Alerta (`0` para normal, `1` para alerta se nível >= 1).
- **field5:** Nível simplificado de qualidade do ar (`0`, `1` ou `2`).
- **Intervalo de Envio:** A cada 20 segundos (`INTERVALO_ENVIO = 20000`).
