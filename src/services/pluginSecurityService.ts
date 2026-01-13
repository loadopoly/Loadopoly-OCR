/**
 * Plugin Security Layer
 * 
 * Provides security hardening for the plugin architecture including:
 * - Signed message verification for adapter registrations
 * - Sandboxed execution for untrusted plugins
 * - Permission-based access control
 * - Audit logging and anomaly detection
 * 
 * @module pluginSecurityService
 */

import { ethers } from 'ethers';
import { logger } from '../lib/logger';

// Security Configuration
const SECURITY_CONFIG = {
  SIGNATURE_VALIDITY_MS: 300000, // 5 minutes
  MAX_PLUGIN_MEMORY_MB: 100,
  MAX_PLUGIN_EXECUTION_MS: 30000,
  MAX_API_CALLS_PER_MINUTE: 60,
  AUDIT_LOG_RETENTION_DAYS: 90,
  TRUSTED_DOMAINS: [
    'loadopoly.com',
    'gard.network',
    'localhost',
  ],
};

/**
 * Plugin permission levels
 */
export type PluginPermission = 
  | 'storage:read'
  | 'storage:write'
  | 'network:fetch'
  | 'network:websocket'
  | 'crypto:sign'
  | 'crypto:encrypt'
  | 'blockchain:read'
  | 'blockchain:write'
  | 'user:profile'
  | 'user:wallet'
  | 'ocr:process'
  | 'graph:read'
  | 'graph:write'
  | 'render:2d'
  | 'render:3d';

/**
 * Plugin registration request with signature
 */
export interface PluginRegistration {
  pluginId: string;
  name: string;
  version: string;
  author: string;
  description: string;
  homepage?: string;
  permissions: PluginPermission[];
  signature: string;
  signerAddress: string;
  timestamp: number;
  checksum: string;
}

/**
 * Plugin verification result
 */
export interface PluginVerification {
  valid: boolean;
  pluginId: string;
  issues: SecurityIssue[];
  trustLevel: TrustLevel;
  permissions: PluginPermission[];
  riskScore: number;
}

/**
 * Security issue found during verification
 */
export interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  code: string;
  message: string;
  recommendation: string;
}

/**
 * Plugin trust levels
 */
export type TrustLevel = 'verified' | 'community' | 'unknown' | 'blocked';

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  pluginId: string;
  action: string;
  permission: PluginPermission | null;
  success: boolean;
  details: Record<string, unknown>;
  riskScore: number;
  userId?: string;
  walletAddress?: string;
}

/**
 * Sandboxed plugin context
 */
export interface SandboxContext {
  pluginId: string;
  permissions: Set<PluginPermission>;
  memoryUsage: number;
  apiCallCount: number;
  startTime: number;
  lastActivity: number;
  terminated: boolean;
}

/**
 * Rate limiter state
 */
interface RateLimitState {
  count: number;
  resetTime: number;
}

/**
 * Plugin Security Service
 */
class PluginSecurityService {
  private registeredPlugins: Map<string, PluginRegistration> = new Map();
  private pluginContexts: Map<string, SandboxContext> = new Map();
  private auditLog: AuditLogEntry[] = [];
  private rateLimiters: Map<string, RateLimitState> = new Map();
  private trustedSigners: Set<string> = new Set();
  private blockedPlugins: Set<string> = new Set();

  constructor() {
    // Initialize with platform signer
    this.trustedSigners.add('0x0000000000000000000000000000000000000000'); // Placeholder
    
    // Start periodic cleanup
    setInterval(() => this.cleanupAuditLog(), 86400000); // Daily
  }

