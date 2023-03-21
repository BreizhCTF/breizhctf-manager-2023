/**
 * Port to listen on
 */
export const PORT = parseInt(process.env.PORT || '3000');

/**
 * Host to listen on
 */
export const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

/**
 * Namespace to deploy isolated challenges
 */
export const NAMESPACE = process.env.KUBECTF_NAMESPACE || 'main';

export const CHALLENGE_EXPIRES = parseInt(process.env.KUBECTF_CHALLENGE_EXPIRES || '3600');

/**
 * Base domain name for http challenges
 */
export const BASE_DOMAIN = process.env.KUBECTF_BASE_DOMAIN || 'example.com';

/**
 * @deprecated
 */
export const API_DOMAIN = process.env.KUBECTF_API_DOMAIN || `challenge-manager.${BASE_DOMAIN}`;

/**
 * Max deployment per owner (team or user)
 */
export const MAX_OWNER_DEPLOYMENTS = parseInt(process.env.KUBECTF_MAX_OWNER_DEPLOYMENTS ?? '0') || 2;

/**
 * Shared secret with CTFd plugin
 */
export const AUTH_SECRET = process.env.KUBECTF_AUTH_SECRET || 'keyboard-cat';

/**
 * Secret used to generate random hosts
 */
export const CONTAINER_SECRET =	process.env.KUBECTF_CONTAINER_SECRET || 'keyboard-cat';
