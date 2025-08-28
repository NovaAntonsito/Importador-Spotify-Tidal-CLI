import chalk from 'chalk';
import { SpotifyService } from './SpotifyService.js';
import { TidalService } from './TidalService.js';
import { SongMatcher } from '../matching/SongMatcher.js';
import { Playlist } from '../models/Playlist.js';
import { TidalPlaylist } from '../models/TidalTypes.js';
import { Track } from '../models/Track.js';

export interface PlaylistSyncResult {
  playlistName: string;
  action: 'created' | 'updated' | 'skipped';
  totalTracks: number;
  successfulTracks: number;
  failedTracks: number;
  tidalPlaylistId?: string;
  errors?: string[];
}

export interface SyncSummary {
  totalPlaylists: number;
  playlistsCreated: number;
  playlistsUpdated: number;
  playlistsSkipped: number;
  totalTracksProcessed: number;
  totalTracksSuccessful: number;
  totalTracksFailed: number;
  results: PlaylistSyncResult[];
}

export interface PlaylistComparison {
  spotifyPlaylist: Playlist;
  tidalPlaylist?: TidalPlaylist;
  action: 'create' | 'update' | 'skip';
  reason: string;
}

export class PlaylistSyncManager {
  constructor(
    private spotifyService: SpotifyService,
    private tidalService: TidalService,
    private songMatcher: SongMatcher
  ) { }

  /**
   * Conseguir todas las playlists de Spotify del usuario autenticado
   */
  async getAllSpotifyPlaylists(): Promise<Playlist[]> {
    try {
      const playlists = await this.spotifyService.getUserPlaylists();

      // Cargar tracks para cada playlist
      const playlistsWithTracks = await Promise.all(
        playlists.map(async (playlist) => {
          try {
            const tracks = await this.spotifyService.getPlaylistTracks(playlist.id);
            return {
              ...playlist,
              tracks
            };
          } catch (error) {
            console.warn(`Falló cargar tracks para playlist "${playlist.name}": ${error}`);
            return playlist; // Devolver playlist sin tracks en lugar de fallar completamente
          }
        })
      );

      return playlistsWithTracks;
    } catch (error) {
      throw new Error(`Failed to fetch Spotify playlists: ${error}`);
    }
  }

  /**
   * Conseguir todas las playlists existentes de Tidal del usuario autenticado
   */
  async getAllTidalPlaylists(): Promise<TidalPlaylist[]> {
    try {
      return await this.tidalService.getUserPlaylists();
    } catch (error) {
      throw new Error(`Failed to fetch Tidal playlists: ${error}`);
    }
  }

  /**
   * Comparar playlists de Spotify y Tidal para determinar acciones de sync
   */
  async comparePlaylistsForSync(
    spotifyPlaylists: Playlist[],
    tidalPlaylists: TidalPlaylist[]
  ): Promise<PlaylistComparison[]> {
    const comparisons: PlaylistComparison[] = [];

    for (const spotifyPlaylist of spotifyPlaylists) {

      if (spotifyPlaylist.totalTracks === 0) {
        comparisons.push({
          spotifyPlaylist,
          action: 'skip',
          reason: 'Playlist is empty'
        });
        continue;
      }

      const matchingTidalPlaylist = tidalPlaylists.find(
        tidalPlaylist =>
          tidalPlaylist.title.toLowerCase().trim() === spotifyPlaylist.name.toLowerCase().trim()
      );

      if (matchingTidalPlaylist) {
        if (matchingTidalPlaylist.numberOfTracks < spotifyPlaylist.totalTracks) {
          comparisons.push({
            spotifyPlaylist,
            tidalPlaylist: matchingTidalPlaylist,
            action: 'update',
            reason: `Tidal playlist has ${matchingTidalPlaylist.numberOfTracks} tracks, Spotify has ${spotifyPlaylist.totalTracks}`
          });
        } else {
          comparisons.push({
            spotifyPlaylist,
            tidalPlaylist: matchingTidalPlaylist,
            action: 'skip',
            reason: 'Tidal playlist appears to be up to date'
          });
        }
      } else {
        comparisons.push({
          spotifyPlaylist,
          action: 'create',
          reason: 'Playlist does not exist in Tidal'
        });
      }
    }

    return comparisons;
  }

