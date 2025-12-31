/**
 * GARD Community Fund Service
 * 
 * Manages community fund operations, social return projects,
 * and DAO governance voting.
 */

import { supabase } from '../../lib/supabaseClient';
import { 
  CommunityFund, 
  SocialReturnProject, 
  GovernanceVote,
  GARD_CONFIG 
} from '../../types';

export class CommunityFundService {

  /**
   * Get community fund balance and stats
   */
  async getFundBalance(communityId?: string): Promise<CommunityFund | null> {
    if (!supabase) return null;
    
    let query = supabase
      .from('community_fund')
      .select('*');
    
    if (communityId) {
      query = query.eq('COMMUNITY_ID', communityId);
    }
    
    const { data, error } = await query.single() as { data: any | null; error: any };
    
    if (error || !data) {
      console.error('Error fetching fund balance:', error);
      return null;
    }
    
    return {
      id: data.ID,
      communityId: data.COMMUNITY_ID,
      balance: parseFloat(data.BALANCE),
      totalContributed: parseFloat(data.TOTAL_CONTRIBUTED),
      totalWithdrawn: parseFloat(data.TOTAL_WITHDRAWN),
    };
  }

  /**
   * Get all social return projects
   */
  async getProjects(status?: string, communityId?: string): Promise<SocialReturnProject[]> {
    if (!supabase) return [];
    
    let query = supabase
      .from('social_return_projects')
      .select('*')
      .order('CREATED_AT', { ascending: false });
    
    if (status) {
      query = query.eq('STATUS', status);
    }
    
    if (communityId) {
      query = query.eq('COMMUNITY_ID', communityId);
    }
    
    const { data, error } = await query as { data: any[] | null; error: any };
    
    if (error || !data) {
      console.error('Error fetching projects:', error);
      return [];
    }
    
    return data.map((p: any) => ({
      id: p.ID,
      title: p.TITLE,
      description: p.DESCRIPTION,
      requestedAmount: parseFloat(p.REQUESTED_AMOUNT),
      approvedAmount: p.APPROVED_AMOUNT ? parseFloat(p.APPROVED_AMOUNT) : undefined,
      status: p.STATUS,
      votesFor: p.VOTES_FOR,
      votesAgainst: p.VOTES_AGAINST,
      votingDeadline: p.VOTING_DEADLINE,
      proposerId: p.PROPOSER_ID,
      communityId: p.COMMUNITY_ID,
      createdAt: p.CREATED_AT,
      fundedAt: p.FUNDED_AT,
      completedAt: p.COMPLETED_AT,
    }));
  }

  /**
   * Submit a new project proposal
   */
  async submitProposal(
    title: string,
    description: string,
    requestedAmount: number,
    proposerId: string,
    communityId?: string,
    votingDays: number = 7
  ): Promise<SocialReturnProject | null> {
    if (!supabase) return null;
    
    const votingDeadline = new Date();
    votingDeadline.setDate(votingDeadline.getDate() + votingDays);
    
    const { data, error } = await supabase
      .from('social_return_projects')
      .insert({
        TITLE: title,
        DESCRIPTION: description,
        REQUESTED_AMOUNT: requestedAmount,
        STATUS: 'VOTING',
        PROPOSER_ID: proposerId,
        COMMUNITY_ID: communityId,
        VOTING_DEADLINE: votingDeadline.toISOString(),
      } as any)
      .select()
      .single() as { data: any | null; error: any };
    
    if (error || !data) {
      console.error('Error submitting proposal:', error);
      return null;
    }
    
    return {
      id: data.ID,
      title: data.TITLE,
      description: data.DESCRIPTION,
      requestedAmount: parseFloat(data.REQUESTED_AMOUNT),
      status: data.STATUS,
      votesFor: 0,
      votesAgainst: 0,
      votingDeadline: data.VOTING_DEADLINE,
      proposerId: data.PROPOSER_ID,
      communityId: data.COMMUNITY_ID,
      createdAt: data.CREATED_AT,
    };
  }

