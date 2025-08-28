import { AuthManager } from './auth/AuthManager.js';
import { SpotifyService } from './services/SpotifyService.js';
import { TidalService } from './services/TidalService.js';
import { PlaylistSyncManager, SyncSummary } from './services/PlaylistSyncManager.js';
import { SongMatcher } from './matching/SongMatcher.js';
import { ProgressReporter } from './utils/ProgressReporter.js';
import { ConfigManager } from './config/ConfigManager.js';
import { Credentials } from './models/Auth.js';
import { FailedTrack } from './models/ImportResult.js';
import { InteractiveMenu } from './cli/InteractiveMenu.js';

export interface AppConfig {
  credentialsPath: string;
  autoMode: boolean;
  maxRetries: number;
  batchSize: number;
  progressSaveInterval: number;
}

export interface AppState {
  isAuthenticated: boolean;
  currentOperation?: string;
  processedPlaylists: string[];
  failedTracks: FailedTrack[];
  startTime?: Date;
  lastSaveTime?: Date;
}

export class SpotifyTidalApp {
  private authManager: AuthManager;
  private configManager: ConfigManager;
  private progressReporter: ProgressReporter;
  private playlistSyncManager?: PlaylistSyncManager;
  private config: AppConfig;
  private state: AppState;
  private shutdownRequested = false;

  constructor(config: Partial<AppConfig> = {}) {
    this.config = {
      credentialsPath: './credentials.txt',
      autoMode: true,
      maxRetries: 3,
      batchSize: 10,
      progressSaveInterval: 30000, // 30 seconds
      ...config
    };

    this.state = {
      isAuthenticated: false,
      processedPlaylists: [],
      failedTracks: []
    };

    this.authManager = new AuthManager();
    this.configManager = new ConfigManager();
    this.progressReporter = new ProgressReporter();

    // Setup graceful shutdown handlers
    this.setupShutdownHandlers();
  }

