/**
 * GARD Governance Voting Component
 * 
 * DAO-style voting interface for social return project proposals.
 */

import React, { useState } from 'react';
import { 
  Vote,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  DollarSign,
  AlertCircle,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Landmark
} from 'lucide-react';
import { useGovernanceVoting } from '../../hooks/useGovernanceVoting';
import { SocialReturnProject } from '../../types';

interface GovernanceVotingProps {
  userId: string | null;
  communityId?: string;
}

const formatCurrency = (value: number): string => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
};

export default function GovernanceVoting({ userId, communityId }: GovernanceVotingProps) {
  const {
    projects,
    activeProjects,
    userVotingWeight,
    isLoading,
    error,
    submitProposal,
    castVote,
    hasVoted,
    refresh
  } = useGovernanceVoting(userId);

  const [showNewProposal, setShowNewProposal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [votedProjects, setVotedProjects] = useState<Set<string>>(new Set());

  const handleSubmitProposal = async () => {
    if (!newTitle || !newDescription || !newAmount) {
      alert('Please fill in all fields');
      return;
    }

    const project = await submitProposal(
      newTitle,
      newDescription,
      parseFloat(newAmount),
      communityId
    );

    if (project) {
      setShowNewProposal(false);
      setNewTitle('');
      setNewDescription('');
      setNewAmount('');
    }
  };

  const handleVote = async (projectId: string, voteFor: boolean) => {
    const success = await castVote(projectId, voteFor);
    if (success) {
      setVotedProjects(prev => new Set([...prev, projectId]));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'VOTING': return 'bg-blue-500/20 text-blue-400';
      case 'APPROVED': return 'bg-emerald-500/20 text-emerald-400';
      case 'FUNDED': return 'bg-purple-500/20 text-purple-400';
      case 'COMPLETED': return 'bg-green-500/20 text-green-400';
      case 'REJECTED': return 'bg-red-500/20 text-red-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Landmark className="text-indigo-500" size={24} />
            DAO Governance
          </h3>
          <p className="text-sm text-slate-400">
            Vote on social return projects • Community Fund allocation
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-slate-500">Your Voting Weight</p>
            <p className="text-lg font-bold text-white font-mono">
              {(userVotingWeight * 100).toFixed(2)}%
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="text-red-500" size={20} />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* New Proposal Button */}
      {userId && (
        <button
          onClick={() => setShowNewProposal(true)}
          className="w-full p-4 border-2 border-dashed border-slate-700 hover:border-indigo-500/50 rounded-xl text-slate-400 hover:text-indigo-400 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Submit New Proposal
        </button>
      )}

      {/* New Proposal Modal */}
      {showNewProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">New Social Return Proposal</h3>
              <p className="text-sm text-slate-400 mt-1">
                Request funding from the community fund for social impact projects.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Project Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g., Historical Archive Digitization"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Description</label>
                <textarea
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  rows={4}
                  placeholder="Describe the project and its social impact..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Requested Amount (USD)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="number"
                    value={newAmount}
                    onChange={e => setNewAmount(e.target.value)}
                    placeholder="10000"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-950 border-t border-slate-800 flex gap-3">
              <button
                onClick={() => setShowNewProposal(false)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitProposal}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors"
              >
                Submit Proposal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Proposals */}
      <div>
        <h4 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
          <Vote size={16} className="text-blue-400" />
          Active Proposals ({activeProjects.length})
        </h4>
        
        {activeProjects.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
            <Vote size={48} className="text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No active proposals to vote on.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeProjects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                userVotingWeight={userVotingWeight}
                hasVoted={votedProjects.has(project.id)}
                onVote={handleVote}
                getStatusColor={getStatusColor}
              />
            ))}
          </div>
        )}
      </div>

      {/* All Proposals */}
      <div>
        <h4 className="text-sm font-bold text-slate-300 mb-4">All Proposals</h4>
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-950">
              <tr>
                <th className="px-4 py-3 text-left text-slate-500 font-medium">Project</th>
                <th className="px-4 py-3 text-right text-slate-500 font-medium">Requested</th>
                <th className="px-4 py-3 text-center text-slate-500 font-medium">Votes</th>
                <th className="px-4 py-3 text-center text-slate-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {projects.map(project => (
                <tr key={project.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{project.title}</p>
                    <p className="text-slate-500 text-[10px] line-clamp-1">{project.description}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-white font-mono">
                    {formatCurrency(project.requestedAmount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-emerald-400">{project.votesFor}</span>
                    <span className="text-slate-600 mx-1">/</span>
                    <span className="text-red-400">{project.votesAgainst}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusColor(project.status)}`}>
                      {project.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface ProjectCardProps {
  project: SocialReturnProject;
  userVotingWeight: number;
  hasVoted: boolean;
  onVote: (projectId: string, voteFor: boolean) => void;
  getStatusColor: (status: string) => string;
}

function ProjectCard({ project, userVotingWeight, hasVoted, onVote, getStatusColor }: ProjectCardProps) {
  const totalVotes = project.votesFor + project.votesAgainst;
  const forPercentage = totalVotes > 0 ? (project.votesFor / totalVotes) * 100 : 50;

  const daysRemaining = project.votingDeadline 
    ? Math.max(0, Math.ceil((new Date(project.votingDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h5 className="text-white font-bold">{project.title}</h5>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{project.description}</p>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusColor(project.status)}`}>
            {project.status}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-400 mb-4">
          <span className="flex items-center gap-1">
            <DollarSign size={12} />
            {formatCurrency(project.requestedAmount)}
          </span>
          <span className="flex items-center gap-1">
            <Users size={12} />
            {totalVotes} votes
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {daysRemaining} days left
          </span>
        </div>

        {/* Vote Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-emerald-400 flex items-center gap-1">
              <ThumbsUp size={10} /> {project.votesFor} For
            </span>
            <span className="text-red-400 flex items-center gap-1">
              {project.votesAgainst} Against <ThumbsDown size={10} />
            </span>
          </div>
          <div className="h-2 bg-red-500/30 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${forPercentage}%` }}
            />
          </div>
        </div>

        {/* Vote Buttons */}
        {project.status === 'VOTING' && !hasVoted && userVotingWeight > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => onVote(project.id, true)}
              className="flex-1 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-emerald-500/30 transition-colors"
            >
              <ThumbsUp size={14} /> Vote For
            </button>
            <button
              onClick={() => onVote(project.id, false)}
              className="flex-1 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-red-500/30 transition-colors"
            >
              <ThumbsDown size={14} /> Vote Against
            </button>
          </div>
        )}

        {hasVoted && (
          <div className="flex items-center justify-center gap-2 py-2 bg-slate-800 rounded-lg text-xs text-slate-400">
            <CheckCircle size={14} className="text-emerald-500" />
            You have voted on this proposal
          </div>
        )}
      </div>
    </div>
  );
}
