import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Power, 
  Lightbulb, 
  Mic, 
  MicOff, 
  Wifi, 
  WifiOff, 
  Database, 
  Settings, 
  Terminal, 
  Trash2, 
  Layers, 
  HelpCircle, 
  CheckCircle, 
  AlertCircle, 
  Info,
  ChevronDown,
  Volume2,
  Thermometer,
  Droplet,
  Copy,
  Check
} from 'lucide-react';
import { LogEntry, MqttState } from './types';

export default function App() {
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

  // Application states
  const [state, setState] = useState<MqttState>({
    connected: false,
    selectedBroker: 'myqtthub',
    relays: [false, false, false, false],
    variations: [false, false],
    suhu: null,
    kelembaban: null,
    logs: [],
    relayTopics: [],
    variasiTopics: [],
    brokerConfig: {
      host: '',
      port: 0,
      clientId: '',
      username: '',
      password: ''
    }
  });

  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const startSpeechRecognitionRef = useRef<() => void>();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent capturing shortcut if user is typing in an input field
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!isListening && startSpeechRecognitionRef.current) {
          startSpeechRecognitionRef.current();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isListening]);

  const speakResponse = (text: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance(text);
      msg.lang = 'id-ID';
      msg.rate = 1.0;
      window.speechSynthesis.speak(msg);
    }
  };
  const [isConnecting, setIsConnecting] = useState(false);

  // States for customizable broker settings
  const [configHost, setConfigHost] = useState('node02.myqtthub.com');
  const [configPort, setConfigPort] = useState(1883);
  const [configClientId, setConfigClientId] = useState('web_client');
  const [configUsername, setConfigUsername] = useState('web');
  const [configPassword, setConfigPassword] = useState('123');
  
  // Local state for fast responsive 150ms visual pattern blinks
  const [visualRelays, setVisualRelays] = useState<boolean[]>([false, false, false, false]);

  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Sync visual indicators with normal relays when NO variation is active
  useEffect(() => {
    const isVar1Active = !!(state.variations && state.variations[0]);
    const isVar2Active = !!(state.variations && state.variations[1]);

    if (!isVar1Active && !isVar2Active) {
      setVisualRelays(state.relays);
    }
  }, [state.relays, state.variations]);

  // Handle high frequency (150ms) simulation sequence for variations
  useEffect(() => {
    const isVar1 = !!(state.variations && state.variations[0]);
    const isVar2 = !!(state.variations && state.variations[1]);

    if (!isVar1 && !isVar2) {
      return;
    }

    let step = 0;
    const interval = setInterval(() => {
      if (isVar1) {
        // variasi 1 : lampu 1 dan 4 hidup bersamaan lalu matikan bersamaan > lampu 2 dan 3 hidup bersamaan lalu matikan bersamaan (berulang dengan delay 150ms)
        const s = step % 4;
        if (s === 0) {
          setVisualRelays([true, false, false, true]);
        } else if (s === 1) {
          setVisualRelays([false, false, false, false]);
        } else if (s === 2) {
          setVisualRelays([false, true, true, false]);
        } else if (s === 3) {
          setVisualRelays([false, false, false, false]);
        }
      } else if (isVar2) {
        // variasi 2 : lampu 2 dan 3 hidup bersamaan dan matikan bersama, kemudian hidupkan 1 dan 4 bersamaan lalu matikan juga bersamaan (150ms delay)
        const s = step % 4;
        if (s === 0) {
          setVisualRelays([false, true, true, false]);
        } else if (s === 1) {
          setVisualRelays([false, false, false, false]);
        } else if (s === 2) {
          setVisualRelays([true, false, false, true]);
        } else if (s === 3) {
          setVisualRelays([false, false, false, false]);
        }
      }
      step++;
    }, 150);

    return () => clearInterval(interval);
  }, [state.variations]);

  // Poll state from server every 1000ms
  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/state`);
        if (res.ok) {
          const data = await res.json();
          setState(data);
        }
      } catch (err) {
        console.error('Failed to poll state from server', err);
      }
    };

    fetchState();
    const interval = setInterval(fetchState, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync inputs from server state when fetched
  useEffect(() => {
    if (state.brokerConfig.host) {
      let rawHost = state.brokerConfig.host;
      // strip protocols for the input fields
      if (rawHost.startsWith('mqtt://')) rawHost = rawHost.replace('mqtt://', '');
      if (rawHost.startsWith('mqtts://')) rawHost = rawHost.replace('mqtts://', '');
      if (rawHost.startsWith('ws://')) rawHost = rawHost.replace('ws://', '');
      if (rawHost.startsWith('wss://')) rawHost = rawHost.replace('wss://', '');
      
      setConfigHost(rawHost);
      setConfigPort(state.brokerConfig.port || 1883);
      setConfigClientId(state.brokerConfig.clientId !== undefined ? state.brokerConfig.clientId : 'web_client');
      setConfigUsername(state.brokerConfig.username !== undefined ? state.brokerConfig.username : 'web');
      setConfigPassword(state.brokerConfig.password !== undefined ? state.brokerConfig.password : '123');
    }
  }, [state.brokerConfig.host, state.brokerConfig.port, state.brokerConfig.clientId, state.brokerConfig.username, state.brokerConfig.password]);

  // Handle Relay Toggle
  const handleToggleRelay = async (relayIndex: number, status: boolean) => {
    // Optimistic Update
    setState((prev) => {
      const copy = [...prev.relays];
      copy[relayIndex] = status;
      return { ...prev, relays: copy };
    });

    try {
      const res = await fetch(`${BACKEND_URL}/api/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relayIndex, status })
      });
      if (res.ok) {
        const data = await res.json();
        setState((prev) => ({ ...prev, relays: data.relays }));
      } else {
        throw new Error('MQTT command failed');
      }
    } catch (err) {
      console.error(err);
      // Fetch fresh state to restore original
      const res = await fetch(`${BACKEND_URL}/api/state`);
      if (res.ok) {
        const data = await res.json();
        setState(data);
      }
    }
  };

  // Handle Variasi Toggle
  const handleToggleVariasi = async (varIndex: number, status: boolean) => {
    // Optimistic Update
    setState((prev) => {
      const copy = [...(prev.variations || [false, false])];
      copy[varIndex] = status;
      return { ...prev, variations: copy };
    });

    try {
      const res = await fetch(`${BACKEND_URL}/api/variasi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ varIndex, status })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.variations) {
          setState((prev) => ({ ...prev, variations: data.variations }));
        }
      } else {
        throw new Error('MQTT variasi failed');
      }
    } catch (err) {
      console.error(err);
      // Fetch fresh state to restore original
      const res = await fetch(`${BACKEND_URL}/api/state`);
      if (res.ok) {
        const data = await res.json();
        setState(data);
      }
    }
  };


  // Turn all relays ON or OFF
  const handleToggleAll = async (status: boolean) => {
    addVoiceLog(`Memproses perintah: ${status ? 'Menyalakan Semua Lampu' : 'Mematikan Semua Lampu'}`);
    for (let i = 0; i < 4; i++) {
      await handleToggleRelay(i, status);
    }
    if (!status) {
      await handleToggleVariasi(0, false);
      await handleToggleVariasi(1, false);
    }
  };

  // Connect manually with custom configuration payload
  const handleConnect = async (broker: string, customConfig?: { host?: string, port?: number, clientId?: string, username?: string, password?: string }) => {
    setIsConnecting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker,
          ...customConfig
        })
      });
      if (res.ok) {
        // Log will be returned in state polling
        setTimeout(() => setIsConnecting(false), 800);
      }
    } catch (err) {
      console.error(err);
      setIsConnecting(false);
    }
  };

  // Disconnect manually
  const handleDisconnect = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/disconnect`, { method: 'POST' });
      if (res.ok) {
        // Connection status updated
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Clear Logs
  const handleClearLogs = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/logs/clear`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  // Voice Command processing engine (shared by simulator and real speech)
  const processVoiceCommand = (rawText: string) => {
    const text = rawText.toLowerCase().trim();
    let index = -1;
    let action: 'ON' | 'OFF' | null = null;
    let answered = false;

    // Detect general action
    if (
      text.includes('nyalakan') || 
      text.includes('hidupkan') || 
      text.includes('aktifkan') || 
      text.includes('nyala') || 
      text.includes('on') || 
      text.includes('hidup')
    ) {
      action = 'ON';
    } else if (
      text.includes('matikan') || 
      text.includes('padamkan') || 
      text.includes('mati') || 
      text.includes('off') || 
      text.includes('nonaktifkan') || 
      text.includes('tutup')
    ) {
      action = 'OFF';
    }

    // Detect target indexes (1 to 4)
    if (text.includes('lampu 1') || text.includes('lampu satu') || text.includes('relay 1') || text.includes('relay satu') || text.includes('nomor 1') || text.includes('nomor satu')) {
      index = 0;
    } else if (text.includes('lampu 2') || text.includes('lampu dua') || text.includes('relay 2') || text.includes('relay dua') || text.includes('nomor 2') || text.includes('nomor dua')) {
      index = 1;
    } else if (text.includes('lampu 3') || text.includes('lampu tiga') || text.includes('relay 3') || text.includes('relay tiga') || text.includes('nomor 3') || text.includes('nomor tiga')) {
      index = 2;
    } else if (text.includes('lampu 4') || text.includes('lampu empat') || text.includes('relay 4') || text.includes('relay empat') || text.includes('nomor 4') || text.includes('nomor empat')) {
      index = 3;
    }

    const isVariasi1 = text.includes('variasi 1') || text.includes('variasi satu');
    const isVariasi2 = text.includes('variasi 2') || text.includes('variasi dua');
    const isAll = text.includes('semua') || text.includes('seluruh');

    // Tanya suhu
    if (text.includes('suhu') || text.includes('temperatur') || text.includes('kelembaban')) {
      const tempText = state.temperature !== null ? `${state.temperature} derajat celcius` : "belum tersedia";
      const humText = state.humidity !== null ? `${state.humidity} persen` : "belum tersedia";
      const msgText = `Suhu saat ini adalah ${tempText}, dan kelembaban ${humText}.`;
      addVoiceLog(`Cek Sensor Suhu: ${state.temperature}°C, Kelembaban: ${state.humidity}%`, 'info');
      speakResponse(msgText);
      return;
    }

    if (action !== null) {
      if (isAll) {
        handleToggleAll(action === 'ON');
        const msg = `Semua lampu dan variasi berhasil ${action === 'ON' ? 'dinyalakan' : 'dimatikan'}.`;
        speakResponse(msg);
        answered = true;
      } else if (isVariasi1) {
        handleToggleVariasi(0, action === 'ON');
        addVoiceLog(`Perintah Suara Sukses: ${action === 'ON' ? 'Menyalakan' : 'Mematikan'} Variasi 1`);
        speakResponse(`Variasi satu berhasil ${action === 'ON' ? 'dinyalakan' : 'dimatikan'}.`);
        answered = true;
      } else if (isVariasi2) {
        handleToggleVariasi(1, action === 'ON');
        addVoiceLog(`Perintah Suara Sukses: ${action === 'ON' ? 'Menyalakan' : 'Mematikan'} Variasi 2`);
        speakResponse(`Variasi dua berhasil ${action === 'ON' ? 'dinyalakan' : 'dimatikan'}.`);
        answered = true;
      } else if (index !== -1) {
        handleToggleRelay(index, action === 'ON');
        addVoiceLog(`Perintah Suara Sukses: ${action === 'ON' ? 'Menyalakan' : 'Mematikan'} Lampu ${index + 1}`);
        speakResponse(`Lampu ${index + 1} berhasil ${action === 'ON' ? 'dinyalakan' : 'dimatikan'}.`);
        answered = true;
      }
    }

    if (!answered) {
      const errMsg = `Perintah tidak dimengerti.`;
      addVoiceLog(`Perintah tidak dimengerti: "${rawText}". Coba katakan "Nyalakan Lampu 1", "Tanya suhu", atau "Matikan Semua".`);
      speakResponse(errMsg);
    }
  };

  // Send a custom speech log directly to server for synchronization
  const addVoiceLog = async (message: string, type: 'voice' | 'info' | 'error' = 'voice') => {
    try {
      await fetch(`${BACKEND_URL}/api/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Real browser speech recognition
  const startSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setSpeechError('Browser ini tidak mendukung Web Speech API. Silakan gunakan simulator perintah di bawah ini.');
      addVoiceLog('Browser tidak mendukung Web Speech API. Listening diganti ke mode simulasi saja.', 'error');
      return;
    }

    try {
      setSpeechError(null);
      
      // Add feedback sound when starting
      const startAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      startAudio.play().catch(e => console.log('Audio playback prevented'));

      const recognition = new SpeechRecognition();
      recognition.lang = 'id-ID';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        addVoiceLog('Mendengar suara... silakan ucapkan perintah Anda (bahasa Indonesia)');
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        console.error('Speech recognition error', event);
        if (event.error === 'not-allowed') {
          setSpeechError('Izin mikrofon ditolak oleh browser.');
          addVoiceLog('Gagal mendengar: Izin mikrofon ditolak browser.', 'error');
        } else {
          setSpeechError(`Error deteksi suara: ${event.error}`);
          addVoiceLog(`Mendengar suara: Berhenti atau tidak ada suara terdeteksi (${event.error})`, 'info');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        addVoiceLog(`Mendengar suara (Diterjemahkan): "${transcript}"`);
        processVoiceCommand(transcript);
      };

      recognition.start();
    } catch (err: any) {
      setIsListening(false);
      setSpeechError(err.message || 'Gagal memulai mikrofon.');
    }
  };

  startSpeechRecognitionRef.current = startSpeechRecognition;

  // Autoscroll logs panel disabled on new updates, user stays fully static
  const prevLogsLength = useRef(state.logs.length);
  useEffect(() => {
    // Keep reference length updated without making any scroll triggers
    prevLogsLength.current = state.logs.length;
  }, [state.logs.length]);

  const getArduinoCode = () => {
    return `// Pastikan Anda sudah menginstal library berikut melalui Library Manager di Arduino IDE:
// PubSubClient oleh Nick O'Leary
// DHT sensor library oleh Adafruit
// Adafruit Unified Sensor oleh Adafruit

#if defined(ESP8266)
#include <ESP8266WiFi.h>
#elif defined(ESP32)
#include <WiFi.h>
#endif

#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "DHT.h"

// ================= PENGATURAN WIFI =================
const char* ssid = "${wifiSsid}";
const char* password = "${wifiPass}";

// ================ BROKER MULTI-PROFILE ============
// 1 = MyQTTHub, 2 = Ably Realtime, 3 = Flespi IO
int active_broker = ${state.selectedBroker === 'ably' ? 2 : state.selectedBroker === 'flespi' ? 3 : 1};

// Profile 1: MyQTTHub Config (Bisa Diubah via Web Setup)
const char* config_myqtthub_server = "${configHost || 'node02.myqtthub.com'}";
const int config_myqtthub_port = ${configPort || 1883};
const char* config_myqtthub_client_id = "${configClientId || 'esp32_client'}";
const char* config_myqtthub_user = "${configUsername || 'esp'}";
const char* config_myqtthub_pass = "${configPassword || '123'}";

// Profile 2: Ably Realtime Config (Default Kredensial)
const char* config_ably_server = "mqtt.ably.io";
const int config_ably_port = 8883;
const char* config_ably_client_id = "esp32_client";
const char* config_ably_user = "0mN64g.3lKvvg";
const char* config_ably_pass = "nlmpvU40Q-P5nF9zLVqd4l3VxhmSm-xYzWyUsAE-ra4";

// Profile 3: Flespi IO Config (Default Kredensial)
const char* config_flespi_server = "mqtt.flespi.io";
const int config_flespi_port = 8883;
const char* config_flespi_client_id = "esp32_flespi";
const char* config_flespi_user = "XjHa98a23zNKRMgNj61l9nrz3xSLG0vWz9R8fkdLJNJEHI4X5zzmIkPfeaq4BXaP";
const char* config_flespi_pass = "";

// Dynamic buffers used by PubSubClient
char mqtt_server[64];
int mqtt_port;
char mqtt_client_id[64];
char mqtt_user[128];
char mqtt_pass[128];

// ================= PENGATURAN PIN ==================
#define RELAY1_PIN 25
#define RELAY2_PIN 26
#define RELAY3_PIN 27
#define RELAY4_PIN 14

// Pin Tambahan untuk Variasi Mode (Trigger HIGH/LOW)
#define VARIASI1_PIN 21
#define VARIASI2_PIN 22

#define DHTPIN 4
#define DHTTYPE DHT11

// ================= INISIALISASI ====================
WiFiClientSecure espClient;
PubSubClient client(espClient);
DHT dht(DHTPIN, DHTTYPE);

unsigned long lastMsg = 0;

// Penanda Mode Variasi Aktif
bool variasi1_active = false;
bool variasi2_active = false;
unsigned long lastVariasiTime = 0;
int variasiStep = 0;

void select_broker_profile() {
  if (active_broker == 1) {
    strcpy(mqtt_server, config_myqtthub_server);
    mqtt_port = config_myqtthub_port;
    strcpy(mqtt_client_id, config_myqtthub_client_id);
    strcpy(mqtt_user, config_myqtthub_user);
    strcpy(mqtt_pass, config_myqtthub_pass);
  } else if (active_broker == 2) {
    strcpy(mqtt_server, config_ably_server);
    mqtt_port = config_ably_port;
    strcpy(mqtt_client_id, config_ably_client_id);
    strcpy(mqtt_user, config_ably_user);
    strcpy(mqtt_pass, config_ably_pass);
  } else if (active_broker == 3) {
    strcpy(mqtt_server, config_flespi_server);
    mqtt_port = config_flespi_port;
    strcpy(mqtt_client_id, config_flespi_client_id);
    strcpy(mqtt_user, config_flespi_user);
    strcpy(mqtt_pass, config_flespi_pass);
  }
}

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());

  // Mengabaikan verifikasi sertifikat SSL agar koneksi lancar
  espClient.setInsecure();
}

void callback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.print("Pesan diterima di topik [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(message);

  // Jika menerima instruksi beralih broker
  if (String(topic) == "kontrol/server") {
    int target_broker = message.toInt();
    if (target_broker >= 1 && target_broker <= 3) {
      if (target_broker == active_broker) {
        return; // Abaikan jika broker yang dituju sudah merupakan broker yang aktif
      }
      
      Serial.println();
      Serial.println("----------------------------------------------");
      Serial.print("Menerima instruksi Web (Payload ");
      Serial.print(target_broker);
      Serial.print(") - Beralih ke Broker: ");
      if (target_broker == 1) Serial.println("MyQTTHub");
      else if (target_broker == 2) Serial.println("Ably Realtime");
      else if (target_broker == 3) Serial.println("Flespi IO");
      Serial.println("----------------------------------------------");
      
      active_broker = target_broker;
      
      // Update parameter koneksi
      select_broker_profile();
      
      // Atur ulang server & port di PubSubClient
      client.setServer(mqtt_server, mqtt_port);
      
      // Putuskan koneksi saat ini untuk memicu reconnect ke broker baru pada loop berikutnya
      client.disconnect();
      return;
    }
  }

  // Jika menerima perintah manual pada relay, otomatis nonaktifkan mode variasi 
  // agar kondisi relay manual tidak bentrok dengan loop variasi yang sedang jalan
  if (String(topic).startsWith("kontrol/relay")) {
    variasi1_active = false;
    variasi2_active = false;
    digitalWrite(VARIASI1_PIN, HIGH);
    digitalWrite(VARIASI2_PIN, HIGH);
  }

  // Kendali Relay & Variasi (Active LOW: LOW = ON, HIGH = OFF)
  if (String(topic) == "kontrol/relay1") {
    if (message == "ON") digitalWrite(RELAY1_PIN, LOW);
    else if (message == "OFF") digitalWrite(RELAY1_PIN, HIGH);
  } else if (String(topic) == "kontrol/relay2") {
    if (message == "ON") digitalWrite(RELAY2_PIN, LOW);
    else if (message == "OFF") digitalWrite(RELAY2_PIN, HIGH);
  } else if (String(topic) == "kontrol/relay3") {
    if (message == "ON") digitalWrite(RELAY3_PIN, LOW);
    else if (message == "OFF") digitalWrite(RELAY3_PIN, HIGH);
  } else if (String(topic) == "kontrol/relay4") {
    if (message == "ON") digitalWrite(RELAY4_PIN, LOW);
    else if (message == "OFF") digitalWrite(RELAY4_PIN, HIGH);
  } else if (String(topic) == "kontrol/variasi1") {
    if (message == "ON") {
      variasi1_active = true;
      variasi2_active = false;
      variasiStep = 0;
      lastVariasiTime = millis();
      digitalWrite(VARIASI1_PIN, LOW);  // Aktifkan Pin Variasi 1 (Active-Low)
      digitalWrite(VARIASI2_PIN, HIGH); // Nonaktifkan Pin Variasi 2
    } else if (message == "OFF") {
      variasi1_active = false;
      digitalWrite(VARIASI1_PIN, HIGH);
      // Matikan seluruh relay utama saat variasi dinonaktifkan
      digitalWrite(RELAY1_PIN, HIGH);
      digitalWrite(RELAY2_PIN, HIGH);
      digitalWrite(RELAY3_PIN, HIGH);
      digitalWrite(RELAY4_PIN, HIGH);
    }
  } else if (String(topic) == "kontrol/variasi2") {
    if (message == "ON") {
      variasi2_active = true;
      variasi1_active = false;
      variasiStep = 0;
      lastVariasiTime = millis();
      digitalWrite(VARIASI2_PIN, LOW);  // Aktifkan Pin Variasi 2 (Active-Low)
      digitalWrite(VARIASI1_PIN, HIGH); // Nonaktifkan Pin Variasi 1
    } else if (message == "OFF") {
      variasi2_active = false;
      digitalWrite(VARIASI2_PIN, HIGH);
      // Matikan seluruh relay utama saat variasi dinonaktifkan
      digitalWrite(RELAY1_PIN, HIGH);
      digitalWrite(RELAY2_PIN, HIGH);
      digitalWrite(RELAY3_PIN, HIGH);
      digitalWrite(RELAY4_PIN, HIGH);
    }
  }
}

void reconnect() {
  while (!client.connected()) {
    // Muat profile parameter broker yang aktif
    select_broker_profile();
    
    Serial.println();
    Serial.println("====================================================");
    Serial.print("Mencoba menghubungkan ke broker: ");
    if (active_broker == 1)      Serial.print("MyQTTHub (");
    else if (active_broker == 2) Serial.print("Ably Realtime (");
    else if (active_broker == 3) Serial.print("Flespi IO (");
    Serial.print(mqtt_server);
    Serial.print(":");
    Serial.print(mqtt_port);
    Serial.println(")...");

    if (client.connect(mqtt_client_id, mqtt_user, mqtt_pass)) {
      Serial.print("Status: BERHASIL TERHUBUNG ke Broker ");
      if (active_broker == 1)      Serial.println("MyQTTHub!");
      else if (active_broker == 2) Serial.println("Ably Realtime!");
      else if (active_broker == 3) Serial.println("Flespi IO!");
      Serial.println("====================================================");

      // Subscribe ke topik-topik kendali, sensor, dan singkronisasi beralih broker
      client.subscribe("kontrol/relay1");
      client.subscribe("kontrol/relay2");
      client.subscribe("kontrol/relay3");
      client.subscribe("kontrol/relay4");
      client.subscribe("kontrol/variasi1");
      client.subscribe("kontrol/variasi2");
      client.subscribe("kontrol/server");
    } else {
      Serial.print("Gagal hubung, status rc=");
      Serial.print(client.state());
      Serial.println(". Mengulangi dalam 5 detik...");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(RELAY1_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);
  pinMode(RELAY3_PIN, OUTPUT);
  pinMode(RELAY4_PIN, OUTPUT);
  pinMode(VARIASI1_PIN, OUTPUT);
  pinMode(VARIASI2_PIN, OUTPUT);

  // Matikan semua relay dan variasi saat startup (Kondisi HIGH karena Active Low)
  digitalWrite(RELAY1_PIN, HIGH);
  digitalWrite(RELAY2_PIN, HIGH);
  digitalWrite(RELAY3_PIN, HIGH);
  digitalWrite(RELAY4_PIN, HIGH);
  digitalWrite(VARIASI1_PIN, HIGH);
  digitalWrite(VARIASI2_PIN, HIGH);

  dht.begin();
  setup_wifi();

  select_broker_profile();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();

  // ================= KONTROL VARIASI NON-BLOCKING (150ms delay) =================
  if (variasi1_active) {
    if (now - lastVariasiTime >= 150) {
      lastVariasiTime = now;
      int s = variasiStep % 4;
      if (s == 0) {
        // Lampu 1 & 4 ON bersamaan (LOW = Active Low), Lampu 2 & 3 OFF (HIGH)
        digitalWrite(RELAY1_PIN, LOW);
        digitalWrite(RELAY2_PIN, HIGH);
        digitalWrite(RELAY3_PIN, HIGH);
        digitalWrite(RELAY4_PIN, LOW);
      } else if (s == 1) {
        // Matikan bersamaan
        digitalWrite(RELAY1_PIN, HIGH);
        digitalWrite(RELAY2_PIN, HIGH);
        digitalWrite(RELAY3_PIN, HIGH);
        digitalWrite(RELAY4_PIN, HIGH);
      } else if (s == 2) {
        // Lampu 2 & 3 ON bersamaan, Lampu 1 & 4 OFF
        digitalWrite(RELAY1_PIN, HIGH);
        digitalWrite(RELAY2_PIN, LOW);
        digitalWrite(RELAY3_PIN, LOW);
        digitalWrite(RELAY4_PIN, HIGH);
      } else if (s == 3) {
        // Matikan bersamaan
        digitalWrite(RELAY1_PIN, HIGH);
        digitalWrite(RELAY2_PIN, HIGH);
        digitalWrite(RELAY3_PIN, HIGH);
        digitalWrite(RELAY4_PIN, HIGH);
      }
      variasiStep++;
    }
  } else if (variasi2_active) {
    if (now - lastVariasiTime >= 150) {
      lastVariasiTime = now;
      int s = variasiStep % 4;
      if (s == 0) {
        // Lampu 2 & 3 ON bersamaan, Lampu 1 & 4 OFF
        digitalWrite(RELAY1_PIN, HIGH);
        digitalWrite(RELAY2_PIN, LOW);
        digitalWrite(RELAY3_PIN, LOW);
        digitalWrite(RELAY4_PIN, HIGH);
      } else if (s == 1) {
        // Matikan bersamaan
        digitalWrite(RELAY1_PIN, HIGH);
        digitalWrite(RELAY2_PIN, HIGH);
        digitalWrite(RELAY3_PIN, HIGH);
        digitalWrite(RELAY4_PIN, HIGH);
      } else if (s == 2) {
        // Lampu 1 & 4 ON bersamaan, Lampu 2 & 3 OFF
        digitalWrite(RELAY1_PIN, LOW);
        digitalWrite(RELAY2_PIN, HIGH);
        digitalWrite(RELAY3_PIN, HIGH);
        digitalWrite(RELAY4_PIN, LOW);
      } else if (s == 3) {
        // Matikan bersamaan
        digitalWrite(RELAY1_PIN, HIGH);
        digitalWrite(RELAY2_PIN, HIGH);
        digitalWrite(RELAY3_PIN, HIGH);
        digitalWrite(RELAY4_PIN, HIGH);
      }
      variasiStep++;
    }
  }

  // Membaca dan mengirim data DHT11 setiap 5 detik
  if (now - lastMsg >= 5000) {
    lastMsg = now;

    float h = dht.readHumidity();
    float t = dht.readTemperature();

    if (isnan(h) || isnan(t)) {
      Serial.println("Gagal membaca dari sensor DHT!");
    } else {
      String suhu = String(t);
      String kelembaban = String(h);

      // Publish data ke topik MQTT agar dibaca Web
      client.publish("sensor/suhu", suhu.c_str());
      client.publish("sensor/kelembaban", kelembaban.c_str());

      Serial.print("Suhu: ");
      Serial.print(suhu);
      Serial.print(" °C | Kelembaban: ");
      Serial.print(kelembaban);
      Serial.print(" % | Terhubung ke Broker: ");
      if (active_broker == 1) Serial.println("MyQTTHub");
      else if (active_broker == 2) Serial.println("Ably Realtime");
      else if (active_broker == 3) Serial.println("Flespi IO");
      else Serial.println("Unknown");
    }
  }
}`;
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(getArduinoCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0e0a] text-[#e2e8f0] transition-colors duration-200">
      
      {/* NAVBAR */}
      <header className="sticky top-0 z-40 bg-[#121711] border-b border-[#212a1f] shadow-sm backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          
          {/* Logo Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-white shadow-lg shadow-brand/20">
              <Power className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white leading-tight">MyQttHub Control</h1>
              <p className="text-xs text-[#7fa476] font-medium animate-pulse">Relay Interface Dashboard</p>
            </div>
          </div>

          {/* Connection status inside navbar */}
          <div className="flex items-center space-x-4">
            
            {/* Broker Status Indicators */}
            <div className="hidden sm:flex items-center space-x-2 bg-[#171d16] px-3 py-1.5 rounded-lg border border-[#212b1f]">
              <Database className="w-4 h-4 text-[#7fa476]/75" />
              <span className="text-xs font-medium text-slate-300 capitalize">{state.selectedBroker}</span>
            </div>

            {/* Connection Badge */}
            <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-xs ${
              state.connected 
                ? 'bg-[#0f2c16] text-[#a7f3d0] border-[#065f46]/60' 
                : isConnecting 
                  ? 'bg-[#2c1d0f] text-[#fde68a] border-[#78350f]/60'
                  : 'bg-[#2c0f13] text-[#fecdd3] border-[#9f1239]/60'
            }`}>
              {state.connected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping absolute" />
                  <span className="w-2 h-2 rounded-full bg-emerald-500 relative" />
                  <span>Terhubung ke Broker</span>
                </>
              ) : isConnecting ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping absolute" />
                  <span className="w-2 h-2 rounded-full bg-amber-500 relative animate-pulse" />
                  <span>Sedang Menghubungkan...</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-500 block" />
                  <span>Terputus dari Broker</span>
                </>
              )}
            </div>

            {/* Toggle Connection Button */}
            {state.connected ? (
              <button
                id="btn-disconnect"
                onClick={handleDisconnect}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-sm hover:shadow-md cursor-pointer flex items-center space-x-1"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span>Putuskan</span>
              </button>
            ) : (
              <button
                id="btn-connect"
                disabled={isConnecting}
                onClick={() => handleConnect(state.selectedBroker)}
                className={`text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-md flex items-center space-x-1 cursor-pointer ${
                  isConnecting ? 'bg-amber-600' : 'bg-brand hover:bg-brand-hover'
                }`}
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>{isConnecting ? 'Menghubungkan...' : 'Hubungkan'}</span>
              </button>
            )}

          </div>
        </div>
      </header>

      {/* DETAILED CONTENT SECTION */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Controls & Configurations (4 spans on lg) */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          
          {/* BROKER SETTINGS CARD */}
          <div className="bg-[#131912] rounded-2xl border border-[#232e21] shadow-lg p-5 flex flex-col space-y-4">
            
            <div className="flex items-center justify-between border-b border-[#232e21] pb-3">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-[#7fa476]" />
                <h2 className="font-bold text-slate-100 text-base">Broker Settings</h2>
              </div>
              <div className="bg-[#172216] text-[#7fa476] px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-[#2e3e2b]">
                Konfigurasi
              </div>
            </div>

            {/* Dropdown Broker Selection */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Pilih Broker MQTT</label>
              <div className="relative">
                <select
                  id="select-broker"
                  value={state.selectedBroker}
                  onChange={(e) => handleConnect(e.target.value)}
                  className="w-full bg-[#101410] border border-[#212b20] text-slate-150 rounded-xl px-3 py-2.5 text-sm font-medium appearance-none focus:outline-hidden focus:ring-2 focus:ring-brand/20 focus:border-brand cursor-pointer"
                >
                  <option value="myqtthub" className="bg-[#121611]">MyQTTHub (Active)</option>
                  <option value="ably" className="bg-[#121611]">Ably Realtime (Active)</option>
                  <option value="flespi" className="bg-[#121611]">Flespi IO (Active)</option>
                  <option value="hivemq" className="bg-[#121611]">HiveMQ Cloud (Simulasi)</option>
                  <option value="adafruit" className="bg-[#121611]">Adafruit IO (Simulasi)</option>
                </select>
                <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5 pointer-events-none" />
              </div>
            </div>

            {/* Dynamic Parameter Inputs */}
            <div className="flex flex-col space-y-2.5 mt-1">
              <span className="text-[10px] font-bold text-[#7fa476] uppercase tracking-wider">Sesuaikan Parameter</span>
              
              <div className="grid grid-cols-1 gap-2.5 bg-[#101410] p-3.5 rounded-xl border border-[#1e261e]">
                <div className="flex flex-col space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Host Server</span>
                  <input
                    type="text"
                    value={configHost}
                    onChange={(e) => setConfigHost(e.target.value)}
                    placeholder="node02.myqtthub.com"
                    className="w-full bg-[#0a0d0a] border border-[#293728] text-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-brand focus:border-brand"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Port</span>
                    <input
                      type="number"
                      value={configPort}
                      onChange={(e) => setConfigPort(Number(e.target.value))}
                      placeholder="1883"
                      className="w-full bg-[#0a0d0a] border border-[#293728] text-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-brand focus:border-brand"
                    />
                  </div>
                  <div className="flex flex-col space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Client ID</span>
                    <input
                      type="text"
                      value={configClientId}
                      onChange={(e) => setConfigClientId(e.target.value)}
                      placeholder="web_client"
                      className="w-full bg-[#0a0d0a] border border-[#293728] text-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-brand focus:border-brand"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">User</span>
                    <input
                      type="text"
                      value={configUsername}
                      onChange={(e) => setConfigUsername(e.target.value)}
                      placeholder="web"
                      className="w-full bg-[#0a0d0a] border border-[#293728] text-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-brand focus:border-brand"
                    />
                  </div>
                  <div className="flex flex-col space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Password</span>
                    <input
                      type="password"
                      value={configPassword}
                      onChange={(e) => setConfigPassword(e.target.value)}
                      placeholder="password"
                      className="w-full bg-[#0a0d0a] border border-[#293728] text-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-brand focus:border-brand"
                    />
                  </div>
                </div>

                {(state.selectedBroker === 'myqtthub' || state.selectedBroker === 'ably' || state.selectedBroker === 'flespi') && (
                  <button
                    id="btn-save-broker-params"
                    onClick={() => handleConnect(state.selectedBroker, {
                      host: configHost,
                      port: configPort,
                      clientId: configClientId,
                      username: configUsername,
                      password: configPassword
                    })}
                    disabled={isConnecting}
                    className="mt-1 bg-brand hover:bg-[#455a40] text-white text-xs font-bold py-2 rounded-lg transition shadow-sm hover:shadow-md cursor-pointer flex items-center justify-center space-x-1"
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    <span>{isConnecting ? 'Menghubungkan...' : 'Simpan & Hubungkan'}</span>
                  </button>
                )}
              </div>
            </div>

            <p className="text-[10px] text-slate-500 italic">
              * Anda dapat menyesuaikan semua setting di atas untuk diserahkan ke broker MQTT aktif.
            </p>

          </div>

          {/* VOICE COMMANDS CONTROLLER CARD */}
          <div className="bg-[#131912] rounded-2xl border border-[#232e21] shadow-lg p-5 flex flex-col space-y-4">
            
            <div className="flex items-center justify-between border-b border-[#232e21] pb-3">
              <div className="flex items-center space-x-2">
                <Mic className="w-5 h-5 text-[#7fa476]" />
                <h2 className="font-bold text-slate-100 text-base">Voice Command</h2>
              </div>
              <div className="bg-[#1c2419] text-[#a7f3d0] px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-[#065f46]">
                Smart Control
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Tekan tombol mikrofon dan ucapkan perintah suara dalam Bahasa Indonesia atau gunakan simulasi cepat di bawah ini.
            </p>

            {/* Voice Mic Pulse Trigger */}
            <div className="flex flex-col items-center justify-center py-4 bg-[#101410] rounded-xl relative overflow-hidden border border-[#212c20]">
              
              <AnimatePresence>
                {isListening && (
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: [1, 2, 1], opacity: [0.1, 0.4, 0.1] }}
                    exit={{ opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    className="absolute w-24 h-24 bg-brand rounded-full pointer-events-none"
                  />
                )}
              </AnimatePresence>

              <button
                id="btn-voice"
                onClick={startSpeechRecognition}
                disabled={isListening}
                className={`w-16 h-16 rounded-full flex items-center justify-center p-0 shadow-md transition-all z-10 hover:scale-105 active:scale-95 cursor-pointer relative ${
                  isListening 
                    ? 'bg-rose-600 text-white animate-pulse' 
                    : 'bg-brand text-white hover:bg-[#455a40]'
                }`}
              >
                {isListening ? (
                  <MicOff className="w-7 h-7" />
                ) : (
                  <Mic className="w-7 h-7" />
                )}
              </button>

              <span className="text-xs font-bold mt-3 text-slate-350">
                {isListening ? 'Mendengarkan... Bicara Sekarang' : 'Mulai Rekam Suara'}
              </span>

              {speechError && (
                <div className="mt-3 px-3 py-1 bg-[#3f0f15] text-[#fecdd3] text-[10px] rounded border border-[#881337] text-center mx-4">
                  {speechError}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: 4 Relay Cards & Logs (8 spans on lg) */}
        <div className="lg:col-span-8 flex flex-col space-y-6">

          {/* SENSOR DATA AREA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* TEMPERATURE CARD */}
            <div className="bg-[#131912] rounded-2xl border border-[#232e21] shadow-lg p-5 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-xl bg-[#2a1708] text-orange-400 flex items-center justify-center shadow-xs border border-[#4d280d]">
                  <Thermometer className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 block tracking-tight uppercase">Suhu Ruangan (DHT11)</span>
                  <span className="text-2xl font-black text-slate-100 font-mono tracking-tight select-none">
                    {state.suhu !== null ? `${state.suhu}` : '--'}
                    <span className="text-sm font-bold text-slate-400 ml-1">°C</span>
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#311b06] text-[#fbbf24] border border-[#78350f]/60 uppercase animate-pulse">
                  ESP32 Transmit
                </span>
                <span className="text-[10px] text-[#7fa476] block mt-1 font-mono">sensor/suhu</span>
              </div>
            </div>

            {/* HUMIDITY CARD */}
            <div className="bg-[#131912] rounded-2xl border border-[#232e21] shadow-lg p-5 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-xl bg-[#0e1d2e] text-blue-450 flex items-center justify-center shadow-xs border border-[#1e3c5a]">
                  <Droplet className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 block tracking-tight uppercase">Kelembaban Udara</span>
                  <span className="text-2xl font-black text-slate-100 font-mono tracking-tight select-none">
                    {state.kelembaban !== null ? `${state.kelembaban}` : '--'}
                    <span className="text-sm font-bold text-slate-400 ml-1">%</span>
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#0b1c31] text-[#60a5fa] border border-[#1e40af]/60 uppercase animate-pulse">
                  Active Real
                </span>
                <span className="text-[10px] text-[#7fa476] block mt-1 font-mono">sensor/kelembaban</span>
              </div>
            </div>

          </div>
          
          {/* MIDDLE ROW: RELAYS PANEL */}
          <div className="bg-[#131912] rounded-2xl border border-[#232e21] shadow-lg p-6 flex flex-col space-y-6">
            
            {/* Header relays */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#232e21] pb-4 gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-[#1a2318] flex items-center justify-center text-[#7fa476]">
                  <Layers className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h2 className="font-bold text-white text-lg">Kontrol Relay Lampu Utama</h2>
                </div>
              </div>
            </div>

            {/* Turn All Controls */}
            <div className="flex items-center gap-3 bg-[#182017] p-3 rounded-xl border border-[#232f22]">
              <span className="text-xs font-bold text-[#7fa476]">Kontrol Massal</span>
              <div className="ml-auto flex items-center space-x-2">
                <button
                  id="btn-all-on"
                  onClick={() => handleToggleAll(true)}
                  className="bg-brand text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-[#455a40] transition shadow-sm cursor-pointer"
                >
                  Nyalakan Semua
                </button>
                <button
                  id="btn-all-off"
                  onClick={() => handleToggleAll(false)}
                  className="bg-[#232e21] hover:bg-[#2d3b2a] text-slate-300 text-xs font-bold px-4 py-2 rounded-lg transition cursor-pointer border border-[#2f3d2c]"
                >
                  Matikan Semua
                </button>
              </div>
            </div>

            {/* Grid of the 4 relays */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visualRelays.map((isOn, index) => (
                <div
                  key={index}
                  className={`rounded-xl border p-5 flex flex-col justify-between transition-all duration-350 relative overflow-hidden h-44 ${
                    isOn 
                      ? 'border-[#7fa476]/40 bg-gradient-to-br from-[#1d271c] via-[#141c13] to-[#243521] shadow-lg shadow-[#5c8052]/10 ring-1 ring-[#5c8052]/20' 
                      : 'border-[#222d20] bg-[#141913] hover:border-[#384a34] shadow-xs'
                  }`}
                >
                  
                  {/* Decorative glowing background item */}
                  <AnimatePresence>
                    {isOn && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 0.12, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute -right-8 -bottom-8 w-28 h-28 bg-brand rounded-full pointer-events-none blur-xl"
                      />
                    )}
                  </AnimatePresence>

                  <div className="flex items-center justify-between z-10">
                    <div className="flex items-center space-x-3">
                      {/* Glow Bulb container */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                        isOn 
                          ? 'bg-brand text-white shadow-[#5c8052]/30 shadow-md' 
                          : 'bg-[#1b2319] text-[#7fa476]/50'
                      }`}>
                        <Lightbulb className={`w-5.5 h-5.5 ${isOn ? 'animate-pulse text-yellow-300' : ''}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-100 text-sm">Relay Lampu {index + 1}</h3>
                        <p className="text-[10px] text-[#7fa476] font-mono italic truncate max-w-[130px]">
                          {state.relayTopics && state.relayTopics[index] ? state.relayTopics[index] : `kontrol/relay${index + 1}`}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge indicator */}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      isOn 
                        ? 'bg-[#0e2714] text-[#a7f3d0] border border-[#065f46]' 
                        : 'bg-[#121612] text-slate-500 border border-[#222d20]'
                    }`}>
                      {isOn ? 'ON' : 'OFF'}
                    </span>
                  </div>

                  {/* Variation button area */}
                  <div className="mt-4 pt-4 border-t border-[#222d20] flex items-center justify-between z-10">
                    <span className="text-[11px] font-medium text-slate-400">Tindakan</span>
                    
                    {/* Variation B: Dual tactile button */}
                    <div className="flex items-center space-x-1.5">
                      <button
                        id={`btn-relay-on-${index + 1}`}
                        onClick={() => handleToggleRelay(index, true)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition duration-205 cursor-pointer ${
                          isOn 
                            ? 'bg-[#587352] hover:bg-[#455a40] text-white border-[#587352]' 
                            : 'bg-[#1a201a] hover:bg-[#232e22] text-slate-300 border-[#2d3a2b]'
                        }`}
                      >
                        ON
                      </button>
                      <button
                        id={`btn-relay-off-${index + 1}`}
                        onClick={() => handleToggleRelay(index, false)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition duration-205 cursor-pointer ${
                          !isOn 
                            ? 'bg-rose-950 text-rose-300 border-rose-900' 
                            : 'bg-[#1a201a] hover:bg-[#232e22] text-[#e0a6a6] border-[#2b1f20]'
                        }`}
                      >
                        OFF
                      </button>
                    </div>
                  </div>

                </div>
              ))}
            </div>

            {/* Dynamic Additional Variasi Block */}
            <div className="border-t border-[#232e21] mt-2 pt-5">
              <div className="flex items-center space-x-3.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#271d12] text-orange-400 flex items-center justify-center border border-[#4d3215]">
                  <Settings className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">Output Variasi Tambahan (ESP32 Pins 21 & 22)</h3>
                  <p className="text-xs text-slate-400">Kontrol tombol Variasi 1 & Variasi 2 untuk trigger GPIO pin ESP32</p>
                </div>
              </div>

              {/* Grid of 2 Variations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[0, 1].map((varIdx) => {
                  const isOn = (state.variations || [false, false])[varIdx];
                  const topic = (state.variasiTopics && state.variasiTopics[varIdx]) || `kontrol/variasi${varIdx + 1}`;
                  return (
                    <div
                      key={varIdx}
                      className={`rounded-xl border p-4.5 flex flex-col justify-between transition-all duration-300 relative overflow-hidden ${
                        isOn 
                          ? 'border-[#7fa476]/35 bg-gradient-to-br from-[#1c2419] to-[#253221] shadow-lg shadow-[#5c8052]/10 ring-1 ring-[#5c8052]/20' 
                          : 'border-[#222d20] bg-[#101410] hover:bg-[#151a14] shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between h-11">
                        <div className="flex items-center space-x-3">
                          <div className={`w-9.5 h-9.5 rounded-lg flex items-center justify-center transition-all ${
                            isOn 
                              ? 'bg-[#587352] text-white shadow-[#5c8052]/30 shadow-sm' 
                              : 'bg-[#1b2319] text-[#7fa476]/50'
                          }`}>
                            <Power className={`w-5 h-5 ${isOn ? 'animate-pulse text-yellow-300' : ''}`} />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-100 text-xs">Variasi {varIdx + 1}</h4>
                            <p className="text-[9px] text-[#7fa476] font-mono italic truncate max-w-[150px]">
                              {topic}
                            </p>
                          </div>
                        </div>

                        {/* Variation B: Dual tactile button */}
                        <div className="flex items-center space-x-1.5">
                          <button
                            id={`btn-variasi-on-${varIdx + 1}`}
                            onClick={() => handleToggleVariasi(varIdx, true)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition duration-205 cursor-pointer ${
                              isOn 
                                ? 'bg-[#587352] hover:bg-[#455a40] text-white border-[#587352]' 
                                : 'bg-[#1a201a] hover:bg-[#232e22] text-slate-300 border-[#2d3a2b]'
                            }`}
                          >
                            ON
                          </button>
                          <button
                            id={`btn-variasi-off-${varIdx + 1}`}
                            onClick={() => handleToggleVariasi(varIdx, false)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition duration-205 cursor-pointer ${
                              !isOn 
                                ? 'bg-rose-950 text-rose-300 border-rose-900' 
                                : 'bg-[#1a201a] hover:bg-[#232e22] text-[#e0a6a6] border-[#2b1f20]'
                            }`}
                          >
                            OFF
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* LOWER ROW: LOGS VIEW */}
          <div className="bg-[#131912] rounded-2xl border border-[#232e21] shadow-lg flex flex-col p-6 flex-1 min-h-[300px]">
            
            {/* Header logs */}
            <div className="flex items-center justify-between border-b border-[#232e21] pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-[#182017] flex items-center justify-center text-slate-400">
                  <Terminal className="w-4.5 h-4.5 font-bold" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-100 text-base">Log Aktivitas Kontroler</h2>
                  <p className="text-xs text-slate-400">Monitoring real-time transaksi & voice command</p>
                </div>
              </div>

              {/* Clear action */}
              <button
                id="btn-clear-logs"
                onClick={handleClearLogs}
                className="bg-[#1a1213] hover:bg-[#2e1518] text-slate-400 hover:text-rose-450 border border-[#2d2021] hover:border-rose-900/60 hover:border-rose-200 active:scale-95 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Bersihkan</span>
              </button>
            </div>

            {/* Logs Window */}
            <div 
              ref={logContainerRef} 
              className="flex-1 bg-slate-950 text-slate-350 rounded-xl p-4 font-mono text-xs overflow-y-auto mt-4 max-h-72 min-h-48 border border-[#232e21]"
            >
              
              <div className="space-y-2">
                {state.logs.length === 0 ? (
                  <div className="text-slate-500 italic py-6 text-center">
                    Belum ada log aktivitas yang tercatat. Gunakan kontrol di atas untuk memulai.
                  </div>
                ) : (
                  [...state.logs].reverse().map((log) => (
                    <div 
                      key={log.id} 
                      className="flex items-start space-x-2 py-1 border-b border-[#182316] last:border-0 hover:bg-slate-800/20 px-1 rounded transition duration-150"
                    >
                      {/* Colored log markers */}
                      <span className="text-slate-500 font-medium shrink-0 selection:bg-slate-700">[{log.timestamp}]</span>
                      
                      <div className="shrink-0 pt-0.5">
                        {log.type === 'success' && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                        {log.type === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                        {log.type === 'voice' && <Mic className="w-3.5 h-3.5 text-teal-400" />}
                        {log.type === 'info' && <Info className="w-3.5 h-3.5 text-sky-400" />}
                      </div>

                      <span className={`leading-relaxed break-all ${
                        log.type === 'success' 
                          ? 'text-emerald-300 font-medium' 
                          : log.type === 'error' 
                            ? 'text-rose-300 font-bold' 
                            : log.type === 'voice' 
                              ? 'text-teal-300 font-medium italic' 
                              : 'text-slate-300'
                      }`}>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
                
                <div ref={logEndRef} />
              </div>
            </div>

          </div>

        </div>

      </main>

      {/* FOOTER */}
      <footer className="bg-[#0c0f0c] border-t border-[#1d271b] py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs text-slate-550 font-medium">
            Sistem Monitoring Lampu Relay MQTT &bull; Berbasis Broker node02.myqtthub.com &bull; Designed in Eye-Safe Cozy Slate-Forest Accent
          </p>
        </div>
      </footer>

    </div>
  );
}
