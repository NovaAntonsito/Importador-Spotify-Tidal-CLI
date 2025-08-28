import os from 'os';
import path from 'path';
import fs from 'fs';

/**
 * Utilidad para manejar rutas de configuración del sistema
 */
export class ConfigPaths {
    private static readonly APP_NAME = 'spotify-tidal-importer';
    
    /**
     * Obtiene la ruta del directorio de configuración de la aplicación
     */
    static getConfigDir(): string {
        const platform = os.platform();
        let configDir: string;
        
        switch (platform) {
            case 'win32':
                configDir = path.join(os.homedir(), 'AppData', 'Roaming', this.APP_NAME);
                break;
            case 'darwin':
                configDir = path.join(os.homedir(), 'Library', 'Application Support', this.APP_NAME);
                break;
            default: // Linux y otros Unix
                configDir = path.join(os.homedir(), '.config', this.APP_NAME);
                break;
        }
        
        return configDir;
    }
    
    /**
     * Obtiene la ruta del archivo de credenciales
     */
    static getCredentialsPath(): string {
        return path.join(this.getConfigDir(), 'credentials.txt');
    }
    
    /**
     * Obtiene la ruta del directorio de logs
     */
    static getLogsDir(): string {
        return path.join(this.getConfigDir(), 'logs');
    }
    
    /**
     * Crea los directorios de configuración si no existen
     */
    static ensureConfigDirs(): void {
        const configDir = this.getConfigDir();
        const logsDir = this.getLogsDir();
        
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
    }
    
    /**
     * Crea el archivo de credenciales template si no existe
     */
    static createCredentialsTemplate(): string {
        const credentialsPath = this.getCredentialsPath();
        
        if (!fs.existsSync(credentialsPath)) {
            const template = `# Credenciales de API para Spotify Tidal Importer
# Completá los valores con tus credenciales reales

# === TIDAL API ===
# Obtené tus credenciales en: https://developer.tidal.com/
TIDAL_CLIENT_ID=tu_tidal_client_id_aqui
TIDAL_CLIENT_SECRET=tu_tidal_client_secret_aqui

# === SPOTIFY API ===
# Obtené tus credenciales en: https://developer.spotify.com/dashboard
SPOTIFY_CLIENT_ID=tu_spotify_client_id_aqui
SPOTIFY_CLIENT_SECRET=tu_spotify_client_secret_aqui

# === CONFIGURACIÓN OAUTH ===
# URI de redirección (no cambiar a menos que sepas lo que hacés)
REDIRECT_URI=http://127.0.0.1:8888/callback
`;
            
            this.ensureConfigDirs();
            fs.writeFileSync(credentialsPath, template, 'utf8');
        }
        
        return credentialsPath;
    }
}