  /**
   * Punto de entrada principal de la aplicación con manejo integral de errores
   * Requisitos: 1.1, 1.2, 2.1, 2.2, 3.1, 4.1, 6.3, 6.4, 7.6
   */
  async run(): Promise<void> {
    try {
      this.state.startTime = new Date();

      // Paso 1: Validación y configuración de credenciales
      await this.validateAndSetupCredentials();

      // Paso 2: Autenticación
      const services = await this.authenticateServices();

      // Paso 3: Elegir entre menú interactivo o sincronización automática
      if (this.config.autoMode) {
        // Modo automático original
        this.initializeSyncManager(services);
        const syncSummary = await this.performPlaylistSync();
        await this.generateFinalReport(syncSummary);
        console.log('\n✅ Aplicación completada exitosamente!');
      } else {
        // Nuevo modo interactivo
        const interactiveMenu = new InteractiveMenu({
          spotifyService: services.spotifyService,
          tidalService: services.tidalService
        });
        await interactiveMenu.showMainMenu();
      }

    } catch (error) {
      await this.handleCriticalError(error);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Validar credenciales y guiar al usuario a través de la configuración si es necesario
   * Requisitos: 1.3
   */
  private async validateAndSetupCredentials(): Promise<void> {
    this.state.currentOperation = 'credential_validation';

    try {
      // Verificar si el archivo de credenciales existe
      if (!(await this.configManager.checkCredentialsExistAsync(this.config.credentialsPath))) {
        console.log('📝 Creando archivo de credenciales...');
        await this.configManager.createCredentialsTemplate(this.config.credentialsPath);
        await this.waitForCredentialsUpdate();
        return;
      }

      // Validar credenciales existentes
      const validation = await this.configManager.validateCredentialsFile(this.config.credentialsPath);

      if (!validation.isValid) {
        console.log('❌ Credenciales inválidas o incompletas:');
        validation.missingFields.forEach(field => console.log(`  - Falta: ${field}`));
        validation.errors.forEach(error => console.log(`  - Error: ${error}`));

        await this.waitForCredentialsUpdate();
        return;
      }

      console.log('✅ Credenciales validadas correctamente');

    } catch (error) {
      console.error('❌ Error en validación de credenciales:', error instanceof Error ? error.message : 'Error desconocido');
      throw error;
    }
  }

  /**
   * Esperar a que el usuario actualice las credenciales y reintentar validación
   */
  private async waitForCredentialsUpdate(): Promise<void> {
    const inquirer = await import('inquirer');

    console.log('\n💡 Por favor, actualiza el archivo de credenciales con tus Client ID y Client Secret:');
    console.log(`📁 Archivo: ${this.config.credentialsPath}`);
    console.log('\n📋 Necesitas obtener las credenciales de:');
    console.log('  🎵 Spotify: https://developer.spotify.com/dashboard');
    console.log('  🌊 Tidal: https://developer.tidal.com/dashboard');
    console.log('\n📋 Tambien necesitas poner en la redirect uri de las dos plataformas la siguiente url:');
    console.log('\n📋 http://127.0.0.1:8888/callback');

    while (true) {
      const { ready } = await inquirer.default.prompt([
        {
          type: 'confirm',
          name: 'ready',
          message: '¿Ya actualizaste el archivo de credenciales?',
          default: false
        }
      ]);

      if (ready) {
        // Re-validar credenciales
        try {
          const validation = await this.configManager.validateCredentialsFile(this.config.credentialsPath);

          if (validation.isValid) {
            console.log('✅ Credenciales validadas correctamente');
            return;
          } else {
            console.log('\n❌ Las credenciales siguen siendo inválidas:');
            validation.missingFields.forEach(field => console.log(`  - Falta: ${field}`));
            validation.errors.forEach(error => console.log(`  - Error: ${error}`));
            console.log('\n🔄 Por favor, revisa y corrige el archivo de credenciales.\n');
          }
        } catch (error) {
          console.log('\n❌ Error al validar credenciales:', error instanceof Error ? error.message : 'Error desconocido');
          console.log('🔄 Por favor, revisa el archivo de credenciales.\n');
        }
      } else {
        console.log('\n⏳ Tómate tu tiempo. Presiona Enter cuando hayas actualizado las credenciales.\n');
      }
    }
  }

  /**
   * Autenticar con ambos servicios con lógica de reintento
   */
  private async authenticateServices(): Promise<{ spotifyService: SpotifyService; tidalService: TidalService }> {
    this.state.currentOperation = 'authentication';

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`🔐 Autenticando servicios (intento ${attempt}/${this.config.maxRetries})...`);

        const credentials = await this.authManager.loadCredentialsFromFile(this.config.credentialsPath);

        // Inicio de autentificacion
        console.log('🔐 Iniciando autenticación de usuario...');

        // Paso uno: Tidal (No conozco bien la API)
        console.log('1️⃣ Autenticando con Tidal...');
        const tidalToken = await this.retryOperation(
          () => this.authManager.authenticateTidalUser(
            credentials.tidalClientId,
            ['user.read', 'playlists.read', 'playlists.write', 'collection.read', 'collection.write']
          ),
          'Tidal user authentication'
        );
        console.log('✅ Tidal autenticado exitosamente!');

        // Paso dos: Spotify (esta si)
        console.log('2️⃣ Autenticando con Spotify...');
        const spotifyToken = await this.retryOperation(
          () => this.authManager.authenticateSpotifyUser(
            credentials.spotifyClientId,
            ['user-read-private', 'playlist-read-private', 'playlist-modify-public', 'playlist-modify-private']
          ),
          'Spotify user authentication'
        );
        console.log('✅ Spotify autenticado exitosamente!');

        const services = {
          spotifyService: new SpotifyService(spotifyToken),
          tidalService: new TidalService(tidalToken)
        };

        this.state.isAuthenticated = true;
        console.log('✅ Autenticación exitosa con ambos servicios');

        return services;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Authentication failed');

        if (attempt < this.config.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Reintentando en ${delay / 1000} segundos...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Falló la autenticación después de ${this.config.maxRetries} intentos: ${lastError?.message}`);
  }

  /**
   * Inicio los servicios de sincronizado
   */
  private initializeSyncManager(services: { spotifyService: SpotifyService; tidalService: TidalService }): void {
    const songMatcher = new SongMatcher(services.tidalService);
    this.playlistSyncManager = new PlaylistSyncManager(
      services.spotifyService,
      services.tidalService,
      songMatcher
    );
  }


  private async performPlaylistSync(): Promise<SyncSummary> {
    if (!this.playlistSyncManager) {
      throw new Error('PlaylistSyncManager not initialized');
    }

    this.state.currentOperation = 'playlist_sync';

    console.log('🚀 Iniciando sincronización automática de playlists...');

    // Start progress saving interval
    const progressSaveInterval = setInterval(() => {
      this.savePartialProgress();
    }, this.config.progressSaveInterval);

    try {
      
      const syncSummary = await this.playlistSyncManager.performFullSync();

      
      this.state.processedPlaylists = syncSummary.results.map(r => r.playlistName);

      
      syncSummary.results.forEach(result => {
        if (result.errors && result.errors.length > 0) {
          result.errors.forEach(error => {
            this.state.failedTracks.push({
              track: {
                id: '',
                title: 'Unknown',
                artists: [{ id: '', name: 'Unknown' }],
                album: { id: '', name: 'Unknown' },
                duration: 0
              },
              reason: error,
              searchAttempts: []
            });
          });
        }
      });

      console.log('✅ Sincronización completada');
      return syncSummary;

    } finally {
      clearInterval(progressSaveInterval);
    }
  }


  private async generateFinalReport(syncSummary: SyncSummary): Promise<void> {
    console.log('\n📊 Generando reporte final...');


    this.progressReporter.displaySyncSummary({
      totalPlaylists: syncSummary.totalPlaylists,
      playlistsCreated: syncSummary.playlistsCreated,
      playlistsUpdated: syncSummary.playlistsUpdated,
      totalTracks: syncSummary.totalTracksProcessed,
      successfulTracks: syncSummary.totalTracksSuccessful,
      failedTracks: syncSummary.totalTracksFailed,
      processingTime: this.state.startTime ? Date.now() - this.state.startTime.getTime() : 0
    });


    if (this.state.failedTracks.length > 0) {
      await this.progressReporter.generateReport(this.state.failedTracks);
    }

    await this.savePartialProgress();
  }


  private async handleCriticalError(error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';

    console.error('\n❌ Error crítico:', errorMessage);

  
    await this.savePartialProgress();


    if (errorMessage.includes('credentials') || errorMessage.includes('authentication')) {
      console.log('\n💡 Sugerencias:');
      console.log('  - Verifica que tus credenciales sean correctas');
      console.log('  - Asegúrate de que las aplicaciones estén configuradas correctamente');
      console.log('  - Revisa tu conexión a internet');
    } else if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
      console.log('\n💡 Sugerencias:');
      console.log('  - Verifica tu conexión a internet');
      console.log('  - Intenta ejecutar la aplicación más tarde');
      console.log('  - Los servicios pueden estar temporalmente no disponibles');
    } else {
      console.log('\n💡 El progreso parcial ha sido guardado. Puedes reintentar la operación.');
    }

    process.exit(1);
  }


  private async savePartialProgress(): Promise<void> {
    if (this.shutdownRequested) return;

    try {
      const progressData = {
        timestamp: new Date().toISOString(),
        state: this.state,
        config: this.config
      };

      const fs = await import('fs/promises');
      await fs.writeFile('.spotify-tidal-progress.json', JSON.stringify(progressData, null, 2));

      this.state.lastSaveTime = new Date();

    } catch (error) {
      console.warn('⚠️ No se pudo guardar el progreso:', error instanceof Error ? error.message : 'Error desconocido');
    }
  }


  private async loadPartialProgress(): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const progressData = await fs.readFile('.spotify-tidal-progress.json', 'utf-8');
      const parsed = JSON.parse(progressData);

      this.state = { ...this.state, ...parsed.state };
      console.log('📂 Progreso anterior cargado');

      return true;
    } catch (error) {
      // que bien, no habia pizza
      return false;
    }
  }


  private setupShutdownHandlers(): void {
    const gracefulShutdown = async (signal: string) => {
      if (this.shutdownRequested) return;

      console.log(`\n⚠️ Recibida señal ${signal}. Cerrando aplicación graciosamente...`);
      this.shutdownRequested = true;

      // Save current progress
      await this.savePartialProgress();

      console.log('💾 Progreso guardado. La aplicación se puede reanudar más tarde.');
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  
    process.on('uncaughtException', async (error) => {
      console.error('💥 Excepción no capturada:', error);
      await this.savePartialProgress();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      console.error('💥 Promesa rechazada no manejada:', reason);
      await this.savePartialProgress();
      process.exit(1);
    });
  }

  //Esto me dolio demasiado soy pesimo para los numeros
  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = this.config.maxRetries
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(`${operationName} failed`);

        if (this.isRateLimitError(error)) {
          const delay = this.calculateRateLimitDelay(error);
          console.log(`⏳ Rate limit detectado. Esperando ${delay / 1000} segundos...`);
          await this.sleep(delay);
          continue;
        }

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`⏳ ${operationName} falló. Reintentando en ${delay / 1000} segundos... (${attempt}/${maxRetries})`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`${operationName} falló después de ${maxRetries} intentos: ${lastError?.message}`);
  }

  /**
   * Chequeo de errores en el limite de request
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('429');
    }
    return false;
  }

  private calculateRateLimitDelay(error: unknown): number {
    // Perfiero esto a un magic number
    return 60000;
  }


  private async cleanup(): Promise<void> {

    console.log('🧹 Limpiando recursos...');

    await this.savePartialProgress();
  }


  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  getState(): AppState {
    return { ...this.state };
  }


  getConfig(): AppConfig {
    return { ...this.config };
  }
}