import { AxiosError } from 'axios';
import { promises as fs } from 'fs';
import path from 'path';

export interface ErrorLogEntry {
  timestamp: string;
  method: string;
  url: string;
  fullUrl: string;
  statusCode: number;
  statusText: string;
  requestData?: any;
  responseData?: any;
  headers?: any;
  params?: any;
  errorMessage: string;
}

export interface TrackNotFoundLogEntry {
  timestamp: string;
  type: 'track_not_found';
  track: {
    title: string;
    artist: string;
    album: string;
    spotifyId: string;
  };
  searchAttempts: {
    query: string;
    url: string;
    description: string;
  }[];
  context: 'import' | 'sync';
  errorMessage?: string;
}

export class ErrorLogger {
  private static logDir = './logs';
  private static logFile = 'tidal-errors.json';
  private static trackNotFoundLogFile = 'tracks-not-found.json';

  /**
   * Registrar un error 400 con información detallada
   */
  static async log400Error(error: AxiosError, context?: string): Promise<void> {
    if (!error.response || error.response.status !== 400) {
      return;
    }

    try {
      // Asegurar que el directorio de logs existe
      await this.ensureLogDirectory();

      const logEntry: ErrorLogEntry = {
        timestamp: new Date().toISOString(),
        method: error.config?.method?.toUpperCase() || 'UNKNOWN',
        url: error.config?.url || 'UNKNOWN',
        fullUrl: this.buildFullUrl(error),
        statusCode: error.response.status,
        statusText: error.response.statusText,
        requestData: error.config?.data ? this.safeParseJSON(error.config.data) : undefined,
        responseData: error.response.data,
        headers: error.config?.headers,
        params: error.config?.params,
        errorMessage: error.message
      };

      // Agregar contexto si se proporciona
      if (context) {
        (logEntry as any).context = context;
      }

      await this.writeLogEntry(logEntry);

      console.log(`📝 Error 400 registrado en: ${path.join(this.logDir, this.logFile)}`);

    } catch (logError) {
      console.error('❌ Error al registrar el error:', logError);
    }
  }

  /**
   * Construir la URL completa desde la configuración de error de axios
   */
  private static buildFullUrl(error: AxiosError): string {
    const baseURL = error.config?.baseURL || '';
    const url = error.config?.url || '';
    const params = error.config?.params;

    let fullUrl = `${baseURL}${url}`;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.keys(params).forEach(key => {
        searchParams.append(key, params[key]);
      });
      fullUrl += `?${searchParams.toString()}`;
    }

    return fullUrl;
  }

  /**
   * Parsear cadena JSON de forma segura
   */
  private static safeParseJSON(data: any): any {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  }

  /**
   * Asegurar que el directorio de logs existe
   */
  private static async ensureLogDirectory(): Promise<void> {
    try {
      await fs.access(this.logDir);
    } catch {
      await fs.mkdir(this.logDir, { recursive: true });
    }
  }

  /**
   * Escribir entrada de log al archivo
   */
  private static async writeLogEntry(logEntry: ErrorLogEntry): Promise<void> {
    const logPath = path.join(this.logDir, this.logFile);

    let existingLogs: ErrorLogEntry[] = [];

    // Intentar leer logs existentes
    try {
      const existingData = await fs.readFile(logPath, 'utf-8');
      existingLogs = JSON.parse(existingData);
    } catch {
      // El archivo no existe o es inválido, comenzar con array vacío
      existingLogs = [];
    }

    // Agregar nueva entrada de log
    existingLogs.push(logEntry);

    // Mantener solo las últimas 100 entradas para evitar que el archivo crezca demasiado
    if (existingLogs.length > 100) {
      existingLogs = existingLogs.slice(-100);
    }

    // Escribir de vuelta al archivo
    await fs.writeFile(logPath, JSON.stringify(existingLogs, null, 2), 'utf-8');
  }

  /**
   * Obtener logs de errores recientes
   */
  static async getRecentLogs(limit: number = 10): Promise<ErrorLogEntry[]> {
    try {
      const logPath = path.join(this.logDir, this.logFile);
      const data = await fs.readFile(logPath, 'utf-8');
      const logs: ErrorLogEntry[] = JSON.parse(data);
      return logs.slice(-limit);
    } catch {
      return [];
    }
  }

  /**
   * Loggear una canción que no se pudo encontrar en Tidal
   */
  static async logTrackNotFound(
    track: { title: string; artist: string; album: string; spotifyId: string },
    searchAttempts: { query: string; url: string; description: string }[],
    context: 'import' | 'sync',
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.ensureLogDirectory();

      const logEntry: TrackNotFoundLogEntry = {
        timestamp: new Date().toISOString(),
        type: 'track_not_found',
        track,
        searchAttempts,
        context,
        errorMessage
      };

      await this.writeTrackNotFoundLogEntry(logEntry);

      console.log(`📝 Canción no encontrada registrada: "${track.title}" por ${track.artist}`);

    } catch (logError) {
      console.warn('⚠️ Error al registrar canción no encontrada:', logError);
    }
  }

  /**
   * Escribir entrada de log de canción no encontrada
   */
  private static async writeTrackNotFoundLogEntry(logEntry: TrackNotFoundLogEntry): Promise<void> {
    const logPath = path.join(this.logDir, this.trackNotFoundLogFile);

    let existingLogs: TrackNotFoundLogEntry[] = [];

    try {
      const existingData = await fs.readFile(logPath, 'utf-8');
      existingLogs = JSON.parse(existingData);
    } catch {
      existingLogs = [];
    }

    existingLogs.push(logEntry);

    // Mantener solo las últimas 500 entradas
    if (existingLogs.length > 500) {
      existingLogs = existingLogs.slice(-500);
    }

    await fs.writeFile(logPath, JSON.stringify(existingLogs, null, 2), 'utf-8');
  }

  /**
   * Obtener logs de canciones no encontradas
   */
  static async getTrackNotFoundLogs(limit: number = 20): Promise<TrackNotFoundLogEntry[]> {
    try {
      const logPath = path.join(this.logDir, this.trackNotFoundLogFile);
      const data = await fs.readFile(logPath, 'utf-8');
      const logs: TrackNotFoundLogEntry[] = JSON.parse(data);
      return logs.slice(-limit).reverse(); // Más recientes primero
    } catch {
      return [];
    }
  }

  /**
   * Limpiar todos los logs
   */
  static async clearLogs(): Promise<void> {
    try {
      const logPath = path.join(this.logDir, this.logFile);
      await fs.writeFile(logPath, '[]', 'utf-8');
      console.log('🧹 Logs de errores limpiados');
    } catch (error) {
      console.error('❌ Error al limpiar los logs:', error);
    }
  }

  /**
   * Limpiar logs de canciones no encontradas
   */
  static async clearTrackNotFoundLogs(): Promise<void> {
    try {
      const logPath = path.join(this.logDir, this.trackNotFoundLogFile);
      await fs.writeFile(logPath, '[]', 'utf-8');
      console.log('🧹 Logs de canciones no encontradas limpiados');
    } catch (error) {
      console.error('❌ Error al limpiar los logs de canciones no encontradas:', error);
    }
  }
}