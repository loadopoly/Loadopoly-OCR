import React, { useState } from 'react';
import { 
  Users, 
  MessageSquare, 
  Sprout, 
  LayoutDashboard,
  TrendingUp,
  Shield,
  Search,
  Bell,
  ArrowRight
} from 'lucide-react';
import Communities from './Communities';
import Messages from './Messages';
import { RoyaltyDashboard, ShardPortfolio, GovernanceVoting } from './gard';
import { Community, CommunityAdmissionRequest, UserMessage, DigitalAsset, ImageBundle } from '../types';

interface SocialAppProps {
  user: any;
  communities: Community[];
  admissionRequests: CommunityAdmissionRequest[];
  messages: UserMessage[];
  localAssets: DigitalAsset[];
  displayItems: any[];
  selectedCommunityId: string | null;
  onJoinCommunity: (communityId: string) => void;
  onCreateCommunity: (community: Partial<Community>) => void;
  onApproveRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
  onSelectCommunity: (communityId: string | null) => void;
  onSendMessage: (receiverId: string, content: string, giftId?: string, isBundle?: boolean) => void;
  onClaimGift: (messageId: string) => void;
  setAdmissionRequests: React.Dispatch<React.SetStateAction<CommunityAdmissionRequest[]>>;
}

export default function SocialApp({
  user,
  communities,
  admissionRequests,
  messages,
  localAssets,
  displayItems,
  selectedCommunityId,
  onJoinCommunity,
  onCreateCommunity,
  onApproveRequest,
  onRejectRequest,
  onSelectCommunity,
  onSendMessage,
  onClaimGift,
  setAdmissionRequests
}: SocialAppProps) {
  const [activeSubTab, setActiveSubTab] = useState<'feed' | 'communities' | 'messages' | 'returns'>('feed');

  const unreadMessagesCount = messages.filter(m => m.receiverId === user?.id && !m.isRead).length;
  const pendingRequestsCount = admissionRequests.filter(r => 
    communities.find(c => c.id === r.communityId)?.adminIds.includes(user?.id) && r.status === 'PENDING'
  ).length;

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Social Dashboard Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            Social Hub
            <span className="px-2 py-0.5 bg-primary-500/10 border border-primary-500/20 rounded text-[10px] text-primary-400 font-mono uppercase tracking-widest">v2.0 curated</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">Unified ecosystem for collaboration, communication, and social equity.</p>
        </div>

        <div className="flex items-center gap-2 p-1 bg-slate-900/50 border border-slate-800 rounded-xl">
          <button 
            onClick={() => setActiveSubTab('feed')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeSubTab === 'feed' ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <LayoutDashboard size={14} />
            Overview
          </button>
          <button 
            onClick={() => setActiveSubTab('communities')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 relative ${activeSubTab === 'communities' ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <Users size={14} />
            Communities
            {pendingRequestsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full border-2 border-slate-900 text-[8px] flex items-center justify-center text-black font-bold">
                {pendingRequestsCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveSubTab('messages')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 relative ${activeSubTab === 'messages' ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <MessageSquare size={14} />
            Messages
            {unreadMessagesCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 rounded-full border-2 border-slate-900 text-[8px] flex items-center justify-center text-white font-bold">
                {unreadMessagesCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveSubTab('returns')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeSubTab === 'returns' ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <Sprout size={14} />
            Returns
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeSubTab === 'feed' && (
          <div className="h-full overflow-auto pr-2 custom-scrollbar space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Quick Stats */}
              <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-xl flex flex-col justify-between">
                <div>
                  <TrendingUp className="mb-4 opacity-80" size={24} />
                  <h4 className="text-3xl font-bold">GARD Rewards</h4>
                  <p className="text-indigo-100 text-sm mt-1">System-wide social returns</p>
                </div>
                <button 
                  onClick={() => setActiveSubTab('returns')}
                  className="mt-6 flex items-center gap-2 text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg transition-all w-fit"
                >
                  View Dashboard <ArrowRight size={14} />
                </button>
              </div>

              {/* Community Snapshot */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <Users className="text-primary-500 mb-4" size={24} />
                  <h4 className="text-white text-xl font-bold">{communities.filter(c => c.memberIds.includes(user?.id)).length} Communities</h4>
                  <p className="text-slate-400 text-sm mt-1">You are impacting {communities.filter(c => c.memberIds.includes(user?.id)).length} data circles.</p>
                </div>
                <button 
                  onClick={() => setActiveSubTab('communities')}
                  className="mt-6 flex items-center gap-2 text-xs font-bold text-primary-400 hover:text-primary-300 transition-all"
                >
                  Manage Membership <ArrowRight size={14} />
                </button>
              </div>

              {/* Active Conversations */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <MessageSquare className="text-indigo-400 mb-4" size={24} />
                  <h4 className="text-white text-xl font-bold">{unreadMessagesCount} Unread</h4>
                  <p className="text-slate-400 text-sm mt-1">New updates in your active threads.</p>
                </div>
                <button 
                  onClick={() => setActiveSubTab('messages')}
                  className="mt-6 flex items-center gap-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-all"
                >
                  Go to Messages <ArrowRight size={14} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
              <div className="space-y-4">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <Shield size={18} className="text-amber-500" />
                  Recent Governance
                </h3>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-500 italic">No active proposals in your communities.</p>
                </div>
                
                <div className="p-4 bg-primary-500/5 border border-primary-500/10 rounded-xl">
                  <h5 className="text-xs font-bold text-primary-400 uppercase tracking-widest mb-2">Curator Insight</h5>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    "The strength of a data network isn't just in the volume of shards, but in the velocity of collaboration. Engage with your communities to maximize yield."
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <Bell size={18} className="text-indigo-400" />
                  Activity Stream
                </h3>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl divide-y divide-slate-800/50">
                  <div className="p-3 flex items-center gap-3 hover:bg-slate-800/30 transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                      <TrendingUp size={14} />
                    </div>
                    <div>
                      <p className="text-[11px] text-white font-bold">Shards Distributed</p>
                      <p className="text-[10px] text-slate-500">2.4 GARD added to your portfolio v8-node</p>
                    </div>
                  </div>
                  <div className="p-3 flex items-center gap-3 hover:bg-slate-800/30 transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-500 flex items-center justify-center">
                      <MessageSquare size={14} />
                    </div>
                    <div>
                      <p className="text-[11px] text-white font-bold">New Connection</p>
                      <p className="text-[10px] text-slate-500">Curator user_441 joined Urban Archeology</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'communities' && (
          <Communities 
            user={user}
            communities={communities}
            admissionRequests={admissionRequests}
            selectedCommunityId={selectedCommunityId}
            onJoin={onJoinCommunity}
            onCreate={onCreateCommunity}
            onApprove={onApproveRequest}
            onReject={onRejectRequest}
            onSelect={onSelectCommunity}
          />
        )}

        {activeSubTab === 'messages' && (
          <Messages 
            user={user}
            messages={messages}
            assets={localAssets}
            bundles={displayItems.filter((i): i is ImageBundle => 'bundleId' in i)}
            onSendMessage={onSendMessage}
            onClaimGift={onClaimGift}
          />
        )}

        {activeSubTab === 'returns' && (
          <div className="h-full flex flex-col gap-6 overflow-auto pr-2 custom-scrollbar">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Social Returns (GARD) Dashboard</h3>
                <p className="text-sm text-slate-400">Yield management and sharding analytics.</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-green-400 text-xs font-bold">
                <Sprout size={14} />
                YIELD OPTIMIZED
              </div>
            </div>

            <RoyaltyDashboard />
            
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ShardPortfolio userId={user?.id || ''} />
              <GovernanceVoting userId={user?.id || ''} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
