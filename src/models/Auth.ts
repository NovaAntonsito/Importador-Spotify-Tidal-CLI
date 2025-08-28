export interface Credentials {
  tidalClientId: string;
  tidalClientSecret: string;
  spotifyClientId: string;
  spotifyClientSecret: string;
}

export interface AuthTokens {
  spotifyToken?: string;
  spotifyRefreshToken?: string;
  tidalToken?: string;
  tidalRefreshToken?: string;
  expiresAt?: Date;
}