export interface TidalArtist {
  id: number;
  name: string;
  type: string;
}

export interface TidalAlbum {
  id: number;
  title: string;
  releaseDate?: string;
  cover?: string;
}

export interface TidalTrack {
  id: number;
  title: string;
  artist: TidalArtist;
  artists?: TidalArtist[];
  album: TidalAlbum;
  duration: number;
  trackNumber?: number;
  volumeNumber?: number;
  explicit?: boolean;
  isrc?: string;
}

export interface TidalSearchResult {
  tracks: {
    items: TidalTrack[];
    totalNumberOfItems: number;
    limit: number;
    offset: number;
  };
}

export interface TidalPlaylist {
  uuid: string;
  title: string;
  description?: string;
  numberOfTracks: number;
  duration?: number;
  lastUpdated?: string;
  created?: string;
  type?: string;
  publicPlaylist?: boolean;
}

export interface TidalPlaylistResponse {
  limit: number;
  offset: number;
  totalNumberOfItems: number;
  items: TidalPlaylist[];
}

export interface TidalCreatePlaylistRequest {
  data: {
    attributes: {
      accessType: string;
      description: string;
      name: string;
    };
    type: string;
  };
}

export interface TidalAddTracksRequest {
  data: Array<{
    id: string;
    type: string;
  }>;
}

// Types for track verification response
export interface TidalTrackVerificationResponse {
  data: {
    id: string;
    type: string;
    attributes: {
      title: string;
      isrc?: string;
      duration: string; // ISO 8601 duration format like "PT2M39S"
      copyright?: string;
      explicit: boolean;
      popularity: number;
      accessType: string;
      availability: string[];
      mediaTags: string[];
      externalLinks: Array<{
        href: string;
        meta: {
          type: string;
        };
      }>;
      spotlighted: boolean;
    };
    relationships: {
      albums: {
        data: Array<{
          id: string;
          type: string;
        }>;
      };
      artists: {
        data: Array<{
          id: string;
          type: string;
        }>;
      };
    };
  };
  included: Array<{
    id: string;
    type: string;
    attributes: {
      name?: string; // For artists
      title?: string; // For albums
      popularity?: number;
      releaseDate?: string;
      numberOfItems?: number;
      duration?: string;
      explicit?: boolean;
      externalLinks?: Array<{
        href: string;
        meta: {
          type: string;
        };
      }>;
    };
  }>;
}

// Simplified track verification result for easier use
export interface TidalTrackVerification {
  id: string;
  title: string;
  artists: Array<{
    id: string;
    name: string;
  }>;
  album: {
    id: string;
    title: string;
    releaseDate?: string;
  };
  duration: string;
  isrc?: string;
  explicit: boolean;
  popularity: number;
  isAvailable: boolean;
}