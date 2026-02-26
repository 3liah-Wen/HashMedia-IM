import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Server, 
  MessageSquare, 
  Plus, 
  Hash, 
  Send, 
  Network, 
  User, 
  Activity,
  ChevronRight,
  Shield,
  Cpu,
  Lock,
  Unlock,
  Key,
  Globe,
  Search,
  Copy,
  Check,
  Trash2,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Download,
  Loader2
} from 'lucide-react';
import CryptoJS from 'crypto-js';
import { cn } from './lib/utils';
import type { Node, Message, WSMessage } from './types';

export default function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [activeNode, setActiveNode] = useState<Node | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [peers, setPeers] = useState<string[]>([]);
  const [inputText, setInputText] = useState('');
  const [userName, setUserName] = useState(() => localStorage.getItem('hm_username') || 'Peer-' + Math.floor(Math.random() * 1000));
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  const [isDiscoveringNode, setIsDiscoveringNode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  const [discoverNodeId, setDiscoverNodeId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState(() => localStorage.getItem('hm_enc_key') || '');
  const [isEncrypted, setIsEncrypted] = useState(true);
  
  const socketRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('hm_username', userName);
  }, [userName]);

  useEffect(() => {
    localStorage.setItem('hm_enc_key', encryptionKey);
  }, [encryptionKey]);

  useEffect(() => {
    fetchNodes();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchNodes = async () => {
    try {
      const res = await fetch('/api/nodes');
      const data = await res.json();
      setNodes(data);
    } catch (err) {
      console.error('Failed to fetch nodes', err);
    }
  };

  const deleteNode = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to decommission this micro-server? All messages will be lost.')) return;
    
    try {
      const res = await fetch(`/api/nodes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeNode?.id === id) {
          setActiveNode(null);
          setMessages([]);
          if (socketRef.current) socketRef.current.close();
        }
        fetchNodes();
      }
    } catch (err) {
      console.error('Failed to delete node', err);
    }
  };

  const createNode = async () => {
    if (!newNodeName.trim()) return;
    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newNodeName, owner_email: 'user@example.com' })
      });
      if (res.ok) {
        setNewNodeName('');
        setIsCreatingNode(false);
        fetchNodes();
      }
    } catch (err) {
      console.error('Failed to create node', err);
    }
  };

  const discoverNode = async () => {
    if (!discoverNodeId.trim()) return;
    try {
      const res = await fetch(`/api/nodes/${discoverNodeId}`);
      if (res.ok) {
        const node = await res.json();
        // Add to local list if not already there
        setNodes(prev => {
          if (prev.find(n => n.id === node.id)) return prev;
          return [...prev, node];
        });
        setDiscoverNodeId('');
        setIsDiscoveringNode(false);
        connectToNode(node);
      } else {
        alert('Node not found in the mesh network.');
      }
    } catch (err) {
      console.error('Failed to discover node', err);
    }
  };

  const connectToNode = (node: Node) => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    setActiveNode(node);
    setMessages([]);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      socket.send(JSON.stringify({ type: 'join', node_id: node.id, sender: userName }));
    };

    socket.onmessage = (event) => {
      const data: WSMessage = JSON.parse(event.data);
      if (data.type === 'history') {
        const decryptedMessages = (data.messages || []).map(msg => {
          if (isEncrypted && encryptionKey) {
            try {
              const bytes = CryptoJS.AES.decrypt(msg.text || '', encryptionKey);
              const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
              return { ...msg, text: decryptedText || msg.text, isDecrypted: !!decryptedText };
            } catch (e) {
              return { ...msg, isDecrypted: false };
            }
          }
          return { ...msg, isDecrypted: false };
        });
        setMessages(decryptedMessages);
      } else if (data.type === 'chat') {
        let displayMsg = { ...data };
        if (isEncrypted && encryptionKey && !data.isSystem) {
          try {
            const bytes = CryptoJS.AES.decrypt(data.text || '', encryptionKey);
            const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
            if (decryptedText) {
              displayMsg.text = decryptedText;
              displayMsg.isDecrypted = true;
            } else {
              displayMsg.isDecrypted = false;
            }
          } catch (e) {
            displayMsg.isDecrypted = false;
          }
        }
        setMessages(prev => [...prev, displayMsg]);
      } else if (data.type === 'peers') {
        setPeers(data.peers || []);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
    };
  };

  const copyNodeId = () => {
    if (!activeNode) return;
    navigator.clipboard.writeText(activeNode.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const sendMessage = () => {
    if (!inputText.trim() || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

    let textToSend = inputText;
    if (isEncrypted && encryptionKey) {
      textToSend = CryptoJS.AES.encrypt(inputText, encryptionKey).toString();
    }

    socketRef.current.send(JSON.stringify({
      type: 'chat',
      sender: userName,
      text: textToSend,
      mime_type: 'text/plain'
    }));
    setInputText('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeNode || !socketRef.current) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (res.ok) {
        socketRef.current.send(JSON.stringify({
          type: 'chat',
          sender: userName,
          hash: data.hash,
          mime_type: data.type,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-zinc-300 font-sans selection:bg-emerald-500/30">
      {/* Sidebar: Nodes */}
      <div className="w-72 border-r border-zinc-800/50 flex flex-col bg-[#0D0D0D]">
        <div className="p-6 border-b border-zinc-800/50">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Network className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h1 className="font-bold text-white tracking-tight">HashMedia</h1>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">Mesh Network IM</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2 block">Identity</label>
              <div className="flex items-center gap-2 bg-zinc-900/50 p-2 rounded-lg border border-zinc-800">
                <User className="w-4 h-4 text-zinc-500" />
                <input 
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="bg-transparent border-none outline-none text-xs w-full text-zinc-300"
                  placeholder="Set Peer Name"
                />
              </div>
            </div>

            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold block">Encryption Key</label>
                <button 
                  onClick={() => setIsEncrypted(!isEncrypted)}
                  className={cn(
                    "p-1 rounded transition-colors",
                    isEncrypted ? "text-emerald-500" : "text-zinc-600"
                  )}
                >
                  {isEncrypted ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                </button>
              </div>
              <div className="flex items-center gap-2 bg-zinc-900/50 p-2 rounded-lg border border-zinc-800">
                <Key className="w-4 h-4 text-zinc-500" />
                <input 
                  type="password"
                  value={encryptionKey}
                  onChange={(e) => setEncryptionKey(e.target.value)}
                  className="bg-transparent border-none outline-none text-xs w-full text-zinc-300"
                  placeholder="AES Secret"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Micro-Servers</span>
            <div className="flex gap-1">
              <button 
                onClick={() => setIsDiscoveringNode(true)}
                className="p-1 hover:bg-zinc-800 rounded-md transition-colors text-zinc-400"
                title="Discover Node"
              >
                <Globe className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setIsCreatingNode(true)}
                className="p-1 hover:bg-zinc-800 rounded-md transition-colors text-zinc-400"
                title="Create Node"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {nodes.map(node => (
            <div
              key={node.id}
              onClick={() => connectToNode(node)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl transition-all group cursor-pointer",
                activeNode?.id === node.id 
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" 
                  : "hover:bg-zinc-800/50 border border-transparent text-zinc-400 hover:text-zinc-200"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center border transition-colors",
                activeNode?.id === node.id ? "bg-emerald-500/20 border-emerald-500/30" : "bg-zinc-900 border-zinc-800 group-hover:border-zinc-700"
              )}>
                <Server className="w-4 h-4" />
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{node.name}</p>
                <p className="text-[10px] font-mono opacity-50 truncate">{node.id}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => deleteNode(e, node.id)}
                  className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-500 rounded-lg transition-all"
                  title="Decommission Node"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ChevronRight className={cn("w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity", activeNode?.id === node.id && "opacity-100")} />
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-zinc-800/50">
          <div className="flex items-center gap-3 p-3 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
            <div className={cn("w-2 h-2 rounded-full animate-pulse", isConnected ? "bg-emerald-500" : "bg-red-500")} />
            <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">
              {isConnected ? "Network Active" : "Disconnected"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content: Chat */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {activeNode ? (
          <>
            {/* Chat Header */}
            <header className="h-20 border-b border-zinc-800/50 flex items-center justify-between px-8 bg-[#0D0D0D]/80 backdrop-blur-md z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <Cpu className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">{activeNode.name}</h2>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={copyNodeId}
                      className="flex items-center gap-1.5 group/id"
                    >
                      <span className="text-[10px] font-mono text-zinc-500 group-hover/id:text-emerald-500 transition-colors">Node ID: {activeNode.id}</span>
                      {copiedId ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-zinc-600 group-hover/id:text-emerald-500 transition-colors" />}
                    </button>
                    <span className="w-1 h-1 rounded-full bg-zinc-700" />
                    <span className="text-[10px] font-mono text-emerald-500/70">MD5 Addressing Enabled</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Latency</span>
                  <span className="text-xs font-mono text-emerald-500">12ms</span>
                </div>
                <div className="w-px h-8 bg-zinc-800" />
                <div className="flex flex-col items-end">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Peers</span>
                  <span className="text-xs font-mono text-emerald-500">{peers.length}</span>
                </div>
              </div>
            </header>

            {/* Peer List Sidebar (Optional/Overlay) */}
            <div className="absolute right-8 top-24 w-48 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 backdrop-blur-md z-20 hidden lg:block">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Active Peers</span>
              </div>
              <div className="space-y-3">
                {peers.map((peer, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700 group-hover:border-emerald-500/30 transition-colors">
                      <User className="w-3 h-3 text-zinc-500 group-hover:text-emerald-500" />
                    </div>
                    <span className="text-xs text-zinc-400 group-hover:text-zinc-200 truncate">{peer}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Messages Area */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-8 space-y-6 scroll-smooth"
            >
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
                    <Shield className="w-8 h-8 text-zinc-700" />
                  </div>
                  <p className="text-xs text-zinc-500 max-w-xs">
                    You've entered an encrypted micro-server. All content is addressed via MD5 hashes for integrity and deduplication.
                  </p>
                </div>

                {messages.map((msg, idx) => (
                  msg.isSystem ? (
                    <div key={idx} className="flex justify-center">
                      <div className="bg-zinc-900/30 border border-zinc-800/50 px-3 py-1 rounded-full">
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">{msg.text}</span>
                      </div>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={idx}
                      className={cn(
                        "flex flex-col gap-2",
                        msg.sender === userName ? "items-end" : "items-start"
                      )}
                    >
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{msg.sender}</span>
                        <span className="text-[10px] font-mono text-zinc-600">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className={cn(
                        "max-w-md p-4 rounded-2xl border transition-all",
                        msg.sender === userName 
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-100 rounded-tr-none" 
                          : "bg-zinc-900/50 border-zinc-800 text-zinc-300 rounded-tl-none",
                        !msg.isDecrypted && isEncrypted && !msg.mime_type?.startsWith('image/') && !msg.mime_type?.startsWith('video/') && "opacity-50 grayscale blur-[1px]"
                      )}>
                        {msg.mime_type?.startsWith('image/') ? (
                          <div className="space-y-2">
                            <img 
                              src={`/api/media/${msg.hash || msg.content_hash}`} 
                              alt="Shared media"
                              className="rounded-lg max-h-64 object-contain bg-black/20"
                              referrerPolicy="no-referrer"
                            />
                            {msg.text && (
                              <p className="text-sm leading-relaxed">
                                {!msg.isDecrypted && isEncrypted ? "Encrypted caption" : msg.text}
                              </p>
                            )}
                          </div>
                        ) : msg.mime_type?.startsWith('video/') ? (
                          <div className="space-y-2">
                            <video 
                              src={`/api/media/${msg.hash || msg.content_hash}`} 
                              controls
                              className="rounded-lg max-h-64 w-full bg-black/20"
                            />
                            {msg.text && (
                              <p className="text-sm leading-relaxed">
                                {!msg.isDecrypted && isEncrypted ? "Encrypted caption" : msg.text}
                              </p>
                            )}
                          </div>
                        ) : msg.mime_type && msg.mime_type !== 'text/plain' ? (
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                              <FileText className="w-5 h-5 text-zinc-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-mono text-zinc-500 truncate">{msg.mime_type}</p>
                              <a 
                                href={`/api/media/${msg.hash || msg.content_hash}`}
                                download
                                className="text-sm font-medium text-emerald-400 hover:underline flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                Download File
                              </a>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm leading-relaxed">
                            {!msg.isDecrypted && isEncrypted ? "Unable to decrypt content. Check secret key." : msg.text}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 px-2 opacity-30 hover:opacity-100 transition-opacity">
                        <Hash className="w-3 h-3 text-zinc-500" />
                        <span className="text-[9px] font-mono text-zinc-500 select-all">{msg.hash || msg.content_hash}</span>
                      </div>
                    </motion.div>
                  )
                ))}
              </div>
            </div>

            {/* Input Area */}
            <div className="p-8 bg-gradient-to-t from-[#0A0A0A] to-transparent">
              <div className="max-w-3xl mx-auto relative">
                <div className="absolute -top-6 left-4 flex items-center gap-2">
                  <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />
                  <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Routing via Mesh-01</span>
                </div>
                <div className="flex items-center gap-3 bg-zinc-900/80 border border-zinc-800 p-2 rounded-2xl focus-within:border-emerald-500/50 transition-all shadow-2xl backdrop-blur-sm">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-10 h-10 rounded-xl bg-zinc-800 text-zinc-400 flex items-center justify-center hover:bg-zinc-700 transition-all"
                  >
                    {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                  </button>
                  <input
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Broadcast message to node..."
                    className="flex-1 bg-transparent border-none outline-none px-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!inputText.trim() || isUploading}
                    className="w-10 h-10 rounded-xl bg-emerald-500 text-black flex items-center justify-center hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-md"
            >
              <div className="w-24 h-24 rounded-3xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mx-auto mb-8">
                <Network className="w-12 h-12 text-emerald-500" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">Initialize Connection</h2>
              <p className="text-zinc-500 mb-8 leading-relaxed">
                HashMedia is a decentralized messaging protocol. Select a micro-server from the sidebar or create your own to begin broadcasting content-addressed messages.
              </p>
              <button 
                onClick={() => setIsCreatingNode(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all font-medium"
              >
                <Plus className="w-5 h-5" />
                Create New Micro-Server
              </button>
            </motion.div>
          </div>
        )}
      </div>

      {/* Modal: Create Node */}
      <AnimatePresence>
        {isCreatingNode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreatingNode(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#0D0D0D] border border-zinc-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-white mb-2">Deploy Micro-Server</h3>
              <p className="text-sm text-zinc-500 mb-6">Define a new node in the HashMedia mesh network.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2 block">Node Name</label>
                  <input
                    autoFocus
                    value={newNodeName}
                    onChange={(e) => setNewNodeName(e.target.value)}
                    placeholder="e.g. Secure-Relay-01"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 transition-all"
                  />
                </div>
                
                <div className="pt-4 flex gap-3">
                  <button
                    onClick={() => setIsCreatingNode(false)}
                    className="flex-1 px-4 py-3 rounded-xl border border-zinc-800 text-zinc-400 hover:bg-zinc-900 transition-all text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createNode}
                    className="flex-1 px-4 py-3 rounded-xl bg-emerald-500 text-black hover:bg-emerald-400 transition-all text-sm font-medium shadow-lg shadow-emerald-500/20"
                  >
                    Deploy Node
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Discover Node */}
      <AnimatePresence>
        {isDiscoveringNode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDiscoveringNode(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#0D0D0D] border border-zinc-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-white mb-2">Discover Node</h3>
              <p className="text-sm text-zinc-500 mb-6">Enter a Node ID to attempt a direct connection via mesh routing.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2 block">Node ID (Hex)</label>
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 focus-within:border-emerald-500/50 transition-all">
                    <Search className="w-4 h-4 text-zinc-500" />
                    <input
                      autoFocus
                      value={discoverNodeId}
                      onChange={(e) => setDiscoverNodeId(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && discoverNode()}
                      placeholder="e.g. a1b2c3d4"
                      className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-200"
                    />
                  </div>
                </div>
                
                <div className="pt-4 flex gap-3">
                  <button
                    onClick={() => setIsDiscoveringNode(false)}
                    className="flex-1 px-4 py-3 rounded-xl border border-zinc-800 text-zinc-400 hover:bg-zinc-900 transition-all text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={discoverNode}
                    className="flex-1 px-4 py-3 rounded-xl bg-emerald-500 text-black hover:bg-emerald-400 transition-all text-sm font-medium shadow-lg shadow-emerald-500/20"
                  >
                    Connect
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
