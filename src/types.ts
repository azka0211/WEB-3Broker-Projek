export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'voice';
  message: string;
}

export interface BrokerConfig {
  host: string;
  port: number;
  clientId: string;
  username: string;
  password?: string;
}

export interface MqttState {
  connected: boolean;
  selectedBroker: string;
  relays: boolean[];
  variations: boolean[];
  suhu: string | null;
  kelembaban: string | null;
  logs: LogEntry[];
  relayTopics: string[];
  variasiTopics: string[];
  brokerConfig: BrokerConfig;
}
