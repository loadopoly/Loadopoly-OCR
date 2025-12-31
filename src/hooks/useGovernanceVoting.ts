/**
 * useGovernanceVoting Hook
 * 
 * React hook for DAO governance and project voting.
 */

import { useState, useEffect, useCallback } from 'react';
import { communityFundService, shardMarketService } from '../services/gard';
import { SocialReturnProject, GovernanceVote } from '../types';

interface UseGovernanceVotingReturn {
  projects: SocialReturnProject[];
  activeProjects: SocialReturnProject[];
  userVotingWeight: number;
  isLoading: boolean;
  error: string | null;
  submitProposal: (
    title: string,
    description: string,
    requestedAmount: number,
    communityId?: string
  ) => Promise<SocialReturnProject | null>;
  castVote: (projectId: string, voteFor: boolean) => Promise<boolean>;
  hasVoted: (projectId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useGovernanceVoting(userId: string | null): UseGovernanceVotingReturn {
  const [projects, setProjects] = useState<SocialReturnProject[]>([]);
  const [userVotingWeight, setUserVotingWeight] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [allProjects, votingWeight] = await Promise.all([
        communityFundService.getProjects(),
        userId ? shardMarketService.getUserVotingWeight(userId) : Promise.resolve(0),
      ]);

      setProjects(allProjects);
      setUserVotingWeight(votingWeight);
    } catch (err) {
      console.error('Error fetching governance data:', err);
      setError('Failed to load governance data');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeProjects = projects.filter(
    p => p.status === 'VOTING' || p.status === 'PROPOSED'
  );

  const submitProposal = useCallback(async (
    title: string,
    description: string,
    requestedAmount: number,
    communityId?: string
  ): Promise<SocialReturnProject | null> => {
    if (!userId) {
      setError('Must be logged in to submit proposals');
      return null;
    }

    try {
      const project = await communityFundService.submitProposal(
        title,
        description,
        requestedAmount,
        userId,
        communityId
      );

      if (project) {
        setProjects(prev => [project, ...prev]);
      }

      return project;
    } catch (err) {
      console.error('Error submitting proposal:', err);
      setError('Failed to submit proposal');
      return null;
    }
  }, [userId]);

  const castVote = useCallback(async (
    projectId: string,
    voteFor: boolean
  ): Promise<boolean> => {
    if (!userId) {
      setError('Must be logged in to vote');
      return false;
    }

    try {
      const success = await communityFundService.castVote(
        projectId,
        userId,
        voteFor
      );

      if (success) {
        // Refresh projects to get updated vote counts
        await fetchData();
      }

      return success;
    } catch (err) {
      console.error('Error casting vote:', err);
      setError('Failed to cast vote');
      return false;
    }
  }, [userId, userVotingWeight, fetchData]);

  const hasVoted = useCallback(async (projectId: string): Promise<boolean> => {
    if (!userId) return false;
    return communityFundService.hasUserVoted(projectId, userId);
  }, [userId]);

  return {
    projects,
    activeProjects,
    userVotingWeight,
    isLoading,
    error,
    submitProposal,
    castVote,
    hasVoted,
    refresh: fetchData,
  };
}

export default useGovernanceVoting;
