export interface Node {
  id: string;
  name: string;
  owner_email: string;
  created_at: string;
}

export interface Message {
  id?: number;
  node_id: string;
  sender_name: string;
  content_hash: string;
  timestamp: string;
  text?: string; // Hydrated from content table
  isDecrypted?: boolean;
  isSystem?: boolean;
  mime_type?: string;
}

export interface WSMessage {
  type: 'join' | 'chat' | 'history' | 'peers';
  node_id?: string;
  sender?: string;
  text?: string;
  messages?: Message[];
  peers?: string[];
  hash?: string;
  timestamp?: string;
  isDecrypted?: boolean;
  isSystem?: boolean;
  mime_type?: string;
}
