import React, { useState } from 'react';
import { MessageSquare, Send, Gift, Package, ImageIcon, Search, X, Check, CheckCheck } from 'lucide-react';
import { UserMessage, DigitalAsset, ImageBundle } from '../types';

interface MessagesProps {
  user: any;
  messages: UserMessage[];
  assets: DigitalAsset[];
  bundles: ImageBundle[];
  onSendMessage: (receiverId: string, content: string, giftId?: string, isBundle?: boolean) => void;
  onClaimGift: (messageId: string) => void;
}

export default function Messages({ user, messages, assets, bundles, onSendMessage, onClaimGift }: MessagesProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftType, setGiftType] = useState<'ASSET' | 'BUNDLE'>('ASSET');

  // Group messages by conversation
  const conversations = messages.reduce((acc, msg) => {
    const otherId = msg.senderId === user?.id ? msg.receiverId : msg.senderId;
    if (!acc[otherId]) acc[otherId] = [];
    acc[otherId].push(msg);
    return acc;
  }, {} as Record<string, UserMessage[]>);

  const sortedConversations = Object.entries(conversations).sort((a, b) => {
    const lastA = a[1][a[1].length - 1].timestamp;
    const lastB = b[1][b[1].length - 1].timestamp;
    return new Date(lastB).getTime() - new Date(lastA).getTime();
  });

  const activeMessages = selectedUserId ? conversations[selectedUserId] || [] : [];

  const handleSend = () => {
    if (!selectedUserId || (!newMessage.trim() && !showGiftModal)) return;
    onSendMessage(selectedUserId, newMessage);
    setNewMessage('');
  };

  const handleGift = (id: string) => {
    if (!selectedUserId) return;
    onSendMessage(selectedUserId, `Sent you a ${giftType.toLowerCase()}!`, id, giftType === 'BUNDLE');
    setShowGiftModal(false);
  };

  return (
    <div className="h-full flex bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Sidebar: Conversations */}
      <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-950/50">
        <div className="p-4 border-b border-slate-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <input 
              type="text" 
              placeholder="Search messages..." 
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-primary-500 transition-colors"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto custom-scrollbar">
          {sortedConversations.map(([otherId, msgs]) => {
            const lastMsg = msgs[msgs.length - 1];
            const unreadCount = msgs.filter(m => m.receiverId === user?.id && !m.isRead).length;
            return (
              <button 
                key={otherId}
                onClick={() => setSelectedUserId(otherId)}
                className={`w-full p-4 flex items-center gap-3 hover:bg-slate-800/50 transition-colors border-b border-slate-800/50 ${selectedUserId === otherId ? 'bg-primary-600/10 border-r-2 border-r-primary-500' : ''}`}
              >
                <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 font-bold text-sm">
                  {otherId.slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-white truncate">User {otherId.slice(0,8)}</span>
                    <span className="text-[9px] text-slate-500">{new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{lastMsg.content}</p>
                </div>
                {unreadCount > 0 && (
                  <div className="w-4 h-4 bg-primary-600 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                    {unreadCount}
                  </div>
                )}
              </button>
            );
          })}
          {sortedConversations.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-xs">No conversations yet.</div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-slate-900">
        {selectedUserId ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 font-bold text-xs">
                  {selectedUserId.slice(0,2).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">User {selectedUserId.slice(0,8)}</h4>
                  <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div> Online
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"><Search size={18} /></button>
                <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"><X size={18} onClick={() => setSelectedUserId(null)} /></button>
              </div>
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-auto p-6 space-y-4 custom-scrollbar">
              {activeMessages.map(msg => {
                const isMe = msg.senderId === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`p-3 rounded-2xl text-sm ${isMe ? 'bg-primary-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none'}`}>
                        {msg.content}
                        {(msg.giftAssetId || msg.giftBundleId) && (
                          <div className={`mt-3 p-3 rounded-xl border ${isMe ? 'bg-primary-700 border-primary-500' : 'bg-slate-900 border-slate-700'} flex items-center gap-3`}>
                            <div className="p-2 bg-amber-500/20 rounded-lg text-amber-500">
                              {msg.giftBundleId ? <Package size={20} /> : <ImageIcon size={20} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold uppercase text-amber-500 mb-0.5">Gift Received</p>
                              <p className="text-xs font-medium truncate">
                                {msg.giftBundleId ? 'Data Bundle' : 'Digital Asset'}
                              </p>
                            </div>
                            <button 
                              onClick={() => onClaimGift(msg.id)}
                              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded transition-all"
                            >
                              Claim
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 px-1">
                        <span className="text-[9px] text-slate-500">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && (msg.isRead ? <CheckCheck size={12} className="text-primary-500" /> : <Check size={12} className="text-slate-500" />)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/30">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowGiftModal(true)}
                  className="p-2 text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                  title="Send Gift"
                >
                  <Gift size={20} />
                </button>
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Type a message..." 
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500 transition-colors"
                />
                <button 
                  onClick={handleSend}
                  disabled={!newMessage.trim()}
                  className="p-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-xl transition-all shadow-lg shadow-primary-900/20"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-4">
            <div className="p-6 bg-slate-800/50 rounded-full">
              <MessageSquare size={48} className="opacity-20" />
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-400">Your Messages</p>
              <p className="text-xs max-w-xs mt-1">Select a conversation to start messaging or send data gifts to other users.</p>
            </div>
          </div>
        )}
      </div>

      {/* Gift Modal */}
      {showGiftModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Gift size={20} className="text-amber-500" /> Send Data Gift
              </h3>
              <button onClick={() => setShowGiftModal(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex gap-2">
              <button 
                onClick={() => setGiftType('ASSET')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${giftType === 'ASSET' ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
              >
                Digital Assets
              </button>
              <button 
                onClick={() => setGiftType('BUNDLE')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${giftType === 'BUNDLE' ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
              >
                Data Bundles
              </button>
            </div>
            <div className="p-4 max-h-96 overflow-auto custom-scrollbar grid grid-cols-2 gap-3">
              {giftType === 'ASSET' ? (
                assets.map(asset => (
                  <button 
                    key={asset.id}
                    onClick={() => handleGift(asset.id)}
                    className="p-2 bg-slate-800/50 border border-slate-700 rounded-xl hover:border-amber-500/50 transition-all text-left group"
                  >
                    <img src={asset.imageUrl} className="w-full h-24 object-cover rounded-lg mb-2 border border-slate-700" alt="asset" />
                    <p className="text-[10px] font-bold text-white truncate">{asset.sqlRecord?.DOCUMENT_TITLE || 'Untitled'}</p>
                    <p className="text-[9px] text-slate-500">{asset.id.slice(0,8)}</p>
                  </button>
                ))
              ) : (
                bundles.map(bundle => (
                  <button 
                    key={bundle.bundleId}
                    onClick={() => handleGift(bundle.bundleId)}
                    className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl hover:border-amber-500/50 transition-all text-left group"
                  >
                    <div className="p-3 bg-primary-500/10 rounded-lg text-primary-500 mb-2 w-fit">
                      <Package size={24} />
                    </div>
                    <p className="text-[10px] font-bold text-white truncate">{bundle.title}</p>
                    <p className="text-[9px] text-slate-500">{bundle.imageUrls.length} Items</p>
                  </button>
                ))
              )}
            </div>
            <div className="p-6 bg-slate-950/50 border-t border-slate-800">
              <p className="text-[10px] text-slate-500 text-center">
                Gifting data transfers ownership or access rights depending on the asset's license.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
