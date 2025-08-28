import axios from 'axios';
import { ConfigManager } from '../config/ConfigManager.js';
import { Credentials, AuthTokens } from '../models/Auth.js';
import { ManejadorErrores, CONFIGURACION_REINTENTO_PREDETERMINADA, ErrorAutenticacion } from '../utils/ErrorHandler.js';
import { OAuthServer } from './OAuthServer.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class AuthManager {
  private configManager: ConfigManager;
  private tokens: AuthTokens = {};
  private manejadorErrores: ManejadorErrores;

  constructor() {
    this.configManager = new ConfigManager();
    this.manejadorErrores = new ManejadorErrores(CONFIGURACION_REINTENTO_PREDETERMINADA);
  }

  /**
   * Carga las credenciales desde la ruta de archivo especificada usando ConfigManager
   */
  async loadCredentialsFromFile(filePath: string = './credentials.txt'): Promise<Credentials> {
    try {
      // Verificar si el archivo de credenciales existe, crear plantilla si no existe
      if (!(await this.configManager.checkCredentialsExistAsync(filePath))) {
        await this.configManager.createCredentialsTemplate(filePath);
        throw new Error(`Archivo de credenciales creado en ${filePath}. Por favor completá tus credenciales de API y ejecutá de nuevo.`);
      }

      // Validar archivo de credenciales
      const validation = await this.configManager.validateCredentialsFile(filePath);
      if (!validation.isValid) {
        throw new Error(`Credenciales inválidas: ${validation.errors.join(', ')}`);
      }

      // Parsear y devolver credenciales
      return await this.configManager.parseCredentials(filePath);
    } catch (error) {
      throw new Error(`Error al cargar credenciales: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * Autentica con Spotify usando el flujo de credenciales de cliente OAuth2 (para acceso al catálogo)
   */
  async authenticateSpotify(clientId: string, clientSecret: string): Promise<string> {
    return this.manejadorErrores.ejecutarConReintento(async () => {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const response = await axios.post('https://accounts.spotify.com/api/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );

      const { access_token, expires_in } = response.data;

      // Almacenar token con expiración
      this.tokens.spotifyToken = access_token;
      this.tokens.expiresAt = new Date(Date.now() + (expires_in * 1000));

      return access_token;
    }, 'spotify', 'authenticateSpotify');
  }

  /**
   * Autentica con Spotify usando el flujo de código de autorización (para acceso de usuario)
   * Esto permite acceso a las playlists del usuario y la capacidad de crear/modificar playlists
   * DE ESTO ESTOY ORGULLOSO, *Inserte a pepe argento con la camisa de racing*
   */
  async authenticateSpotifyUser(
    clientId: string,
    scopes: string[] = ['user-read-private', 'playlist-read-private', 'playlist-modify-public', 'playlist-modify-private'],
    port?: number
  ): Promise<string> {
    try {
      // Buscar puerto disponible
      const availablePort = port || await OAuthServer.findAvailablePort();
      const oauthServer = new OAuthServer(availablePort);

      // Generar desafío PKCE y estado
      const pkce = oauthServer.generatePKCEChallenge();
      const state = oauthServer.generateState();

      // Construir URL de autorización para Spotify
      const authUrl = this.buildSpotifyAuthorizationUrl(clientId, scopes, pkce.codeChallenge, state, oauthServer.getRedirectUri());

      console.log('\n🎵 Autorización de Usuario de Spotify Requerida');
      console.log('═══════════════════════════════════════');
      console.log('Para acceder a tus playlists de Spotify y crear nuevas, necesitás autorizar esta aplicación.');
      console.log('\n📋 Permisos solicitados:');
      scopes.forEach(scope => {
        switch (scope) {
          case 'user-read-private':
            console.log('  • Leer la información de tu perfil');
            break;
          case 'playlist-read-private':
            console.log('  • Leer tus playlists privadas');
            break;
          case 'playlist-modify-public':
            console.log('  • Crear y modificar tus playlists públicas');
            break;
          case 'playlist-modify-private':
            console.log('  • Crear y modificar tus playlists privadas');
            break;
          case 'user-library-read':
            console.log('  • Leer tus canciones y álbumes guardados');
            break;
          default:
            console.log(`  • ${scope}`);
        }
      });

      console.log('\n🌐 Abriendo navegador para autorización...');
      console.log(`Si el navegador no se abre automáticamente, visitá: ${authUrl}`);
      console.log('\n⏳ Esperando autorización (tiempo límite: 2 minutos)...');


      // Intentar abrir navegador
      await this.openBrowser(authUrl);

      // Esperar callback
      const result = await oauthServer.waitForCallback(120000); // 2 minutos de tiempo límite

      if (result.error) {
        throw new Error(`La autorización falló: ${result.error} - ${result.error_description}`);
      }

      if (!result.code) {
        throw new Error('No se recibió código de autorización');
      }

      // Verificar parámetro state
      if (result.state !== state) {
        throw new Error('Parámetro state inválido - posible ataque CSRF');
      }

      console.log('✅ ¡Autorización exitosa! Intercambiando código por token...');

      // Intercambiar código de autorización por token de acceso
      return await this.exchangeSpotifyCodeForToken(clientId, result.code, oauthServer.getRedirectUri(), pkce.codeVerifier);

    } catch (error) {
      console.error('❌ La autorización de usuario de Spotify falló:', error instanceof Error ? error.message : error);
      throw error;
    }
  }

  /**
   * Construir URL de autorización para OAuth de Spotify
   */
  private buildSpotifyAuthorizationUrl(
    clientId: string,
    scopes: string[],
    codeChallenge: string,
    state: string,
    redirectUri: string
  ): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: scopes.join(' '),
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      redirect_uri: redirectUri,
      state: state
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  /**
   * Intercambiar código de autorización de Spotify por token de acceso
   */
  private async exchangeSpotifyCodeForToken(
    clientId: string,
    code: string,
    redirectUri: string,
    codeVerifier: string
  ): Promise<string> {
    return this.manejadorErrores.ejecutarConReintento(async () => {
      const response = await axios.post('https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code: code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );

      const { access_token, expires_in, refresh_token } = response.data;

      // Almacenar tokens
      this.tokens.spotifyToken = access_token;
      this.tokens.spotifyRefreshToken = refresh_token;

      // Actualizar tiempo de expiración
      const newExpiresAt = new Date(Date.now() + (expires_in * 1000));
      if (!this.tokens.expiresAt || newExpiresAt < this.tokens.expiresAt) {
        this.tokens.expiresAt = newExpiresAt;
      }

      console.log('✅ ¡Token de usuario de Spotify obtenido exitosamente!');
      return access_token;
    }, 'spotify', 'exchangeSpotifyCodeForToken');
  }

  /**
   * Refrescar token de usuario de Spotify usando refresh token
   */
  async refreshSpotifyToken(clientId: string): Promise<string> {
    if (!this.tokens.spotifyRefreshToken) {
      throw new Error('No hay refresh token de Spotify disponible. Por favor re-autenticá.');
    }

    return this.manejadorErrores.ejecutarConReintento(async () => {
      const response = await axios.post('https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.tokens.spotifyRefreshToken!,
          client_id: clientId
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );

      const { access_token, expires_in, refresh_token } = response.data;

      // Actualizar tokens
      this.tokens.spotifyToken = access_token;
      if (refresh_token) {
        this.tokens.spotifyRefreshToken = refresh_token;
      }
      this.tokens.expiresAt = new Date(Date.now() + (expires_in * 1000));

      console.log('✅ ¡Token de Spotify refrescado exitosamente!');
      return access_token;
    }, 'spotify', 'refreshSpotifyToken');
  }

  /**
   * Autentica con Tidal usando el flujo de credenciales de cliente (para acceso al catálogo)
   */
  async authenticateTidal(clientId: string, clientSecret: string): Promise<string> {
    return this.manejadorErrores.ejecutarConReintento(async () => {
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      });

      const response = await axios.post('https://auth.tidal.com/v1/oauth2/token', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });

      const { access_token, expires_in } = response.data;

      // Almacenar token con expiración
      this.tokens.tidalToken = access_token;

      // Actualizar tiempo de expiración (usar el más corto de los dos si ambos existen)
      const newExpiresAt = new Date(Date.now() + (expires_in * 1000));
      if (!this.tokens.expiresAt || newExpiresAt < this.tokens.expiresAt) {
        this.tokens.expiresAt = newExpiresAt;
      }

      return access_token;
    }, 'tidal', 'authenticateTidal');
  }

  /**
   * Autentica con Tidal usando el flujo de código de autorización (para acceso de usuario)
   * Esto permite acceso a las playlists del usuario y la capacidad de crear/modificar playlists
   */
  async authenticateTidalUser(
    clientId: string,
    scopes: string[] = ['user.read', 'playlists.read', 'playlists.write', 'collection.read', 'collection.write'],
    port?: number
  ): Promise<string> {
    try {
      // Buscar puerto disponible
      const availablePort = port || await OAuthServer.findAvailablePort();
      const oauthServer = new OAuthServer(availablePort);

      // Generar desafío PKCE y estado
      const pkce = oauthServer.generatePKCEChallenge();
      const state = oauthServer.generateState();

      // Construir URL de autorización para Tidal
      const authUrl = this.buildTidalAuthorizationUrl(clientId, scopes, pkce.codeChallenge, state, oauthServer.getRedirectUri());

      console.log('\n🔐 Autorización de Usuario de Tidal Requerida');
      console.log('═══════════════════════════════════════');
      console.log('Para acceder a tus playlists de Tidal y crear nuevas, necesitás autorizar esta aplicación.');
      console.log('\n📋 Permisos solicitados:');
      scopes.forEach(scope => {
        switch (scope) {
          case 'user.read':
            console.log('  • Leer la información de tu perfil');
            break;
          case 'playlists.read':
            console.log('  • Leer tus playlists');
            break;
          case 'playlists.write':
            console.log('  • Crear y modificar tus playlists');
            break;
          case 'collection.read':
            console.log('  • Leer tu colección de música');
            break;
          case 'collection.write':
            console.log('  • Modificar tu colección de música');
            break;
          default:
            console.log(`  • ${scope}`);
        }
      });

      console.log('\n🌐 Abriendo navegador para autorización...');
      console.log(`Si el navegador no se abre automáticamente, visitá: ${authUrl}`);
      console.log('\n⏳ Esperando autorización (tiempo límite: 2 minutos)...');

      // Intentar abrir navegador
      await this.openBrowser(authUrl);

      // Esperar callback
      const result = await oauthServer.waitForCallback(120000); // 2 minutos de tiempo límite

      if (result.error) {
        throw new Error(`La autorización falló: ${result.error} - ${result.error_description}`);
      }

      if (!result.code) {
        throw new Error('No se recibió código de autorización');
      }

      // Verificar parámetro state
      if (result.state !== state) {
        throw new Error('Parámetro state inválido - posible ataque CSRF');
      }

      console.log('✅ ¡Autorización exitosa! Intercambiando código por token...');

      // Intercambiar código de autorización por token de acceso
      const token = await this.exchangeCodeForToken(clientId, result.code, oauthServer.getRedirectUri(), pkce.codeVerifier);
      console.log('✅ ¡Token de usuario de Tidal obtenido exitosamente!');
      return token;

    } catch (error) {
      console.error('❌ La autorización de usuario de Tidal falló:', error instanceof Error ? error.message : error);
      throw error;
    }
  }

  /**
   * Intercambiar código de autorización por token de acceso
   */
  private async exchangeCodeForToken(
    clientId: string,
    code: string,
    redirectUri: string,
    codeVerifier: string
  ): Promise<string> {
    return this.manejadorErrores.ejecutarConReintento(async () => {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      });

      const response = await axios.post('https://auth.tidal.com/v1/oauth2/token', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });

      const { access_token, expires_in, refresh_token } = response.data;

      // Almacenar tokens
      this.tokens.tidalToken = access_token;
      this.tokens.tidalRefreshToken = refresh_token;

      // Actualizar tiempo de expiración
      const newExpiresAt = new Date(Date.now() + (expires_in * 1000));
      if (!this.tokens.expiresAt || newExpiresAt < this.tokens.expiresAt) {
        this.tokens.expiresAt = newExpiresAt;
      }

      console.log('✅ ¡Token de usuario de Tidal obtenido exitosamente!');
      return access_token;
    }, 'tidal', 'exchangeCodeForToken');
  }

  /**
   * Refrescar token de usuario de Tidal usando refresh token
   */
  async refreshTidalToken(): Promise<string> {
    if (!this.tokens.tidalRefreshToken) {
      throw new Error('No hay refresh token disponible. Por favor re-autenticá.');
    }

    return this.manejadorErrores.ejecutarConReintento(async () => {
      const response = await axios.post('https://auth.tidal.com/v1/oauth2/token', {
        grant_type: 'refresh_token',
        refresh_token: this.tokens.tidalRefreshToken
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const { access_token, expires_in } = response.data;

      // Actualizar token
      this.tokens.tidalToken = access_token;
      this.tokens.expiresAt = new Date(Date.now() + (expires_in * 1000));

      console.log('✅ ¡Token de Tidal refrescado exitosamente!');
      return access_token;
    }, 'tidal', 'refreshTidalToken');
  }

  /**
   * Construir URL de autorización para OAuth de Tidal
   */
  private buildTidalAuthorizationUrl(
    clientId: string,
    scopes: string[],
    codeChallenge: string,
    state: string,
    redirectUri: string
  ): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: scopes.join(' '),
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      redirect_uri: redirectUri,
      state: state
    });

    return `https://login.tidal.com/authorize?${params.toString()}`;
  }

  /**
   * Abrir navegador en la URL de autorización
   */
  private async openBrowser(url: string): Promise<void> {
    try {
      const platform = process.platform;
      let command: string;

      switch (platform) {
        case 'darwin': // macOS
          command = `open "${url}"`;
          break;
        case 'win32': // Windows
          command = `start "" "${url}"`;
          break;
        default: // Linux y otros
          command = `xdg-open "${url}"`;
          break;
      }

      await execAsync(command);
    } catch (error) {
      console.warn('No se pudo abrir el navegador automáticamente. Por favor abrí la URL manualmente.');
    }
  }

  /**
   * Refresca los tokens si están expirados o a punto de expirar
   */
  async refreshTokens(): Promise<void> {
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutos de buffer

    // Verificar si los tokens necesitan refrescarse (expirados o por expirar pronto)
    if (!this.tokens.expiresAt || (this.tokens.expiresAt.getTime() - now.getTime()) < bufferTime) {
      throw new Error('El refresco de token requiere re-autenticación. Por favor autenticá de nuevo.');
    }

    // Nota: El flujo de credenciales de cliente no soporta refresh tokens
    // Los tokens necesitan ser re-solicitados cuando expiran
  }

  /**
   * Verifica si el manager tiene tokens válidos y no expirados
   */
  isAuthenticated(): boolean {
    if (!this.tokens.spotifyToken || !this.tokens.tidalToken || !this.tokens.expiresAt) {
      return false;
    }

    const now = new Date();
    const bufferTime = 5 * 60 * 1000;

    return (this.tokens.expiresAt.getTime() - now.getTime()) > bufferTime;
  }

  /**
   * Obtiene el token actual de Spotify
   */
  getSpotifyToken(): string | undefined {
    return this.tokens.spotifyToken;
  }

  /**
   * Obtiene el token actual de Tidal
   */
  getTidalToken(): string | undefined {
    return this.tokens.tidalToken;
  }

  /**
   * Obtiene el objeto de tokens actual
   */
  getTokens(): AuthTokens {
    return { ...this.tokens };
  }

  /**
   * Limpia todos los tokens almacenados
   */
  clearTokens(): void {
    this.tokens = {};
  }
}