  /**
   * Cast a vote on a project
   */
  async castVote(
    projectId: string,
    voterId: string,
    voteDirection: boolean
  ): Promise<boolean> {
    if (!supabase) return false;
    
    const { error } = await (supabase as any).rpc('cast_governance_vote', {
      p_project_id: projectId,
      p_voter_id: voterId,
      p_vote_direction: voteDirection,
    });
    
    if (error) {
      console.error('Error casting vote:', error);
      return false;
    }
    
    return true;
  }
  /**
   * Get votes for a project
   */
  async getProjectVotes(projectId: string): Promise<GovernanceVote[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('governance_votes')
      .select('*')
      .eq('PROJECT_ID', projectId)
      .order('VOTED_AT', { ascending: false }) as { data: any[] | null; error: any };
    
    if (error || !data) {
      console.error('Error fetching votes:', error);
      return [];
    }
    
    return data.map((v: any) => ({
      id: v.ID,
      projectId: v.PROJECT_ID,
      voterId: v.VOTER_ID,
      voteWeight: parseFloat(v.VOTE_WEIGHT),
      voteDirection: v.VOTE_DIRECTION,
      votedAt: v.VOTED_AT,
    }));
  }

  /**
   * Check if user has voted on a project
   */
  async hasUserVoted(projectId: string, userId: string): Promise<boolean> {
    if (!supabase) return false;
    
    const { data, error } = await supabase
      .from('governance_votes')
      .select('ID')
      .eq('PROJECT_ID', projectId)
      .eq('VOTER_ID', userId)
      .single() as { data: any | null; error: any };
    
    return !!data && !error;
  }

  /**
   * Update project status
   */
  async updateProjectStatus(
    projectId: string, 
    newStatus: 'VOTING' | 'APPROVED' | 'REJECTED' | 'FUNDED' | 'COMPLETED'
  ): Promise<boolean> {
    if (!supabase) return false;
    
    const { error } = await (supabase
      .from('social_return_projects') as any)
      .update({ STATUS: newStatus })
      .eq('ID', projectId);
    
    return !error;
  }

  /**
   * Get a single project
   */
  async getProject(projectId: string): Promise<SocialReturnProject | null> {
    if (!supabase) return null;
    
    const { data, error } = await supabase
      .from('social_return_projects')
      .select('*')
      .eq('ID', projectId)
      .single() as { data: any | null; error: any };
    
    if (error || !data) {
      console.error('Error fetching project:', error);
      return null;
    }
    
    return {
      id: data.ID,
      title: data.TITLE,
      description: data.DESCRIPTION,
      requestedAmount: parseFloat(data.REQUESTED_AMOUNT),
      approvedAmount: data.APPROVED_AMOUNT ? parseFloat(data.APPROVED_AMOUNT) : undefined,
      status: data.STATUS,
      votesFor: data.VOTES_FOR,
      votesAgainst: data.VOTES_AGAINST,
      votingDeadline: data.VOTING_DEADLINE,
      proposerId: data.PROPOSER_ID,
      communityId: data.COMMUNITY_ID,
      createdAt: data.CREATED_AT,
      fundedAt: data.FUNDED_AT,
      completedAt: data.COMPLETED_AT,
    };
  }

  /**
   * Fund an approved project
   */
  async fundProject(projectId: string, amount: number): Promise<boolean> {
    if (!supabase) return false;
    
    // Get fund balance
    const fund = await this.getFundBalance();
    if (!fund || fund.balance < amount) {
      console.error('Insufficient fund balance');
      return false;
    }
    
    // Update project
    const { error: projectError } = await (supabase
      .from('social_return_projects') as any)
      .update({
        STATUS: 'FUNDED',
        APPROVED_AMOUNT: amount,
        FUNDED_AT: new Date().toISOString(),
      })
      .eq('ID', projectId);
    
    if (projectError) {
      console.error('Error funding project:', projectError);
      return false;
    }
    
    // Update fund balance
    const { error: fundError } = await (supabase
      .from('community_fund') as any)
      .update({
        BALANCE: fund.balance - amount,
        TOTAL_WITHDRAWN: fund.totalWithdrawn + amount,
        LAST_WITHDRAWAL_AT: new Date().toISOString(),
      })
      .eq('ID', fund.id);
    
    return !fundError;
  }

  /**
   * Get voting statistics
   */
  async getVotingStats(): Promise<{
    totalProjects: number;
    activeVoting: number;
    fundedProjects: number;
    totalFunded: number;
  }> {
    const projects = await this.getProjects();
    
    return {
      totalProjects: projects.length,
      activeVoting: projects.filter(p => p.status === 'VOTING').length,
      fundedProjects: projects.filter(p => p.status === 'FUNDED' || p.status === 'COMPLETED').length,
      totalFunded: projects
        .filter(p => p.approvedAmount)
        .reduce((sum, p) => sum + (p.approvedAmount || 0), 0),
    };
  }
}

export const communityFundService = new CommunityFundService();
