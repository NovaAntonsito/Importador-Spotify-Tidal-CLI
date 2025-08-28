import { Track } from '../models/Track.js';
import { TidalService } from '../services/TidalService.js';
import { TidalTrack } from '../models/TidalTypes.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';

export interface MatchResult {
  tidalTrack: TidalTrack | null;
  confidence: number;
  searchAttempts: string[];
}

export interface SearchContext {
  context: 'import' | 'sync';
}

export class SongMatcher {
  private readonly SIMILARITY_THRESHOLD = 0.7; // Puntuación mínima de similitud para considerar una coincidencia
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.9; // Umbral de coincidencia de alta confianza

  constructor(private tidalService: TidalService) { }

  /**
   * Encontrar la mejor coincidencia para una canción de Spotify en Tidal usando múltiples estrategias de búsqueda
   */
  async findBestMatch(spotifyTrack: Track, searchContext?: SearchContext): Promise<MatchResult> {
    const searchQueries = this.generateSearchQueries(spotifyTrack);
    const searchAttempts: string[] = [];
    const searchAttemptsDetailed: { query: string; url: string; description: string }[] = [];
    let bestMatch: TidalTrack | null = null;
    let bestConfidence = 0;
    let lastError: string | undefined;

    // Intentar cada estrategia de búsqueda en orden de preferencia
    for (const query of searchQueries) {
      try {
        searchAttempts.push(query.description);

        // Construir URL de búsqueda para logging (solo artista y título)
        const searchUrl = this.buildSearchUrl(query.artist, query.title);
        const searchQuery = this.buildSearchQuery(query.artist, query.title); // No incluir álbum en query
        
        searchAttemptsDetailed.push({
          query: searchQuery,
          url: searchUrl,
          description: query.description
        });

        const searchResult = await this.tidalService.searchTrack(
          query.artist,
          query.title
          // NO pasar álbum para evitar interferencias en la búsqueda
        );

        if (searchResult.tracks.items.length === 0) {
          continue;
        }

        // Encontrar la mejor coincidencia de los resultados de búsqueda
        for (const tidalTrack of searchResult.tracks.items) {
          const confidence = this.calculateSimilarity(spotifyTrack, tidalTrack);

          if (confidence > bestConfidence && confidence >= this.SIMILARITY_THRESHOLD) {
            bestMatch = tidalTrack;
            bestConfidence = confidence;

            // Si encontramos una coincidencia de alta confianza, podemos parar de buscar
            if (confidence >= this.HIGH_CONFIDENCE_THRESHOLD) {
              break;
            }
          }
        }

        // Si encontramos una coincidencia de alta confianza, parar de intentar otras estrategias de búsqueda
        if (bestConfidence >= this.HIGH_CONFIDENCE_THRESHOLD) {
          break;
        }

      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Error desconocido en búsqueda';
        console.warn(`La búsqueda falló para la consulta "${query.description}":`, error);
        // Continuar con la siguiente estrategia de búsqueda
      }
    }

    // Si no se encontró la canción, loggear los detalles de búsqueda
    if (!bestMatch && searchContext) {
      await ErrorLogger.logTrackNotFound(
        {
          title: spotifyTrack.title,
          artist: spotifyTrack.artists[0]?.name || 'Unknown Artist',
          album: spotifyTrack.album.name,
          spotifyId: spotifyTrack.id
        },
        searchAttemptsDetailed,
        searchContext.context,
        lastError
      );
    }

    return {
      tidalTrack: bestMatch,
      confidence: bestConfidence,
      searchAttempts
    };
  }

