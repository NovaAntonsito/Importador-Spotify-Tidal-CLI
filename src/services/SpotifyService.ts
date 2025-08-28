import axios, { AxiosInstance } from 'axios';
import { Track, Artist, Album } from '../models/Track.js';
import { Playlist, PlaylistOwner } from '../models/Playlist.js';
import { ManejadorErrores, CONFIGURACION_REINTENTO_PREDETERMINADA } from '../utils/ErrorHandler.js';

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
  owner: { id: string; display_name: string };
  public: boolean;
  collaborative: boolean;
}

interface SpotifyTrackResponse {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: {
    id: string;
    name: string;
    release_date?: string;
  };
  duration_ms: number;
  external_ids?: { isrc?: string };
  explicit?: boolean;
  popularity?: number;
}

interface SpotifyPlaylistTracksResponse {
  items: Array<{
    track: SpotifyTrackResponse;
  }>;
  next: string | null;
  total: number;
}

interface SpotifyPlaylistsResponse {
  items: SpotifyPlaylist[];
  next: string | null;
  total: number;
}
/**
 * Servicio para interactuar con la API de Spotify
 * Sinceramente la API de Spotify ayudó más que la de Tidal, ojalá mejoren Tidal
 */
export class SpotifyService {
  private client: AxiosInstance;
  private manejadorErrores: ManejadorErrores;

  constructor(private accessToken: string) {
    this.manejadorErrores = new ManejadorErrores(CONFIGURACION_REINTENTO_PREDETERMINADA);
    this.client = axios.create({
      baseURL: 'https://api.spotify.com/v1',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 segundos de timeout
    });
  }

  /**
   * Obtener perfil del usuario actual
   */
  async getUserProfile(): Promise<SpotifyUser> {
    return this.manejadorErrores.ejecutarConReintento(async () => {
      const response = await this.client.get<SpotifyUser>('/me');
      return response.data;
    }, 'spotify', 'getUserProfile');
  }

  /**
   * Obtener playlists del usuario
   */
  async getUserPlaylists(userId?: string): Promise<Playlist[]> {
    const playlists: Playlist[] = [];
    let url: string | null = userId ? `/users/${userId}/playlists` : '/me/playlists';
    
    while (url) {
      const response = await this.manejadorErrores.ejecutarConReintento(async () => {
        return this.client.get<SpotifyPlaylistsResponse>(url!, {
          params: { limit: 50 }
        });
      }, 'spotify', 'getUserPlaylists');

      const convertedPlaylists = response.data.items.map(this.convertSpotifyPlaylist);
      playlists.push(...convertedPlaylists);
      
      url = response.data.next ? response.data.next.replace('https://api.spotify.com/v1', '') : null;
    }

    return playlists;
  }

  /**
   * Obtener canciones de una playlist
   */
  async getPlaylistTracks(playlistId: string): Promise<Track[]> {
    const tracks: Track[] = [];
    let url: string | null = `/playlists/${playlistId}/tracks`;

    while (url) {
      const response = await this.manejadorErrores.ejecutarConReintento(async () => {
        return this.client.get<SpotifyPlaylistTracksResponse>(url!, {
          params: { limit: 100 }
        });
      }, 'spotify', 'getPlaylistTracks');

      const convertedTracks = response.data.items
        .filter((item: any) => item.track && item.track.id) // Filtrar canciones nulas
        .map((item: any) => this.convertSpotifyTrack(item.track));
      
      tracks.push(...convertedTracks);
      
      url = response.data.next ? response.data.next.replace('https://api.spotify.com/v1', '') : null;
    }

    return tracks;
  }

  /**
   * Convertir playlist de Spotify al formato interno
   */
  private convertSpotifyPlaylist(spotifyPlaylist: SpotifyPlaylist): Playlist {
    const owner: PlaylistOwner = {
      id: spotifyPlaylist.owner.id,
      displayName: spotifyPlaylist.owner.display_name || spotifyPlaylist.owner.id,
    };

    return {
      id: spotifyPlaylist.id,
      name: spotifyPlaylist.name,
      description: spotifyPlaylist.description || undefined,
      tracks: [],
      owner,
      totalTracks: spotifyPlaylist.tracks.total,
      isPublic: spotifyPlaylist.public,
      collaborative: spotifyPlaylist.collaborative,
    };
  }

  /**
   * Convertir canción de Spotify al formato interno
   */
  private convertSpotifyTrack(spotifyTrack: SpotifyTrackResponse): Track {
    const artists: Artist[] = spotifyTrack.artists.map(artist => ({
      id: artist.id,
      name: artist.name,
    }));

    const album: Album = {
      id: spotifyTrack.album.id,
      name: spotifyTrack.album.name,
      releaseDate: spotifyTrack.album.release_date,
    };

    return {
      id: spotifyTrack.id,
      title: spotifyTrack.name,
      artists,
      album,
      duration: spotifyTrack.duration_ms,
      isrc: spotifyTrack.external_ids?.isrc,
      explicit: spotifyTrack.explicit,
      popularity: spotifyTrack.popularity,
    };
  }


}