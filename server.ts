import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import mqtt from 'mqtt';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Izinkan request dari berbagai sumber (Vercel)
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  app.use(express.json());

  // In-memory state for MQTT connection, relays, variations and sensors
  let mqttClient: any = null;
  let isConnected = false;
  let currentBroker = 'myqtthub'; // myqtthub, hivemq, adafruit
  let relayStates = [false, false, false, false];
  let variasiStates = [false, false];
  let suhu: string | null = null;
  let kelembaban: string | null = null;
  let logs: { id: string; timestamp: string; type: string; message: string }[] = [];

  // MQTT configuration details defaulting to node02.myqtthub.com, port 1883 as requested
  let mqttConfig = {
    host: 'node02.myqtthub.com',
    port: 1883,
    clientId: 'web_client',
    username: 'web',
    password: '123'
  };

  // MQTT Topics based on ESP32 integration
  const relayTopics = [
    'kontrol/relay1',
    'kontrol/relay2',
    'kontrol/relay3',
    'kontrol/relay4'
  ];

  const variasiTopics = [
    'kontrol/variasi1',
    'kontrol/variasi2'
  ];

  const sensorTopics = [
    'sensor/suhu',
    'sensor/kelembaban'
  ];

  function addLog(type: 'info' | 'success' | 'error' | 'voice', message: string) {
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const id = Math.random().toString(36).substring(2, 9);
    logs.unshift({ id, timestamp, type, message });
    // Keep logs at max 100 items
    if (logs.length > 100) {
      logs.pop();
    }
  }

  // Initial system message
  addLog('info', 'Aplikasi Web Kontrol Relay Lampu & Variasi siap dijalankan');

  // Function to connect to target MQTT Broker
  function connectToMqtt() {
    if (mqttClient) {
      try {
        mqttClient.end(true);
      } catch (e) {}
      mqttClient = null;
    }

    // Handle schema prefix
    let targetHost = mqttConfig.host;
    if (!targetHost.startsWith('mqtt://') && !targetHost.startsWith('mqtts://') && !targetHost.startsWith('ws://') && !targetHost.startsWith('wss://')) {
      if (mqttConfig.port === 8883) {
        targetHost = `mqtts://${targetHost}`;
      } else {
        targetHost = `mqtt://${targetHost}`;
      }
    }

    addLog('info', `Menghubungkan ke Broker di ${targetHost}:${mqttConfig.port} (Client ID: ${mqttConfig.clientId})...`);

    try {
      mqttClient = mqtt.connect(targetHost, {
        port: mqttConfig.port,
        clientId: mqttConfig.clientId,
        username: mqttConfig.username,
        password: mqttConfig.password,
        reconnectPeriod: 5000, // Reconnect every 5s
        connectTimeout: 10000,
        keepalive: 60
      });

      mqttClient.on('connect', () => {
        isConnected = true;
        addLog('success', `Web berhasil terhubung ke broker ${currentBroker.toUpperCase()} (${mqttConfig.host})`);
        
        const brokerCodes: { [key: string]: string } = {
          'myqtthub': '1',
          'ably': '2',
          'flespi': '3'
        };
        const currentPayload = brokerCodes[currentBroker];
        if (currentPayload) {
          mqttClient?.publish('kontrol/server', currentPayload, { qos: 1, retain: true });
        }
        
        // Subscribe to Relay Topics
        relayTopics.forEach((topic) => {
          mqttClient.subscribe(topic, (err: any) => {
            if (!err) {
              console.log(`Subscribed to relay topic: ${topic}`);
            }
          });
        });

        // Subscribe to Variasi Topics
        variasiTopics.forEach((topic) => {
          mqttClient.subscribe(topic, (err: any) => {
            if (!err) {
              console.log(`Subscribed to variasi topic: ${topic}`);
            }
          });
        });

        // Subscribe to Sensor Topics
        sensorTopics.forEach((topic) => {
          mqttClient.subscribe(topic, (err: any) => {
            if (!err) {
              console.log(`Subscribed to sensor topic: ${topic}`);
            }
          });
        });
      });

      mqttClient.on('message', (topic: string, message: Buffer) => {
        const msgStr = message.toString().trim();
        const upperMsg = msgStr.toUpperCase();

        // 1. Check if the topic matches one of the relays
        for (let i = 0; i < relayTopics.length; i++) {
          if (topic === relayTopics[i]) {
            const newState = upperMsg === 'ON' || msgStr === '1';
            if (relayStates[i] !== newState) {
              relayStates[i] = newState;
              addLog('info', `Status Relay ${i + 1} berubah menjadi: ${newState ? 'ON' : 'OFF'}`);
            }
            return;
          }
        }

        // 2. Check if the topic matches one of the variations
        for (let i = 0; i < variasiTopics.length; i++) {
          if (topic === variasiTopics[i]) {
            const newState = upperMsg === 'ON' || msgStr === '1';
            if (variasiStates[i] !== newState) {
              variasiStates[i] = newState;
              addLog('info', `Status Variasi ${i + 1} berubah menjadi: ${newState ? 'ON' : 'OFF'}`);
            }
            return;
          }
        }

        // 3. Check sensor readings
        if (topic === 'sensor/suhu') {
          suhu = msgStr;
          addLog('info', `Sensor Suhu diperbarui dari ESP32: ${msgStr} °C`);
        } else if (topic === 'sensor/kelembaban') {
          kelembaban = msgStr;
          addLog('info', `Sensor Kelembaban diperbarui dari ESP32: ${msgStr} %`);
        }
      });

      mqttClient.on('error', (err: any) => {
        console.error('MQTT Connection Error:', err);
        isConnected = false;
        addLog('error', `Koneksi gagal atau terjadi error: ${err.message || 'Koneksi ditolak'}`);
      });

      mqttClient.on('offline', () => {
        if (isConnected) {
          isConnected = false;
          addLog('error', `Bekerja secara offline (Broker terputus atau offline)`);
        }
      });

      mqttClient.on('close', () => {
        if (isConnected) {
          isConnected = false;
          addLog('info', `Koneksi ke broker terputus`);
        }
      });

    } catch (err: any) {
      isConnected = false;
      addLog('error', `Gagal menginisialisasi MQTT: ${err.message || err}`);
    }
  }

  // Attempt auto-connect on startup
  connectToMqtt();

  // API Routes
  app.get('/api/state', (req, res) => {
    res.json({
      connected: isConnected,
      selectedBroker: currentBroker,
      relays: relayStates,
      variations: variasiStates,
      suhu: suhu,
      kelembaban: kelembaban,
      logs: logs,
      relayTopics: relayTopics,
      variasiTopics: variasiTopics,
      brokerConfig: {
        host: mqttConfig.host,
        port: mqttConfig.port,
        clientId: mqttConfig.clientId,
        username: mqttConfig.username,
        password: mqttConfig.password
      }
    });
  });

  app.post('/api/connect', (req, res) => {
    const { broker, host, port, clientId, username, password } = req.body;
    
    // Dynamic broker switching code payload
    const brokerCodes: { [key: string]: string } = {
      'myqtthub': '1',
      'ably': '2',
      'flespi': '3'
    };
    
    const targetPayload = brokerCodes[broker];
    if (targetPayload && mqttClient && isConnected) {
      addLog('info', `Mengirim sinyal pengalihan broker ke ESP32 di topik [kontrol/server]: ${targetPayload}`);
      // Clear the retained message on the old broker, then send the un-retained signal to switch
      mqttClient.publish('kontrol/server', '', { qos: 1, retain: true });
      mqttClient.publish('kontrol/server', targetPayload, { qos: 1, retain: false });
    }
    
    // Delay switching on server side to let the packet deliver properly
    setTimeout(() => {
      currentBroker = broker;
      
      if (broker === 'myqtthub') {
        mqttConfig.host = host !== undefined ? host : 'node02.myqtthub.com';
        mqttConfig.port = port !== undefined ? Number(port) : 1883;
        mqttConfig.clientId = clientId !== undefined ? clientId : 'web_client';
        mqttConfig.username = username !== undefined ? username : 'web';
        mqttConfig.password = password !== undefined ? password : '123';

        connectToMqtt();
        res.json({ success: true, message: 'Menghubungkan ke MyQTTHub...' });
      } else if (broker === 'ably') {
        // Use user's Ably credentials as defaults if not explicitly changed
        mqttConfig.host = host !== undefined ? host : 'mqtt.ably.io';
        mqttConfig.port = port !== undefined ? Number(port) : 8883;
        mqttConfig.clientId = clientId !== undefined ? clientId : 'web_client';
        mqttConfig.username = username !== undefined ? username : '0mN64g.3lKvvg';
        mqttConfig.password = password !== undefined ? password : 'nlmpvU40Q-P5nF9zLVqd4l3VxhmSm-xYzWyUsAE-ra4';

        connectToMqtt();
        res.json({ success: true, message: 'Menghubungkan ke Ably Realtime...' });
      } else if (broker === 'flespi') {
        mqttConfig.host = host !== undefined ? host : 'mqtt.flespi.io';
        mqttConfig.port = port !== undefined ? Number(port) : 8883;
        mqttConfig.clientId = clientId !== undefined ? clientId : '';
        mqttConfig.username = username !== undefined ? username : 'XjHa98a23zNKRMgNj61l9nrz3xSLG0vWz9R8fkdLJNJEHI4X5zzmIkPfeaq4BXaP';
        mqttConfig.password = password !== undefined ? password : '';

        connectToMqtt();
        res.json({ success: true, message: 'Menghubungkan ke Flespi IO...' });
      } else {
        // Placeholder connection block for testing/alternate selection
        if (mqttClient) {
          mqttClient.end(true);
          mqttClient = null;
        }
        isConnected = false;
        addLog('info', `Mengganti broker ke ${broker.toUpperCase()}. Broker ini opsional / simulasi.`);
        res.json({ success: true, message: `Mengganti broker ke ${broker}` });
      }
    }, (mqttClient && isConnected) ? 300 : 0);
  });

  app.post('/api/disconnect', (req, res) => {
    if (mqttClient) {
      mqttClient.end(true);
      mqttClient = null;
    }
    isConnected = false;
    addLog('info', `Koneksi ke broker diputuskan secara manual`);
    res.json({ success: true, message: 'Koneksi berhasil diputuskan' });
  });

  app.post('/api/relay', (req, res) => {
    const { relayIndex, status } = req.body;

    if (relayIndex < 0 || relayIndex > 3) {
      return res.status(400).json({ error: 'Index relay tidak valid' });
    }

    // Update state
    relayStates[relayIndex] = status;

    const topic = relayTopics[relayIndex];
    const payload = status ? 'ON' : 'OFF';

    addLog('info', `Tombol Relay ${relayIndex + 1} ditekan: ${status ? 'MENYALAKAN (ON)' : 'MEMATIKAN (OFF)'}`);

    if (mqttClient && isConnected) {
      mqttClient.publish(topic, payload, { qos: 1, retain: true }, (err: any) => {
        if (err) {
          addLog('error', `Gagal mengirim pesan Relay ${relayIndex + 1} ke broker: ${err.message}`);
        } else {
          addLog('success', `Berhasil menerbitkan MQTT [${topic}]: ${payload}`);
        }
      });
    } else {
      addLog('error', `Gagal mempublikasikan MQTT [${topic}]: Broker TERPUTUS. Status diperbarui di lokal.`);
    }

    res.json({ success: true, relays: relayStates });
  });

  app.post('/api/variasi', (req, res) => {
    const { varIndex, status } = req.body;

    if (varIndex < 0 || varIndex > 1) {
      return res.status(400).json({ error: 'Index variasi tidak valid' });
    }

    // Update state
    variasiStates[varIndex] = status;

    const topic = variasiTopics[varIndex];
    const payload = status ? 'ON' : 'OFF';

    addLog('info', `Tombol Variasi ${varIndex + 1} ditekan: ${status ? 'MENYALAKAN (ON)' : 'MEMATIKAN (OFF)'}`);

    if (mqttClient && isConnected) {
      mqttClient.publish(topic, payload, { qos: 1, retain: true }, (err: any) => {
        if (err) {
          addLog('error', `Gagal mengirim pesan Variasi ${varIndex + 1} ke broker: ${err.message}`);
        } else {
          addLog('success', `Berhasil menerbitkan MQTT [${topic}]: ${payload}`);
        }
      });
    } else {
      addLog('error', `Gagal mempublikasikan MQTT [${topic}]: Broker TERPUTUS. Status diperbarui di lokal.`);
    }

    // Jika variasi ini dihidupkan, matikan variasi yang lain
    if (status) {
      const otherIndex = varIndex === 0 ? 1 : 0;
      if (variasiStates[otherIndex] === true) {
        variasiStates[otherIndex] = false;
        const otherTopic = variasiTopics[otherIndex];
        
        addLog('info', `Variasi ${otherIndex + 1} otomatis dimaatikan karena Variasi ${varIndex + 1} dihidupkan`);
        
        if (mqttClient && isConnected) {
          mqttClient.publish(otherTopic, 'OFF', { qos: 1, retain: true }, (err: any) => {
            if (err) {
              addLog('error', `Gagal mengirim pesan auto-OFF Variasi ${otherIndex + 1}: ${err.message}`);
            } else {
              addLog('success', `Berhasil menerbitkan MQTT auto-OFF [${otherTopic}]: OFF`);
            }
          });
        }
      }
    }

    res.json({ success: true, variations: variasiStates });
  });

  app.post('/api/log', (req, res) => {
    const { type, message } = req.body;
    const validTypes = ['info', 'success', 'error', 'voice'];
    const logType = validTypes.includes(type) ? type : 'info';
    
    addLog(logType as any, message);
    res.json({ success: true });
  });

  app.post('/api/logs/clear', (req, res) => {
    logs = [];
    addLog('info', 'Log aktivitas telah dibersihkan');
    res.json({ success: true });
  });

  // Serve Vite or static artifacts
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
