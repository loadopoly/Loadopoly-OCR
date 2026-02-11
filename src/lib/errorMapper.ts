/**
 * Error Mapper - Converts database and auth errors to user-friendly messages
 * 
 * This utility provides defensive error handling to prevent generic "Database error"
 * messages from stalling users. Maps specific Postgres/Supabase error codes to
 * actionable, user-friendly strings.
 */

interface DatabaseError extends Error {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
}

/**
 * Formats authentication and database errors into user-friendly messages
 * @param error - The error object from Supabase/Postgres
 * @returns A user-friendly error message
 */
export function formatAuthError(error: DatabaseError | Error | unknown): string {
  // Handle null/undefined
  if (!error) {
    return 'An unexpected error occurred. Please try again.';
  }

  // Cast to get access to code property
  const err = error as DatabaseError;

  // Log the full error for debugging (includes Postgres code)
  console.error('[ErrorMapper] Full error context:', {
    message: err.message,
    code: err.code,
    details: err.details,
    hint: err.hint,
    stack: err.stack
  });

  // Postgres/Supabase error codes
  const errorCode = err.code;

  switch (errorCode) {
    // ============================================
    // UNIQUE VIOLATIONS (23xxx)
    // ============================================
    case '23505': // unique_violation
      if (err.message?.includes('email')) {
        return 'This email is already registered. Please sign in instead or use a different email.';
      }
      if (err.message?.includes('user_avatars')) {
        return 'Your profile already exists. Please refresh your browser and try signing in.';
      }
      return 'This information is already registered in our system. Please check your input.';

    case '23503': // foreign_key_violation
      return 'Unable to link your profile data. Please refresh your browser and try again.';

    case '23502': // not_null_violation
      return 'Some required information is missing. Please refresh and try again.';

    // ============================================
    // PERMISSION/POLICY ERRORS (42xxx)
    // ============================================
    case '42501': // insufficient_privilege
      return 'Permission denied. Please refresh your browser to restore your session.';

    case '42P01': // undefined_table
      return 'System configuration issue detected. Please contact support with error code: TABLE_MISSING';

    // ============================================
    // TRIGGER EXCEPTIONS (P0001)
    // ============================================
    case 'P0001': // raise_exception (custom trigger errors)
      if (err.message?.includes('avatar')) {
        return 'Profile setup encountered an issue, but your account was created. Your profile will be repaired on next login.';
      }
      return 'A system rule was triggered. Please try again or contact support if this persists.';

    // ============================================
    // SUPABASE AUTH ERRORS
    // ============================================
    case 'invalid_grant':
      return 'Invalid login credentials. Please check your email and password.';

    case 'email_not_confirmed':
      return 'Please verify your email address. Check your inbox for a confirmation link.';

    case 'user_already_exists':
      return 'An account with this email already exists. Please sign in instead.';

    case 'weak_password':
      return 'Password is too weak. Please use at least 8 characters with a mix of letters and numbers.';

    case 'over_email_send_rate_limit':
      return 'Too many requests. Please wait a few minutes before trying again.';

    // ============================================
    // CONNECTION/TIMEOUT ERRORS
    // ============================================
    case '08000': // connection_exception
    case '08003': // connection_does_not_exist
    case '08006': // connection_failure
      return 'Unable to connect to the server. Please check your internet connection and try again.';

    case '57014': // query_canceled
      return 'The request took too long and was cancelled. Please try again with a simpler query.';

    // ============================================
    // DEFAULT HANDLING
    // ============================================
    default:
      // Check for common error message patterns
      if (err.message?.toLowerCase().includes('network')) {
        return 'Network error. Please check your connection and try again.';
      }
      
      if (err.message?.toLowerCase().includes('timeout')) {
        return 'The request timed out. Please try again.';
      }

      if (err.message?.toLowerCase().includes('jwt')) {
        return 'Your session has expired. Please sign in again.';
      }

      // If we have a user-facing message from Supabase, use it
      if (err.message && !err.message.includes('null') && err.message.length < 200) {
        return err.message;
      }

      // Last resort fallback
      return 'An unexpected error occurred. Please try again or contact support if this persists.';
  }
}

/**
 * Checks if an error is a non-blocking error that should allow the user to continue
 * @param error - The error object
 * @returns true if the error is non-blocking
 */
export function isNonBlockingError(error: DatabaseError | Error | unknown): boolean {
  const err = error as DatabaseError;
  
  // Avatar initialization failures are non-blocking
  if (err.code === 'P0001' && err.message?.includes('avatar')) {
    return true;
  }

  // Profile trigger failures are non-blocking
  if (err.message?.toLowerCase().includes('trigger') && err.message?.toLowerCase().includes('avatar')) {
    return true;
  }

  return false;
}

/**
 * Extracts a short error code for display or logging
 * @param error - The error object
 * @returns A short error code string
 */
export function getErrorCode(error: DatabaseError | Error | unknown): string {
  const err = error as DatabaseError;
  return err.code || 'UNKNOWN';
}