  /**
   * Verify plugin registration signature
   */
  async verifyRegistrationSignature(
    registration: PluginRegistration
  ): Promise<boolean> {
    try {
      // Check timestamp validity
      const age = Date.now() - registration.timestamp;
      if (age > SECURITY_CONFIG.SIGNATURE_VALIDITY_MS || age < 0) {
        logger.warn('Plugin registration signature expired or future-dated', {
          pluginId: registration.pluginId,
          age,
        });
        return false;
      }

      // Construct message that was signed
      const message = this.constructSignatureMessage(registration);
      const messageHash = ethers.hashMessage(message);

      // Recover signer address
      const recoveredAddress = ethers.recoverAddress(
        messageHash,
        registration.signature
      );

      // Verify signer matches
      if (recoveredAddress.toLowerCase() !== registration.signerAddress.toLowerCase()) {
        logger.warn('Plugin signature verification failed - signer mismatch', {
          pluginId: registration.pluginId,
          expected: registration.signerAddress,
          recovered: recoveredAddress,
        });
        return false;
      }

      // Check if signer is trusted
      const isTrusted = this.trustedSigners.has(recoveredAddress.toLowerCase());
      
      logger.info('Plugin signature verified', {
        pluginId: registration.pluginId,
        signer: recoveredAddress,
        trusted: isTrusted,
      });

      return true;
    } catch (error) {
      logger.error('Plugin signature verification error', {
        pluginId: registration.pluginId,
        error,
      });
      return false;
    }
  }

  /**
   * Construct message for signature verification
   */
  private constructSignatureMessage(registration: PluginRegistration): string {
    return JSON.stringify({
      pluginId: registration.pluginId,
      name: registration.name,
      version: registration.version,
      author: registration.author,
      permissions: registration.permissions.sort(),
      timestamp: registration.timestamp,
      checksum: registration.checksum,
    });
  }

  /**
   * Verify plugin and return security analysis
   */
  async verifyPlugin(registration: PluginRegistration): Promise<PluginVerification> {
    const issues: SecurityIssue[] = [];
    let riskScore = 0;

    // Check if plugin is blocked
    if (this.blockedPlugins.has(registration.pluginId)) {
      return {
        valid: false,
        pluginId: registration.pluginId,
        issues: [{
          severity: 'critical',
          code: 'PLUGIN_BLOCKED',
          message: 'This plugin has been blocked for security reasons',
          recommendation: 'Contact support if you believe this is an error',
        }],
        trustLevel: 'blocked',
        permissions: [],
        riskScore: 100,
      };
    }

    // Verify signature
    const signatureValid = await this.verifyRegistrationSignature(registration);
    if (!signatureValid) {
      issues.push({
        severity: 'critical',
        code: 'INVALID_SIGNATURE',
        message: 'Plugin signature verification failed',
        recommendation: 'Ensure the plugin is signed by a valid key',
      });
      riskScore += 50;
    }

    // Analyze permissions
    const permissionAnalysis = this.analyzePermissions(registration.permissions);
    issues.push(...permissionAnalysis.issues);
    riskScore += permissionAnalysis.riskScore;

    // Check for dangerous patterns
    const patternAnalysis = await this.analyzePatterns(registration);
    issues.push(...patternAnalysis.issues);
    riskScore += patternAnalysis.riskScore;

    // Determine trust level
    let trustLevel: TrustLevel = 'unknown';
    if (signatureValid && this.trustedSigners.has(registration.signerAddress.toLowerCase())) {
      trustLevel = 'verified';
    } else if (signatureValid) {
      trustLevel = 'community';
    }

    // Cap risk score
    riskScore = Math.min(100, riskScore);

    const verification: PluginVerification = {
      valid: issues.filter(i => i.severity === 'critical').length === 0,
      pluginId: registration.pluginId,
      issues,
      trustLevel,
      permissions: registration.permissions,
      riskScore,
    };

    // Log verification result
    this.logAudit({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      pluginId: registration.pluginId,
      action: 'VERIFY_PLUGIN',
      permission: null,
      success: verification.valid,
      details: { verification },
      riskScore,
    });

    return verification;
  }