  /**
   * Calcular puntuación de similitud entre una canción de Spotify y una de Tidal
   * Requerimientos: 3.3, 3.4
   */
  calculateSimilarity(spotifyTrack: Track, tidalTrack: TidalTrack): number {
    const weights = {
      title: 0.4,
      artist: 0.4,
      album: 0.15,
      duration: 0.05
    };

    // Normalizar datos de la canción para comparación
    const spotifyNormalized = {
      title: this.normalizeString(spotifyTrack.title),
      artist: this.normalizeString(spotifyTrack.artists[0]?.name || ''),
      album: this.normalizeString(spotifyTrack.album.name),
      duration: spotifyTrack.duration
    };

    const tidalNormalized = {
      title: this.normalizeString(tidalTrack.title),
      artist: this.normalizeString(tidalTrack.artist.name),
      album: this.normalizeString(tidalTrack.album.title),
      duration: tidalTrack.duration * 1000 // La duración de Tidal está en segundos, Spotify en milisegundos
    };

    // Calcular puntuaciones de similitud individuales
    const titleSimilarity = this.calculateStringSimilarity(
      spotifyNormalized.title,
      tidalNormalized.title
    );

    const artistSimilarity = this.calculateArtistSimilarity(
      spotifyTrack.artists,
      tidalTrack.artists || [tidalTrack.artist]
    );

    const albumSimilarity = this.calculateStringSimilarity(
      spotifyNormalized.album,
      tidalNormalized.album
    );

    const durationSimilarity = this.calculateDurationSimilarity(
      spotifyNormalized.duration,
      tidalNormalized.duration
    );

    // Calcular promedio ponderado
    const totalSimilarity =
      (titleSimilarity * weights.title) +
      (artistSimilarity * weights.artist) +
      (albumSimilarity * weights.album) +
      (durationSimilarity * weights.duration);

    return Math.min(1.0, Math.max(0.0, totalSimilarity));
  }

  /**
   * Normalizar datos de canción para coincidencia consistente de cadenas
   * Requerimientos: 3.3, 3.4
   */
  normalizeTrackData(track: Track | TidalTrack): string {
    if ('artists' in track && Array.isArray(track.artists)) {
      // Canción de Spotify
      const spotifyTrack = track as Track;
      return `${this.normalizeString(spotifyTrack.title)} - ${this.normalizeString(spotifyTrack.artists[0]?.name || '')}`;
    } else {
      // Canción de Tidal
      const tidalTrack = track as TidalTrack;
      return `${this.normalizeString(tidalTrack.title)} - ${this.normalizeString(tidalTrack.artist.name)}`;
    }
  }

  /**
   * Generar consultas de búsqueda alternativas para una canción
   * Requerimientos: 3.3, 3.4
   */
  private generateSearchQueries(track: Track): Array<{
    artist: string;
    title: string;
    album?: string;
    description: string;
  }> {
    const primaryArtist = track.artists[0]?.name || '';
    const title = track.title;
    const album = track.album.name;

    const queries = [
      // Estrategia 1: Búsqueda completa con artista principal, título y álbum
      {
        artist: primaryArtist,
        title: title,
        album: album,
        description: `Búsqueda completa: "${primaryArtist}" - "${title}" del álbum "${album}"`
      },

      // Estrategia 2: Solo artista y título (sin álbum)
      {
        artist: primaryArtist,
        title: title,
        description: `Artista + Título: "${primaryArtist}" - "${title}"`
      },

      // Estrategia 3: Título limpio (remover colaboraciones, remixes, etc.)
      {
        artist: primaryArtist,
        title: this.cleanTitle(title),
        description: `Título limpio: "${primaryArtist}" - "${this.cleanTitle(title)}"`
      },

      // Estrategia 4: Todos los artistas si hay múltiples
      ...(track.artists.length > 1 ? [{
        artist: track.artists.map(a => a.name).join(' '),
        title: title,
        description: `Todos los artistas: "${track.artists.map(a => a.name).join(' ')}" - "${title}"`
      }] : []),

      // Estrategia 5: Intentar con cada artista individual si hay múltiples
      ...(track.artists.length > 1 ? track.artists.slice(1).map(artist => ({
        artist: artist.name,
        title: title,
        description: `Artista alternativo: "${artist.name}" - "${title}"`
      })) : [])
    ];

    return queries;
  }