  /**
   * Sincronizar una playlist de Spotify a Tidal creando una nueva playlist
   */
  async syncPlaylistToTidal(spotifyPlaylist: Playlist): Promise<PlaylistSyncResult> {
    const result: PlaylistSyncResult = {
      playlistName: spotifyPlaylist.name,
      action: 'created',
      totalTracks: spotifyPlaylist.tracks.length,
      successfulTracks: 0,
      failedTracks: 0,
      errors: []
    };

    try {
      const tidalPlaylist = await this.tidalService.createPlaylist(
        spotifyPlaylist.name,
        spotifyPlaylist.description
      );

      result.tidalPlaylistId = tidalPlaylist.uuid;

      if (spotifyPlaylist.tracks.length === 0) {
        return result;
      }

      const { successfulTracks, failedTracks, errors } = await this.addTracksToTidalPlaylist(
        tidalPlaylist.uuid,
        spotifyPlaylist.tracks
      );

      result.successfulTracks = successfulTracks;
      result.failedTracks = failedTracks;
      result.errors = errors;

      return result;
    } catch (error) {
      result.errors?.push(`Failed to create playlist: ${error}`);
      result.action = 'skipped';
      return result;
    }
  }

  /**
   * Actualizar una playlist existente de Tidal reemplazando completamente su contenido
   */
  async updateExistingPlaylist(
    spotifyPlaylist: Playlist,
    tidalPlaylist: TidalPlaylist
  ): Promise<PlaylistSyncResult> {
    const result: PlaylistSyncResult = {
      playlistName: spotifyPlaylist.name,
      action: 'updated',
      totalTracks: 0,
      successfulTracks: 0,
      failedTracks: 0,
      tidalPlaylistId: tidalPlaylist.uuid,
      errors: []
    };

    try {
      // Primero, pasamos por la api de spotify
      const tracks = await this.spotifyService.getPlaylistTracks(spotifyPlaylist.id);
      result.totalTracks = tracks.length;

      if (tracks.length === 0) {
        return result;
      }

      // Clear the existing Tidal playlist first
      try {
        await this.tidalService.clearPlaylist(tidalPlaylist.uuid);
      } catch (error) {
        result.errors?.push(`Warning: Could not clear existing playlist: ${error}`);
      }

      const foundTrackIds: string[] = [];
      const failedTracks: string[] = [];

      for (const track of tracks) {
        const artistNames = track.artists.map(artist => artist.name).join(', ');

        try {
          // Search for the track (sin álbum para evitar interferencias)
          const searchResults = await this.tidalService.searchTrack(
            artistNames, 
            track.title, 
            undefined, // NO pasar álbum
            { spotifyId: track.id, context: 'sync' }
          );

          // Check if we found any tracks
          if (searchResults.data && Array.isArray(searchResults.data) && searchResults.data.length > 0) {
            const firstTrackId = searchResults.data[0].id;

            // Verify the track exists and is available
            const verifiedTrack = await this.tidalService.verifyTrack(firstTrackId);

            if (verifiedTrack && verifiedTrack.isAvailable) {
              foundTrackIds.push(firstTrackId);
            } else {
              failedTracks.push(`${track.title} - ${artistNames} (no disponible)`);
            }
          } else {
            failedTracks.push(`${track.title} - ${artistNames} (no encontrada)`);
          }
        } catch (error) {
          failedTracks.push(`${track.title} - ${artistNames} (error de búsqueda)`);
        }

        // Esto me salva el bolsillo creo
        await new Promise(resolve => setTimeout(resolve, 500));
      }


      if (foundTrackIds.length > 0) {
        await this.addTracksInBatches(tidalPlaylist.uuid, foundTrackIds);
      }

      result.successfulTracks = foundTrackIds.length;
      result.failedTracks = failedTracks.length;
      result.errors = failedTracks;

      return result;
    } catch (error) {
      result.errors?.push(`Failed to update playlist: ${error}`);
      result.action = 'skipped';
      return result;
    }
  }

