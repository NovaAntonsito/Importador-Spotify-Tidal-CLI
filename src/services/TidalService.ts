import axios, { AxiosInstance } from 'axios';
import {
  TidalPlaylist,
  TidalCreatePlaylistRequest,
  TidalAddTracksRequest,
  TidalTrackVerificationResponse,
  TidalTrackVerification
} from '../models/TidalTypes.js';
import { ManejadorErrores, CONFIGURACION_REINTENTO_PREDETERMINADA } from '../utils/ErrorHandler.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';

/**
 * Servicio para interactuar con la API de Tidal
 */
export class TidalService {
  private client: AxiosInstance;
  private readonly baseURL = 'https://openapi.tidal.com/v2'; // Actualizamos para usar el endpoint correcto de Tidal API v2
  private manejadorErrores: ManejadorErrores;

  constructor(private accessToken: string) {
    this.manejadorErrores = new ManejadorErrores(CONFIGURACION_REINTENTO_PREDETERMINADA);
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json'
      },
      timeout: 10000 // 10 segundos de timeout, que feo hack pero funciona
    });

    // Interceptor para loggear errores 400 - medio mierdoso pero necesario
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 400) {
          await ErrorLogger.log400Error(error, 'TidalService');
        }
        throw error;
      }
    );
  }


  /**
   * Buscar tracks en Tidal con reintentos inteligentes
  async searchTrack(artist: string, title: string, album?: string, logContext?: { spotifyId: string; context: 'import' | 'sync' }): Promise<any> {
    return this.manejadorErrores.ejecutarConReintento(async () => {
      const searchAttempts: Array<{ query: string; url: string; description: string }> = [];

     
      const originalResult = await this.performSingleSearch(artist, title, album, searchAttempts, 'original');
      if (originalResult.found) {
        return originalResult.data;
      }

      if (this.containsNumbers(artist, title)) {
        const cleanArtist = this.removeNumbers(artist);
        const cleanTitle = this.removeNumbers(title);

        const cleanResult = await this.performSingleSearch(cleanArtist, cleanTitle, album, searchAttempts, 'sin números');
        if (cleanResult.found) {
          return cleanResult.data;
        }
      }

      // Si llegamos aquí, no se encontró nada
      if (logContext) {
        await ErrorLogger.logTrackNotFound(
          {
            title: title,
            artist: artist,
            album: album || 'Unknown Album',
            spotifyId: logContext.spotifyId
          },
          searchAttempts,
          logContext.context,
          'No se encontraron resultados en Tidal después de múltiples intentos'
        );
      }

      return { data: [] }; // Retornar estructura vacía consistente
    }, 'tidal', 'searchTrack');
  }

  /**
   * Realizar una búsqueda individual y registrar el intento
   */
  private async performSingleSearch(
    artist: string,
    title: string,
    album: string | undefined,
    searchAttempts: Array<{ query: string; url: string; description: string }>,
    attemptType: string
  ): Promise<{ found: boolean; data?: any }> {
    const query = this.buildSearchQuery(artist, title, album);
    const userInfo = await this.getUserInfo();
    const encodedQuery = encodeURIComponent(query).replace(/%2527/g, '%27');
    const searchEndpoint = `/searchResults/${encodedQuery}/relationships/tracks`;
    const searchUrl = `${this.baseURL}${searchEndpoint}`;

    // Registrar el intento
    searchAttempts.push({
      query: query,
      url: searchUrl,
      description: `Búsqueda ${attemptType}: "${artist}" - "${title}"${album ? ` del álbum "${album}"` : ''}`
    });

    const response = await this.client.get(searchEndpoint, {
      params: {
        countryCode: userInfo.countryCode,
        explicitFilter: 'exclude',
        include: 'tracks'
      }
    });

    // Verificar si encontramos resultados
    if (response.data.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
      const firstTrackId = response.data.data[0].id;
      const verifiedTrack = await this.verifyTrack(firstTrackId);

      if (verifiedTrack) {
        console.log(`   🆔 ${verifiedTrack.id}`);
        console.log(`   🎵 ${verifiedTrack.title}`);
        console.log(`   👨‍🎤 ${verifiedTrack.artists.map(a => a.name).join(', ')}`);
        console.log(`   💿 ${verifiedTrack.album.title}`);
        if (attemptType !== 'original') {
          console.log(`   🔄 Encontrada con búsqueda ${attemptType}`);
        }
        return { found: true, data: response.data };
      }
    }

    return { found: false };
  }

  /**
   * Verificar si el texto contiene números (años, remasters, etc.)
   */
  private containsNumbers(artist: string, title: string): boolean {
    const combinedText = `${artist} ${title}`;
    // Buscar patrones comunes: años, números ordinales, remasters, etc.
    const numberPatterns = [
      /\b(19|20)\d{2}\b/, // Años 1900-2099
      /\b\d+(st|nd|rd|th)\b/i, // Números ordinales (1st, 2nd, 3rd, 21st, etc.)
      /\b\d+\s*(remaster|remix|version|edit|mix)\b/i, // Números seguidos de palabras clave
      /\b(remaster|remix|version|edit|mix)\s*\d+\b/i, // Palabras clave seguidas de números
      /\b(remastered|remixed)\s*(19|20)\d{2}\b/i, // Remastered/Remixed seguido de año
      /\b\d{4}\s*(remaster|remix|version|edit|mix)\b/i // Años específicos con palabras clave
    ];

    return numberPatterns.some(pattern => pattern.test(combinedText));
  }

  /**
   * Remover números y patrones relacionados con años, remasters, etc.
   */
  private removeNumbers(text: string): string {
    return text
      // Remover números ordinales (1st, 2nd, 21st, etc.)
      .replace(/\b\d+(st|nd|rd|th)\b/gi, '')
      // Remover años y patrones de remaster
      .replace(/\b(19|20)\d{2}\s*(remaster|remix|version|edit|mix)\b/gi, '')
      .replace(/\b(remaster|remix|version|edit|mix)\s*(19|20)\d{2}\b/gi, '')
      .replace(/\b(remastered|remixed)\s*(19|20)\d{2}\b/gi, '')
      .replace(/\b(remaster|remix|version|edit|mix)\s*\d+\b/gi, '')
      .replace(/\b\d+\s*(remaster|remix|version|edit|mix)\b/gi, '')
      // Remover años sueltos
      .replace(/\b(19|20)\d{2}\b/g, '')
      // Remover palabras clave sueltas que quedaron
      .replace(/\b(remaster|remix|version|edit|mix|remastered|remixed)\b/gi, '')
      // Remover guiones y paréntesis que quedan vacíos o al final
      .replace(/\s*-\s*$/g, '')
      .replace(/\s*-\s*-\s*/g, ' - ')
      .replace(/\(\s*\)/g, '')
      .replace(/\[\s*\]/g, '')
      // Limpiar espacios múltiples
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Conseguir detalles del track por ID para verificación
   */
  async getTrackDetails(trackId: string): Promise<TidalTrackVerificationResponse> {
    return this.manejadorErrores.ejecutarConReintento(async () => {
      // Conseguir info del usuario para el country code
      const userInfo = await this.getUserInfo();

      const response = await this.client.get(`/tracks/${trackId}`, {
        params: {
          countryCode: userInfo.countryCode,
          include: 'artists,albums'
        }
      });

      return response.data;
    }, 'tidal', 'getTrackDetails');
  }

  /**
   * Verificar si un track existe y conseguir sus detalles en formato simplificado
   */
  async verifyTrack(trackId: string): Promise<TidalTrackVerification | null> {
    try {
      const trackData = await this.getTrackDetails(trackId);

      // Extraer artistas de los datos incluidos - que cagada de estructura de API
      const artists = trackData.included
        .filter(item => item.type === 'artists')
        .map(artist => ({
          id: artist.id,
          name: artist.attributes.name || 'Unknown Artist'
        }));

      // Extraer álbum de los datos incluidos
      const albumData = trackData.included.find(item => item.type === 'albums');
      const album = {
        id: albumData?.id || '',
        title: albumData?.attributes.title || 'Unknown Album',
        releaseDate: albumData?.attributes.releaseDate
      };

      // Verificar si el track está disponible para streaming
      const isAvailable = trackData.data.attributes.availability.includes('STREAM');

      return {
        id: trackData.data.id,
        title: trackData.data.attributes.title,
        artists,
        album,
        duration: trackData.data.attributes.duration,
        isrc: trackData.data.attributes.isrc,
        explicit: trackData.data.attributes.explicit,
        popularity: trackData.data.attributes.popularity,
        isAvailable
      };
    } catch (error) {
      console.log(`❌ Track ${trackId} no encontrado o no disponible`);
      return null;
    }
  }


  async createPlaylist(name: string, description?: string, accessType: string = 'PUBLIC'): Promise<TidalPlaylist> {
    // Conseguir info del usuario para el country code
    const userInfo = await this.getUserInfo();

    const requestData: TidalCreatePlaylistRequest = {
      data: {
        attributes: {
          accessType: accessType,
          description: description || '',
          name: name
        },
        type: 'playlists'
      }
    };

    return this.manejadorErrores.ejecutarConReintento(async () => {
      try {
        const response = await this.client.post('/playlists', requestData, {
          params: {
            countryCode: userInfo.countryCode
          }
        });

        console.log(`✅ Playlist creada: ${name}`);
        return response.data;
      } catch (error) {
        await this.handleError(error, 'createPlaylist', {
          playlistName: name,
          accessType,
          countryCode: userInfo.countryCode
        });
        throw error;
      }
    }, 'tidal', 'createPlaylist');
  }

  /**
   * Limpiar todos los tracks de una playlist de Tidal
   */
  async clearPlaylist(playlistId: string): Promise<void> {
    // Conseguir info del usuario para el country code
    const userInfo = await this.getUserInfo();

    return this.manejadorErrores.ejecutarConReintento(async () => {
      // Conseguir los tracks actuales de la playlist
      const response = await this.client.get(`/playlists/${playlistId}/relationships/items`, {
        params: {
          countryCode: userInfo.countryCode,
          limit: 100
        }
      });

      if (response.data && response.data.data && response.data.data.length > 0) {
        // Extraer IDs de tracks
        const trackIds = response.data.data.map((item: any) => item.id.toString());

        // Remover tracks en lotes de 20 - que horrible hack pero la API tiene límites
        const BATCH_SIZE = 20;
        for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
          const batch = trackIds.slice(i, i + BATCH_SIZE);

          // Crear data del request para remover tracks
          const removeData = {
            data: batch.map((trackId: string) => ({
              id: trackId,
              type: 'tracks'
            }))
          };

          await this.client.delete(`/playlists/${playlistId}/relationships/items`, {
            data: removeData,
            params: {
              countryCode: userInfo.countryCode
            }
          });

          // Delay pequeño entre lotes para no romper la API
          if (i + BATCH_SIZE < trackIds.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
    }, 'tidal', 'clearPlaylist');
  }

  async addTracksToPlaylist(playlistId: string, trackIds: string[], silent: boolean = false): Promise<void> {
    if (trackIds.length === 0) {
      return;
    }

    // Conseguir info del usuario para el country code
    const userInfo = await this.getUserInfo();

    const requestData: TidalAddTracksRequest = {
      data: trackIds.map(trackId => ({
        id: trackId,
        type: 'tracks'
      }))
    };

    return this.manejadorErrores.ejecutarConReintento(async () => {
      try {
        await this.client.post(`/playlists/${playlistId}/relationships/items`, requestData, {
          params: {
            countryCode: userInfo.countryCode
          }
        });

        if (!silent) {
          console.log(`✅ Agregados ${trackIds.length} tracks a la playlist ${playlistId}`);
        }
      } catch (error) {
        await this.handleError(error, 'addTracksToPlaylist', {
          playlistId,
          trackCount: trackIds.length,
          trackIds: trackIds.slice(0, 5), // Loggear los primeros 5 track IDs
          countryCode: userInfo.countryCode
        });
        throw error;
      }
    }, 'tidal', 'addTracksToPlaylist');
  }

  /**
   * Conseguir información del usuario actual (ID y country code)
   */
  async getUserInfo(): Promise<{ id: string; countryCode: string }> {
    return this.manejadorErrores.ejecutarConReintento(async () => {
      const response = await this.client.get('/users/me');

      const userData = response.data.data;
      const userInfo = {
        id: userData.id,
        countryCode: userData.attributes?.country || 'US' // Default a US si no hay country
      };

      return userInfo;
    }, 'tidal', 'getUserInfo');
  }

  /**
   * Conseguir playlists del usuario desde Tidal usando el flujo correcto de API
   */
  async getUserPlaylists(): Promise<TidalPlaylist[]> {
    return this.manejadorErrores.ejecutarConReintento(async () => {
      // Primero, conseguir info del usuario para obtener ID y country code
      const userInfo = await this.getUserInfo();

      // Después conseguir playlists usando el endpoint correcto
      const playlistsUrl = `/userCollections/${userInfo.id}/relationships/playlists`;


      const response = await this.client.get(playlistsUrl, {
        params: {
          countryCode: userInfo.countryCode,
          include: 'playlists',
          limit: 50,
          offset: 0
        }
      });

      // La estructura de respuesta debería tener las playlists en la sección included - que cagada de estructura
      if (response.data.included && Array.isArray(response.data.included)) {
        const playlists = response.data.included
          .filter((item: any) => item.type === 'playlists')
          .map((item: any) => ({
            uuid: item.id, // Mapear id a uuid
            title: item.attributes.name,
            description: item.attributes.description || '',
            numberOfTracks: item.attributes.numberOfItems || 0,
            duration: item.attributes.duration,
            createdAt: item.attributes.createdAt,
            lastModifiedAt: item.attributes.lastModifiedAt,
            accessType: item.attributes.accessType,
            playlistType: item.attributes.playlistType,
            type: item.type
          }));

        return playlists;
      } else if (response.data.data && Array.isArray(response.data.data)) {
        return response.data.data;
      } else {
        console.log('⚠️ No se encontraron playlists en la respuesta');
        return [];
      }
    }, 'tidal', 'getUserPlaylists');
  }

  /**
   * Buscar y verificar tracks - combina búsqueda con verificación
   */
  async searchAndVerifyTrack(artist: string, title: string): Promise<TidalTrackVerification[]> {
    try {
      // Primero buscar el track
      const searchResults = await this.searchTrack(artist, title);

      // Extraer IDs de tracks de los resultados de búsqueda
      const trackIds: string[] = [];

      if (searchResults.data && Array.isArray(searchResults.data)) {
        trackIds.push(...searchResults.data.map((track: any) => track.id));
      }

      if (trackIds.length === 0) {
        console.log(`🔍 No se encontraron tracks para: ${artist} - ${title}`);
        return [];
      }

      // Verificar cada track encontrado
      const verifiedTracks: TidalTrackVerification[] = [];

      for (const trackId of trackIds.slice(0, 5)) { // Limitar a los primeros 5 resultados
        const verification = await this.verifyTrack(trackId);
        if (verification && verification.isAvailable) {
          verifiedTracks.push(verification);
        }
      }

      return verifiedTracks;

    } catch (error) {
      console.error(`❌ Error buscando y verificando track: ${artist} - ${title}`, error);
      return [];
    }
  }

  /**
   * Construir query string para la API de Tidal
   * NOTA: No incluimos el álbum en la búsqueda para evitar interferencias 
   */
  private buildSearchQuery(artist: string, title: string, album?: string): string {
    // Solo usar artista y título, NO el álbum
    let query = `${artist} ${title}`;

    // Limpiar caracteres especiales pero preservar acentos, ñ, apostrofes, guiones, puntos, signos de interrogación, más, y diéresis
    const cleanedQuery = query
      .replace(/[^\w\s\-'.?+áéíóúüñöÁÉÍÓÚÜÑÖ]/g, ' ') // Preservar acentos, ñ, ö, apostrofes, guiones, puntos, ?, +
      .replace(/\s+/g, ' ') // Reemplazar múltiples espacios con un solo espacio
      .trim();

    // Forzar codificación del apostrofe ANTES de encodeURIComponent para evitar problemas
    const apostropheFixed = cleanedQuery.replace(/'/g, '%27');

    return apostropheFixed;
  }

  /**
   * Manejar y loggear errores 400 con contexto adicional
   */
  private async handleError(error: any, operation: string, additionalContext?: any): Promise<void> {
    if (error.response?.status === 400) {
      console.log(`❌ Error 400 en ${operation} - loggeando detalles...`);
      await ErrorLogger.log400Error(error, `${operation} - ${JSON.stringify(additionalContext || {})}`);
    }
  }

  /**
   * Conseguir logs de errores recientes para debugging 
   */
  static async getRecentErrorLogs(limit: number = 5): Promise<any[]> {
    return await ErrorLogger.getRecentLogs(limit);
  }

  /**
   * Limpiar logs de errores
   */
  static async clearErrorLogs(): Promise<void> {
    await ErrorLogger.clearLogs();
  }


}