  /**
   * Normalizar una cadena para comparación
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .trim()
      // Remover puntuación común y caracteres especiales
      .replace(/[^\w\s]/g, ' ')
      // Reemplazar múltiples espacios con un solo espacio
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calcular similitud de cadenas usando distancia de Levenshtein
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    // Usar distancia de Levenshtein para cálculo de similitud
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);

    return 1 - (distance / maxLength);
  }

  /**
   * Calcular similitud de artistas, considerando múltiples artistas
   */
  private calculateArtistSimilarity(spotifyArtists: Array<{ name: string }>, tidalArtists: Array<{ name: string }>): number {
    if (spotifyArtists.length === 0 || tidalArtists.length === 0) return 0.0;

    let maxSimilarity = 0;

    // Comparar cada artista de Spotify con cada artista de Tidal
    for (const spotifyArtist of spotifyArtists) {
      for (const tidalArtist of tidalArtists) {
        const similarity = this.calculateStringSimilarity(
          this.normalizeString(spotifyArtist.name),
          this.normalizeString(tidalArtist.name)
        );
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }
    }

    return maxSimilarity;
  }

  /**
   * Calcular similitud de duración con tolerancia para diferencias menores
   */
  private calculateDurationSimilarity(duration1: number, duration2: number): number {
    if (duration1 === 0 || duration2 === 0) return 0.5; // Puntuación neutral si falta la duración

    const difference = Math.abs(duration1 - duration2);
    const average = (duration1 + duration2) / 2;
    const percentageDifference = difference / average;

    // Permitir hasta 10% de diferencia en duración
    if (percentageDifference <= 0.1) return 1.0;
    if (percentageDifference <= 0.2) return 0.8;
    if (percentageDifference <= 0.3) return 0.6;

    return 0.3; // Puntuación baja para duraciones muy diferentes
  }

  /**
   * Limpiar título removiendo adiciones comunes como "(feat. ...)", "[Remix]", etc.
   */
  private cleanTitle(title: string): string {
    return title
      // Remover información de colaboraciones
      .replace(/\s*[\(\[].*?feat\.?.*?[\)\]]/gi, '')
      .replace(/\s*feat\.?\s+.*/gi, '')
      // Remover información de remix/versión
      .replace(/\s*[\(\[].*?(remix|version|edit|mix|remaster).*?[\)\]]/gi, '')
      // Remover marcadores explícitos
      .replace(/\s*[\(\[].*?explicit.*?[\)\]]/gi, '')
      // Limpiar espacios extra
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calcular distancia de Levenshtein entre dos cadenas
   * ESTO CASI ME INFARTA, EN MI VIDA VI EL ALGORITMO LEVESHTEIN.
   * OSEA BANCO PERO ME MOVIO EL CEREBRO DE UNA FORMA ESTO
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // eliminación
          matrix[j - 1][i] + 1, // inserción
          matrix[j - 1][i - 1] + indicator // sustitución
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Construir query de búsqueda como lo hace TidalService
   * NOTA: No incluimos el álbum en la búsqueda para evitar interferencias
   * Preservamos apostrofes y caracteres especiales importantes
   */
  private buildSearchQuery(artist: string, title: string, album?: string): string {
    // Solo usar artista y título, NO el álbum
    let query = `${artist} ${title}`;
    
    // Limpiar el query pero preservar apostrofes y caracteres importantes
    return query
      .replace(/[^\w\s\-']/g, ' ') // Preservar apostrofes (') y guiones (-), remover otros especiales
      .replace(/\s+/g, ' ') // Reemplazar múltiples espacios con un solo espacio
      .trim();
  }

  /**
   * Construir URL de búsqueda para logging
   * NOTA: Solo usa artista y título, NO el álbum
   */
  private buildSearchUrl(artist: string, title: string): string {
    const baseUrl = 'https://openapi.tidal.com/v2/searchResults';
    const query = this.buildSearchQuery(artist, title); // Solo artista y título
    const encodedQuery = encodeURIComponent(query);
    return `${baseUrl}/${encodedQuery}/relationships/tracks`;
  }
}