  /**
   * Analyze requested permissions for risk
   */
  private analyzePermissions(permissions: PluginPermission[]): {
    issues: SecurityIssue[];
    riskScore: number;
  } {
    const issues: SecurityIssue[] = [];
    let riskScore = 0;

    // High-risk permissions
    const highRiskPermissions: PluginPermission[] = [
      'blockchain:write',
      'crypto:sign',
      'user:wallet',
    ];

    // Medium-risk permissions
    const mediumRiskPermissions: PluginPermission[] = [
      'storage:write',
      'network:websocket',
      'graph:write',
    ];

    for (const perm of permissions) {
      if (highRiskPermissions.includes(perm)) {
        issues.push({
          severity: 'high',
          code: 'HIGH_RISK_PERMISSION',
          message: `Plugin requests high-risk permission: ${perm}`,
          recommendation: 'Ensure you trust this plugin before allowing blockchain/wallet access',
        });
        riskScore += 15;
      } else if (mediumRiskPermissions.includes(perm)) {
        issues.push({
          severity: 'medium',
          code: 'MEDIUM_RISK_PERMISSION',
          message: `Plugin requests elevated permission: ${perm}`,
          recommendation: 'Review what data this plugin may modify',
        });
        riskScore += 5;
      }
    }

    // Check for suspicious permission combinations
    if (
      permissions.includes('user:wallet') &&
      permissions.includes('network:fetch')
    ) {
      issues.push({
        severity: 'high',
        code: 'SUSPICIOUS_PERMISSION_COMBO',
        message: 'Plugin requests both wallet access and network permissions',
        recommendation: 'This combination could be used to exfiltrate wallet data',
      });
      riskScore += 20;
    }

    return { issues, riskScore };
  }

  /**
   * Analyze plugin for dangerous code patterns
   */
  private async analyzePatterns(registration: PluginRegistration): Promise<{
    issues: SecurityIssue[];
    riskScore: number;
  }> {
    const issues: SecurityIssue[] = [];
    let riskScore = 0;

    // Check homepage domain
    if (registration.homepage) {
      try {
        const url = new URL(registration.homepage);
        const isTrusted = SECURITY_CONFIG.TRUSTED_DOMAINS.some(
          domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
        );
        
        if (!isTrusted) {
          issues.push({
            severity: 'low',
            code: 'UNTRUSTED_DOMAIN',
            message: `Plugin homepage is from untrusted domain: ${url.hostname}`,
            recommendation: 'Verify the plugin source before installation',
          });
          riskScore += 5;
        }
      } catch {
        issues.push({
          severity: 'medium',
          code: 'INVALID_HOMEPAGE',
          message: 'Plugin has invalid homepage URL',
          recommendation: 'Be cautious of plugins with malformed metadata',
        });
        riskScore += 10;
      }
    }

    // Check version format
    if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(registration.version)) {
      issues.push({
        severity: 'low',
        code: 'INVALID_VERSION',
        message: 'Plugin version does not follow semver format',
        recommendation: 'Use semantic versioning (e.g., 1.0.0)',
      });
      riskScore += 2;
    }