  /**
   * Realizar sincronización completa de todas las playlists de Spotify a Tidal
   */
  async performFullSync(): Promise<SyncSummary> {
    const summary: SyncSummary = {
      totalPlaylists: 0,
      playlistsCreated: 0,
      playlistsUpdated: 0,
      playlistsSkipped: 0,
      totalTracksProcessed: 0,
      totalTracksSuccessful: 0,
      totalTracksFailed: 0,
      results: []
    };

    try {
      // Consigo las dos playlist a comparar
      const [spotifyPlaylists, tidalPlaylists] = await Promise.all([
        this.getAllSpotifyPlaylists(),
        this.getAllTidalPlaylists()
      ]);

      const comparisons = await this.comparePlaylistsForSync(spotifyPlaylists, tidalPlaylists);
      summary.totalPlaylists = comparisons.length;

      // Process each playlist based on the comparison result
      for (const comparison of comparisons) {
        let result: PlaylistSyncResult;

        switch (comparison.action) {
          case 'create':
            result = await this.syncPlaylistToTidal(comparison.spotifyPlaylist);
            summary.playlistsCreated++;
            break;

          case 'update':
            result = await this.updateExistingPlaylist(
              comparison.spotifyPlaylist,
              comparison.tidalPlaylist!
            );
            summary.playlistsUpdated++;
            break;

          case 'skip':
            result = {
              playlistName: comparison.spotifyPlaylist.name,
              action: 'skipped',
              totalTracks: comparison.spotifyPlaylist.totalTracks,
              successfulTracks: 0,
              failedTracks: 0,
              errors: [comparison.reason]
            };
            summary.playlistsSkipped++;
            break;
        }

        summary.results.push(result);
        summary.totalTracksProcessed += result.totalTracks;
        summary.totalTracksSuccessful += result.successfulTracks;
        summary.totalTracksFailed += result.failedTracks;
      }

      return summary;
    } catch (error) {
      throw new Error(`Full synchronization failed: ${error}`);
    }
  }

  /**
   * Método helper para agregar tracks a una playlist de Tidal con matching
   */
  private async addTracksToTidalPlaylist(
    tidalPlaylistId: string,
    spotifyTracks: Track[]
  ): Promise<{ successfulTracks: number; failedTracks: number; errors: string[] }> {
    const matchedTrackIds: string[] = [];
    const errors: string[] = [];
    let successfulTracks = 0;
    let failedTracks = 0;

    // Meto todo en lotes de 20 para que no llore la api de tidal y yo tambien
    const batchSize = 10;
    for (let i = 0; i < spotifyTracks.length; i += batchSize) {
      const batch = spotifyTracks.slice(i, i + batchSize);

      const batchPromises = batch.map(async (track) => {
        try {
          const matchResult = await this.songMatcher.findBestMatch(track, { context: 'sync' });

          if (matchResult.tidalTrack && matchResult.confidence > 0.7) {
            matchedTrackIds.push(matchResult.tidalTrack.id.toString());
            successfulTracks++;
          } else {
            failedTracks++;
            errors.push(`Could not find match for "${track.artists[0]?.name} - ${track.title}"`);
          }
        } catch (error) {
          failedTracks++;
          errors.push(`Error matching track "${track.artists[0]?.name} - ${track.title}": ${error}`);
        }
      });

      await Promise.all(batchPromises);

      // Pequeño delay para no romper la api de tidal 
      if (i + batchSize < spotifyTracks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Añado todas las id que coinciden con spotify
    if (matchedTrackIds.length > 0) {
      try {
        await this.tidalService.addTracksToPlaylist(tidalPlaylistId, matchedTrackIds);
      } catch (error) {
        errors.push(`Failed to add tracks to playlist: ${error}`);
        // Adjust success/failure counts since adding to playlist failed
        failedTracks += successfulTracks;
        successfulTracks = 0;
      }
    }

    return { successfulTracks, failedTracks, errors };
  }

  /**
   * Agregar tracks a playlist en lotes de 20 (límite de la API de Tidal)
   */
  private async addTracksInBatches(playlistId: string, trackIds: string[]): Promise<void> {
    const BATCH_SIZE = 20;
    const totalBatches = Math.ceil(trackIds.length / BATCH_SIZE);

    console.log(chalk.blue(`📦 Procesando en ${totalBatches} lotes de máximo ${BATCH_SIZE} canciones...`));

    for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
      const batch = trackIds.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      console.log(chalk.blue(`   📦 Lote ${batchNumber}/${totalBatches}: ${batch.length} canciones`));

      try {
        await this.tidalService.addTracksToPlaylist(playlistId, batch, true);
        console.log(chalk.green(`   ✅ Lote ${batchNumber} agregado exitosamente`));
      } catch (error) {
        console.log(chalk.red(`   ❌ Error en lote ${batchNumber}: ${error instanceof Error ? error.message : 'Error desconocido'}`));
        throw error;
      }

      // Add a small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < trackIds.length) {
        console.log(chalk.gray(`   ⏳ Esperando 1 segundo antes del siguiente lote...`));
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}