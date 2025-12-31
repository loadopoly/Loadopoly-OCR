import React, { useState } from 'react';
import { Users, Plus, Shield, Globe, Lock, Check, X, Zap, Network, Database } from 'lucide-react';
import { Community, CommunityAdmissionRequest, DigitalAsset } from '../types';

interface CommunitiesProps {
  user: any;
  communities: Community[];
  admissionRequests: CommunityAdmissionRequest[];
  onJoin: (communityId: string) => void;
  onCreate: (community: Partial<Community>) => void;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onSelect: (communityId: string | null) => void;
  selectedCommunityId: string | null;
}

export default function Communities({ 
  user, 
  communities, 
  admissionRequests, 
  onJoin, 
  onCreate, 
  onApprove, 
  onReject,
  onSelect,
  selectedCommunityId
}: CommunitiesProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCommunity, setNewCommunity] = useState<Partial<Community>>({
    name: '',
    description: '',
    isPrivate: false,
    shardDispersionConfig: { adminPercentage: 10, memberPercentage: 90 }
  });

  const userCommunities = communities.filter(c => c.memberIds.includes(user?.id));
  const otherCommunities = communities.filter(c => !c.memberIds.includes(user?.id));
  const adminRequests = admissionRequests.filter(r => 
    communities.find(c => c.id === r.communityId)?.adminIds.includes(user?.id) && r.status === 'PENDING'
  );

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Data Communities</h3>
          <p className="text-sm text-slate-400">Collaborate, share data, and earn collective shards.</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold rounded-lg shadow-lg flex items-center gap-2 transition-all"
        >
          <Plus size={18} />
          Create Community
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-auto pr-2 custom-scrollbar">
        <div className="lg:col-span-2 space-y-6">
          {/* My Communities */}
          <section>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Users size={14} /> My Communities ({userCommunities.length})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userCommunities.map(community => (
                <div key={community.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-primary-500/50 transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-primary-500/10 rounded-lg text-primary-500">
                      <Users size={24} />
                    </div>
                    {community.adminIds.includes(user?.id) && (
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-500 text-[10px] font-bold rounded-full flex items-center gap-1">
                        <Shield size={10} /> ADMIN
                      </span>
                    )}
                  </div>
                  <h5 className="text-white font-bold mb-1">{community.name}</h5>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-4">{community.description}</p>
                  <div className="flex gap-2 mb-4">
                    <button 
                      onClick={() => onSelect(selectedCommunityId === community.id ? null : community.id)}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${selectedCommunityId === community.id ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                      {selectedCommunityId === community.id ? 'Viewing Data' : 'View Community Data'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>{community.memberIds.length} Members</span>
                    <div className="flex gap-2">
                      <button className="text-primary-400 hover:text-primary-300 flex items-center gap-1">
                        <Network size={12} /> Graph
                      </button>
                      <button className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                        <Database size={12} /> Data
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {userCommunities.length === 0 && (
                <div className="col-span-full p-8 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500 text-sm">
                  You haven't joined any communities yet.
                </div>
              )}
            </div>
          </section>

          {/* Discover Communities */}
          <section>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Globe size={14} /> Discover Communities
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {otherCommunities.map(community => (
                <div key={community.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 hover:bg-slate-900 transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-slate-800 rounded-lg text-slate-400">
                      <Users size={24} />
                    </div>
                    {community.isPrivate ? <Lock size={14} className="text-slate-600" /> : <Globe size={14} className="text-slate-600" />}
                  </div>
                  <h5 className="text-white font-bold mb-1">{community.name}</h5>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-4">{community.description}</p>
                  <button 
                    onClick={() => onJoin(community.id)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all"
                  >
                    {community.isPrivate ? 'Request to Join' : 'Join Community'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar: Requests & Stats */}
        <div className="space-y-6">
          {adminRequests.length > 0 && (
            <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 bg-slate-800/50 border-b border-slate-800">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Shield size={14} className="text-amber-500" /> Admission Requests
                </h4>
              </div>
              <div className="divide-y divide-slate-800">
                {adminRequests.map(request => (
                  <div key={request.id} className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary-500/20 rounded-full flex items-center justify-center text-primary-500 font-bold text-xs">
                        {request.userId.slice(0,2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">User {request.userId.slice(0,8)}</p>
                        <p className="text-[10px] text-slate-500 truncate">wants to join {communities.find(c => c.id === request.communityId)?.name}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => onApprove(request.id)}
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1"
                      >
                        <Check size={12} /> Approve
                      </button>
                      <button 
                        onClick={() => onReject(request.id)}
                        className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded flex items-center justify-center gap-1"
                      >
                        <X size={12} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-5">
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Zap size={14} /> Shard Dispersion
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
              Communities enable collective data ownership. Shards generated from community-contributed data are distributed based on the administrator's configuration.
            </p>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-500">Avg. Admin Share</span>
                <span className="text-white font-mono">15%</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-500">Avg. Member Share</span>
                <span className="text-white font-mono">85%</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Create Community Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus size={20} className="text-primary-500" /> Create Community
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Community Name</label>
                <input 
                  type="text" 
                  value={newCommunity.name}
                  onChange={e => setNewCommunity({...newCommunity, name: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500 transition-colors"
                  placeholder="e.g. Historical Map Collectors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Description</label>
                <textarea 
                  value={newCommunity.description}
                  onChange={e => setNewCommunity({...newCommunity, description: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500 transition-colors h-24 resize-none"
                  placeholder="What is this community about?"
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2">
                  {newCommunity.isPrivate ? <Lock size={16} className="text-amber-500" /> : <Globe size={16} className="text-emerald-500" />}
                  <span className="text-xs font-bold text-slate-300">{newCommunity.isPrivate ? 'Private (Invite Only)' : 'Public (Anyone can join)'}</span>
                </div>
                <button 
                  onClick={() => setNewCommunity({...newCommunity, isPrivate: !newCommunity.isPrivate})}
                  className={`w-10 h-5 rounded-full relative transition-colors ${newCommunity.isPrivate ? 'bg-primary-600' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${newCommunity.isPrivate ? 'right-1' : 'left-1'}`}></div>
                </button>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-3">Shard Dispersion (Admin / Member %)</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="0" 
                    max="50" 
                    value={newCommunity.shardDispersionConfig?.adminPercentage}
                    onChange={e => setNewCommunity({
                      ...newCommunity, 
                      shardDispersionConfig: { 
                        adminPercentage: parseInt(e.target.value), 
                        memberPercentage: 100 - parseInt(e.target.value) 
                      }
                    })}
                    className="flex-1 accent-primary-500"
                  />
                  <span className="text-xs font-mono text-white w-16 text-right">
                    {newCommunity.shardDispersionConfig?.adminPercentage}% / {newCommunity.shardDispersionConfig?.memberPercentage}%
                  </span>
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-950/50 border-t border-slate-800 flex gap-3">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-lg transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => { onCreate(newCommunity); setShowCreateModal(false); }}
                disabled={!newCommunity.name}
                className="flex-1 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-primary-900/20"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
