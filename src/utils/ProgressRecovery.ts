import { promises as fs } from 'fs';
import { Track } from '../models/Track.js';
import { Playlist } from '../models/Playlist.js';

/**
 * Interfaz para guardar el estado del progreso
 */
export interface ProgressState {
  sessionId: string;
  timestamp: Date;
  currentPlaylist: {
    id: string;
    name: string;
    totalTracks: number;
  };
  processedTracks: {
    trackId: string;
    success: boolean;
    tidalTrackId?: number;
    error?: string;
  }[];
  completedPlaylists: string[];
  failedTracks: {
    track: Track;
    reason: string;
    playlistId: string;
  }[];
}

/**
 * Interfaz para opciones de recuperación
 */
export interface RecoveryOptions {
  continueFromLastTrack: boolean;
  skipFailedTracks: boolean;
  retryFailedTracks: boolean;
}

/**
 * Gestor de recuperación de progreso para manejar procesos interrumpidos
 */
export class ProgressRecovery {
  private readonly progressDir = './.spotify-tidal-progress';
  private readonly progressFile = `${this.progressDir}/progress.json`;
  private currentState: ProgressState | null = null;

  constructor() {
    this.ensureProgressDirectory();
  }

  /**
   * Guardar el estado actual del progreso en disco
   */
  async saveProgress(state: ProgressState): Promise<void> {
    try {
      this.currentState = state;
      const stateWithTimestamp = {
        ...state,
        timestamp: new Date()
      };

      await fs.writeFile(
        this.progressFile,
        JSON.stringify(stateWithTimestamp, null, 2),
        'utf8'
      );
    } catch (error) {
      console.warn('Error al guardar el progreso:', error instanceof Error ? error.message : 'Error desconocido');
    }
  }

  /**
   * Cargar el estado del progreso desde disco
   */
  async loadProgress(): Promise<ProgressState | null> {
    try {
      const data = await fs.readFile(this.progressFile, 'utf8');
      const state = JSON.parse(data) as ProgressState;

      // Convertir timestamp de vuelta a objeto Date
      state.timestamp = new Date(state.timestamp);

      this.currentState = state;
      return state;
    } catch (error) {
      // El archivo no existe o está corrupto
      return null;
    }
  }

  /**
   * Verificar si hay un estado de progreso recuperable
   */
  async hasRecoverableProgress(): Promise<boolean> {
    const state = await this.loadProgress();
    if (!state) {
      return false;
    }

    // Verificar si el progreso es reciente (dentro de las últimas 24 horas)
    const now = new Date();
    const timeDiff = now.getTime() - state.timestamp.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    return hoursDiff < 24;
  }

  /**
   * Obtener resumen de recuperación para mostrar al usuario
   */
  async getRecoverySummary(): Promise<string | null> {
    const state = await this.loadProgress();
    if (!state) {
      return null;
    }

    const processedCount = state.processedTracks.length;
    const successfulCount = state.processedTracks.filter(t => t.success).length;
    const failedCount = state.processedTracks.filter(t => !t.success).length;
    const completedPlaylistsCount = state.completedPlaylists.length;

    return `
Sesión anterior encontrada:
- ID de sesión: ${state.sessionId}
- Última actualización: ${state.timestamp.toLocaleString()}
- Lista actual: ${state.currentPlaylist.name} (${processedCount}/${state.currentPlaylist.totalTracks} canciones procesadas)
- Canciones exitosas: ${successfulCount}
- Canciones fallidas: ${failedCount}
- Listas completadas: ${completedPlaylistsCount}
    `.trim();
  }

  /**
   * Crear un nuevo estado de progreso para una lista de reproducción
   */
  createProgressState(playlist: Playlist, sessionId?: string): ProgressState {
    return {
      sessionId: sessionId || this.generateSessionId(),
      timestamp: new Date(),
      currentPlaylist: {
        id: playlist.id,
        name: playlist.name,
        totalTracks: playlist.totalTracks
      },
      processedTracks: [],
      completedPlaylists: [],
      failedTracks: []
    };
  }

