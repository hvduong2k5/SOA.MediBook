export interface TokenPairState {
  accessToken: string;
  refreshToken: string;
}

type SessionExpiredListener = () => void;

/**
 * In-memory token store.
 * Security rule: NEVER persist access/refresh tokens or PII in localStorage/sessionStorage.
 */
let currentTokens: TokenPairState | null = null;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

export const tokenStore = {
  getAccessToken(): string | null {
    return currentTokens?.accessToken ?? null;
  },

  getRefreshToken(): string | null {
    return currentTokens?.refreshToken ?? null;
  },

  setTokens(tokens: TokenPairState): void {
    currentTokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  },

  clear(): void {
    currentTokens = null;
  },

  onSessionExpired(listener: SessionExpiredListener): () => void {
    sessionExpiredListeners.add(listener);
    return () => {
      sessionExpiredListeners.delete(listener);
    };
  },

  notifySessionExpired(): void {
    currentTokens = null;
    for (const listener of sessionExpiredListeners) {
      listener();
    }
  },
};