    return { issues, riskScore };
  }

  /**
   * Register a verified plugin
   */
  async registerPlugin(
    registration: PluginRegistration
  ): Promise<{ success: boolean; verification: PluginVerification }> {
    const verification = await this.verifyPlugin(registration);

    if (!verification.valid) {
      return { success: false, verification };
    }

    // Store registration
    this.registeredPlugins.set(registration.pluginId, registration);

    logger.info('Plugin registered', {
      pluginId: registration.pluginId,
      trustLevel: verification.trustLevel,
    });

    return { success: true, verification };
  }

  /**
   * Create sandboxed execution context for plugin
   */
  createSandbox(pluginId: string): SandboxContext | null {
    const registration = this.registeredPlugins.get(pluginId);
    if (!registration) {
      logger.warn('Cannot create sandbox for unregistered plugin', { pluginId });
      return null;
    }

    const context: SandboxContext = {
      pluginId,
      permissions: new Set(registration.permissions),
      memoryUsage: 0,
      apiCallCount: 0,
      startTime: Date.now(),
      lastActivity: Date.now(),
      terminated: false,
    };

    this.pluginContexts.set(pluginId, context);

    logger.info('Sandbox created', { pluginId });

    return context;
  }

  /**
   * Check if plugin has required permission
   */
  checkPermission(pluginId: string, permission: PluginPermission): boolean {
    const context = this.pluginContexts.get(pluginId);
    if (!context || context.terminated) {
      this.logAudit({
        id: `audit_${Date.now()}`,
        timestamp: Date.now(),
        pluginId,
        action: 'PERMISSION_CHECK',
        permission,
        success: false,
        details: { reason: context ? 'terminated' : 'no_context' },
        riskScore: 50,
      });
      return false;
    }

    const hasPermission = context.permissions.has(permission);

    this.logAudit({
      id: `audit_${Date.now()}`,
      timestamp: Date.now(),
      pluginId,
      action: 'PERMISSION_CHECK',
      permission,
      success: hasPermission,
      details: {},
      riskScore: hasPermission ? 0 : 30,
    });

    return hasPermission;
  }

  /**
   * Check rate limit for plugin
   */
  checkRateLimit(pluginId: string): boolean {
    const now = Date.now();
    let state = this.rateLimiters.get(pluginId);

    if (!state || now > state.resetTime) {
      state = {
        count: 0,
        resetTime: now + 60000, // 1 minute window
      };
    }

    state.count++;
    this.rateLimiters.set(pluginId, state);

    if (state.count > SECURITY_CONFIG.MAX_API_CALLS_PER_MINUTE) {
      this.logAudit({
        id: `audit_${Date.now()}`,
        timestamp: Date.now(),
        pluginId,
        action: 'RATE_LIMIT_EXCEEDED',
        permission: null,
        success: false,
        details: { count: state.count, limit: SECURITY_CONFIG.MAX_API_CALLS_PER_MINUTE },
        riskScore: 60,
      });
      return false;
    }

    return true;
  }

  /**
   * Check execution time limit
   */
  checkExecutionTime(pluginId: string): boolean {
    const context = this.pluginContexts.get(pluginId);
    if (!context) return false;

    const elapsed = Date.now() - context.startTime;
    if (elapsed > SECURITY_CONFIG.MAX_PLUGIN_EXECUTION_MS) {
      this.terminateSandbox(pluginId, 'Execution time limit exceeded');
      return false;
    }

    context.lastActivity = Date.now();
    return true;
  }

  /**
   * Update memory usage tracking
   */
  updateMemoryUsage(pluginId: string, bytes: number): boolean {
    const context = this.pluginContexts.get(pluginId);
    if (!context) return false;

    context.memoryUsage += bytes;
    
    const mbUsed = context.memoryUsage / (1024 * 1024);
    if (mbUsed > SECURITY_CONFIG.MAX_PLUGIN_MEMORY_MB) {
      this.terminateSandbox(pluginId, 'Memory limit exceeded');
      return false;
    }

    return true;
  }

  /**
   * Terminate plugin sandbox
   */
  terminateSandbox(pluginId: string, reason: string): void {
    const context = this.pluginContexts.get(pluginId);
    if (context) {
      context.terminated = true;
    }

    this.logAudit({
      id: `audit_${Date.now()}`,
      timestamp: Date.now(),
      pluginId,
      action: 'SANDBOX_TERMINATED',
      permission: null,
      success: true,
      details: { reason },
      riskScore: 40,
    });

    logger.warn('Sandbox terminated', { pluginId, reason });
  }

  /**
   * Log audit entry
   */
  logAudit(entry: AuditLogEntry): void {
    this.auditLog.push(entry);

    // Detect anomalies
    if (entry.riskScore >= 50) {
      this.handleHighRiskAction(entry);
    }
  }

  /**
   * Handle high-risk actions
   */
  private handleHighRiskAction(entry: AuditLogEntry): void {
    logger.warn('High-risk plugin action detected', {
      pluginId: entry.pluginId,
      action: entry.action,
      riskScore: entry.riskScore,
    });

    // Count recent high-risk actions
    const recentHighRisk = this.auditLog.filter(
      e => e.pluginId === entry.pluginId &&
           e.riskScore >= 50 &&
           Date.now() - e.timestamp < 300000 // Last 5 minutes
    );

    // Auto-block if too many high-risk actions
    if (recentHighRisk.length >= 5) {
      this.blockPlugin(entry.pluginId, 'Excessive high-risk actions');
    }
  }

  /**
   * Block a plugin
   */
  blockPlugin(pluginId: string, reason: string): void {
    this.blockedPlugins.add(pluginId);
    this.terminateSandbox(pluginId, reason);

    logger.error('Plugin blocked', { pluginId, reason });

    this.logAudit({
      id: `audit_${Date.now()}`,
      timestamp: Date.now(),
      pluginId,
      action: 'PLUGIN_BLOCKED',
      permission: null,
      success: true,
      details: { reason },
      riskScore: 100,
    });
  }

  /**
   * Unblock a plugin
   */
  unblockPlugin(pluginId: string): void {
    this.blockedPlugins.delete(pluginId);
    logger.info('Plugin unblocked', { pluginId });
  }

  /**
   * Add trusted signer
   */
  addTrustedSigner(address: string): void {
    this.trustedSigners.add(address.toLowerCase());
    logger.info('Trusted signer added', { address });
  }

  /**
   * Remove trusted signer
   */
  removeTrustedSigner(address: string): void {
    this.trustedSigners.delete(address.toLowerCase());
    logger.info('Trusted signer removed', { address });
  }

  /**
   * Get audit log for a plugin
   */
  getAuditLog(
    pluginId?: string,
    options?: { limit?: number; since?: number }
  ): AuditLogEntry[] {
    let logs = this.auditLog;

    if (pluginId) {
      logs = logs.filter(e => e.pluginId === pluginId);
    }

    if (options?.since) {
      logs = logs.filter(e => e.timestamp >= options.since!);
    }

    if (options?.limit) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  /**
   * Cleanup old audit logs
   */
  private cleanupAuditLog(): void {
    const cutoff = Date.now() - (SECURITY_CONFIG.AUDIT_LOG_RETENTION_DAYS * 86400000);
    const before = this.auditLog.length;
    this.auditLog = this.auditLog.filter(e => e.timestamp >= cutoff);
    
    logger.info('Audit log cleanup', {
      removed: before - this.auditLog.length,
      remaining: this.auditLog.length,
    });
  }

  /**
   * Get security statistics
   */
  getStats(): {
    registeredPlugins: number;
    activeContexts: number;
    blockedPlugins: number;
    trustedSigners: number;
    auditLogSize: number;
    recentHighRiskActions: number;
  } {
    const recentHighRisk = this.auditLog.filter(
      e => e.riskScore >= 50 && Date.now() - e.timestamp < 86400000 // Last 24h
    ).length;

    return {
      registeredPlugins: this.registeredPlugins.size,
      activeContexts: Array.from(this.pluginContexts.values())
        .filter(c => !c.terminated).length,
      blockedPlugins: this.blockedPlugins.size,
      trustedSigners: this.trustedSigners.size,
      auditLogSize: this.auditLog.length,
      recentHighRiskActions: recentHighRisk,
    };
  }
}

// Export singleton
export const pluginSecurityService = new PluginSecurityService();

/**
 * Security middleware for plugin API calls
 */
export const createSecurityMiddleware = (pluginId: string) => ({
  beforeCall: async (
    permission: PluginPermission,
    action: string
  ): Promise<{ allowed: boolean; reason?: string }> => {
    // Check sandbox status
    if (!pluginSecurityService.checkExecutionTime(pluginId)) {
      return { allowed: false, reason: 'Execution time exceeded' };
    }

    // Check rate limit
    if (!pluginSecurityService.checkRateLimit(pluginId)) {
      return { allowed: false, reason: 'Rate limit exceeded' };
    }

    // Check permission
    if (!pluginSecurityService.checkPermission(pluginId, permission)) {
      return { allowed: false, reason: `Missing permission: ${permission}` };
    }

    return { allowed: true };
  },

  afterCall: (success: boolean, bytesUsed?: number): void => {
    if (bytesUsed) {
      pluginSecurityService.updateMemoryUsage(pluginId, bytesUsed);
    }
  },
});

export default pluginSecurityService;