  /**
   * Actualizar el estado del progreso con el resultado del procesamiento de la canción
   */
  updateTrackProgress(
    trackId: string,
    success: boolean,
    tidalTrackId?: number,
    error?: string
  ): void {
    if (!this.currentState) {
      return;
    }

    // Remover cualquier entrada existente para esta canción
    this.currentState.processedTracks = this.currentState.processedTracks.filter(
      t => t.trackId !== trackId
    );

    // Agregar nueva entrada
    this.currentState.processedTracks.push({
      trackId,
      success,
      tidalTrackId,
      error
    });
  }

  /**
   * Marcar lista de reproducción como completada
   */
  markPlaylistCompleted(playlistId: string): void {
    if (!this.currentState) {
      return;
    }

    if (!this.currentState.completedPlaylists.includes(playlistId)) {
      this.currentState.completedPlaylists.push(playlistId);
    }
  }

  /**
   * Agregar canción fallida al estado
   */
  addFailedTrack(track: Track, reason: string, playlistId: string): void {
    if (!this.currentState) {
      return;
    }

    this.currentState.failedTracks.push({
      track,
      reason,
      playlistId
    });
  }

  /**
   * Obtener canciones que fueron procesadas exitosamente
   */
  getProcessedTracks(): { trackId: string; tidalTrackId?: number }[] {
    if (!this.currentState) {
      return [];
    }

    return this.currentState.processedTracks
      .filter(t => t.success && t.tidalTrackId)
      .map(t => ({ trackId: t.trackId, tidalTrackId: t.tidalTrackId! }));
  }

  /**
   * Obtener canciones que fallaron en el procesamiento
   */
  getFailedTracks(): { trackId: string; error?: string }[] {
    if (!this.currentState) {
      return [];
    }

    return this.currentState.processedTracks
      .filter(t => !t.success)
      .map(t => ({ trackId: t.trackId, error: t.error }));
  }

  /**
   * Obtener canciones que aún no han sido procesadas
   */
  getRemainingTracks(allTracks: Track[]): Track[] {
    if (!this.currentState) {
      return allTracks;
    }

    const processedTrackIds = new Set(
      this.currentState.processedTracks.map(t => t.trackId)
    );

    return allTracks.filter(track => !processedTrackIds.has(track.id));
  }

  /**
   * Limpiar el estado del progreso
   */
  async clearProgress(): Promise<void> {
    try {
      await fs.unlink(this.progressFile);
      this.currentState = null;
    } catch (error) {
      // El archivo no existe, lo cual está bien
    }
  }

  /**
   * Obtener el estado actual del progreso
   */
  getCurrentState(): ProgressState | null {
    return this.currentState;
  }

  /**
   * Asegurar que el directorio de progreso existe
   */
  private async ensureProgressDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.progressDir, { recursive: true });
    } catch (error) {
      // El directorio ya existe o no se puede crear
    }
  }

  /**
   * Generar un ID de sesión único
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calcular porcentaje de progreso
   */
  getProgressPercentage(): number {
    if (!this.currentState) {
      return 0;
    }

    const processed = this.currentState.processedTracks.length;
    const total = this.currentState.currentPlaylist.totalTracks;

    return total > 0 ? Math.round((processed / total) * 100) : 0;
  }

  /**
   * Obtener tiempo estimado restante basado en el progreso actual
   */
  getEstimatedTimeRemaining(startTime: Date): string {
    if (!this.currentState) {
      return 'Desconocido';
    }

    const processed = this.currentState.processedTracks.length;
    const total = this.currentState.currentPlaylist.totalTracks;
    const remaining = total - processed;

    if (processed === 0 || remaining === 0) {
      return 'Desconocido';
    }

    const elapsed = Date.now() - startTime.getTime();
    const avgTimePerTrack = elapsed / processed;
    const estimatedRemaining = avgTimePerTrack * remaining;

    const minutes = Math.ceil(estimatedRemaining / (1000 * 60));

    if (minutes < 1) {
      return 'Menos de 1 minuto';
    } else if (minutes === 1) {
      return '1 minuto';
    } else {
      return `${minutes} minutos`;
    }
  }
}