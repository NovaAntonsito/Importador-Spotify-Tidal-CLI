export interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  tracks: { total: number };
  owner: { id: string };
}

export interface SpotifyArtist {
  id: string;
  name: string;
  external_urls: {
    spotify: string;
  };
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  release_date?: string;
  external_urls: {
    spotify: string;
  };
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration_ms: number;
  external_ids?: {
    isrc?: string;
  };
  explicit: boolean;
  popularity: number;
}

export interface SpotifyPlaylistTracksResponse {
  items: {
    track: SpotifyTrack;
    added_at: string;
  }[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
}

export interface SpotifyPlaylistsResponse {
  items: SpotifyPlaylist[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
}