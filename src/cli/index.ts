#!/usr/bin/env node

import chalk from 'chalk';
import gradient from 'gradient-string';
import chalkAnimation from 'chalk-animation';
import figlet from 'figlet';
import { SpotifyTidalApp, AppConfig } from '../SpotifyTidalApp.js';
import { ConfigPaths } from '../utils/ConfigPaths.js';
import { ConfigManager } from '../config/ConfigManager.js';

interface CLIOptions {
    mode?: 'interactive' | 'auto';
    credentialsPath?: string;
    maxRetries?: number;
    batchSize?: number;
}

export class SpotifyTidalCLI {
    private options: CLIOptions;

    constructor(options: CLIOptions = {}) {
        this.options = {
            mode: 'interactive', // Changed default to interactive
            credentialsPath: options.credentialsPath || ConfigPaths.getCredentialsPath(),
            maxRetries: 3,
            batchSize: 10,
            ...options
        };
    }

  
    async main(): Promise<void> {
        try {
            await this.showWelcome();
            await this.checkAndSetupCredentials();

            // Create app configuration from CLI options
            const appConfig: Partial<AppConfig> = {
                credentialsPath: this.options.credentialsPath,
                autoMode: this.options.mode === 'auto', // Interactive mode when false
                maxRetries: this.options.maxRetries,
                batchSize: this.options.batchSize
            };

            // Create and run the main application
            const app = new SpotifyTidalApp(appConfig);
            await app.run();

        } catch (error) {
            console.error(chalk.red('\n❌ Ha ocurrido un error:'));
            console.error(chalk.red(error instanceof Error ? error.message : 'Error desconocido'));
            process.exit(1);
        }
    }


   
    async showWelcome(): Promise<void> {
        console.clear();

        // Create figlet title
        const title = figlet.textSync('Spotify → Tidal', {
            font: 'Big',
            horizontalLayout: 'default',
            verticalLayout: 'default'
        });

        // Display animated title
        const rainbowTitle = chalkAnimation.rainbow(title);
        await this.sleep(2000);
        rainbowTitle.stop();

        // Display gradient subtitle
        console.log('\n' + gradient.pastel.multiline([
            '🎵 Importa tus playlists de Spotify a Tidal automáticamente',
            '🚀 Rápido, confiable y fácil de usar',
            '📊 Seguimiento detallado del progreso y reportes'
        ].join('\n')));

        console.log('\n' + chalk.gray('─'.repeat(60)));
        await this.sleep(1000);
    }

    /**
     * Verifica y configura las credenciales
     */
    async checkAndSetupCredentials(): Promise<void> {
        const configManager = new ConfigManager();
        const credentialsPath = this.options.credentialsPath!;
        
        // Verificar si el archivo de credenciales existe
        const credentialsExist = await configManager.checkCredentialsExistAsync(credentialsPath);
        
        if (!credentialsExist) {
            console.log(chalk.yellow('\n⚠️  Archivo de credenciales no encontrado'));
            console.log(chalk.cyan('📁 Creando archivo de configuración...'));
            
            try {
                const createdPath = await configManager.createCredentialsTemplate();
                
                console.log(chalk.green('\n✅ Archivo de credenciales creado exitosamente!'));
                console.log(chalk.white('\n📍 Ubicación: ') + chalk.cyan(createdPath));
                
                console.log(chalk.yellow('\n🔧 CONFIGURACIÓN REQUERIDA:'));
                console.log(chalk.white('Para usar esta aplicación, necesitás completar tus credenciales de API:'));
                console.log(chalk.white('\n1. 🎵 Spotify API:'));
                console.log(chalk.gray('   • Visitá: ') + chalk.blue('https://developer.spotify.com/dashboard'));
                console.log(chalk.gray('   • Creá una nueva aplicación'));
                console.log(chalk.gray('   • Copiá el Client ID y Client Secret'));
                
                console.log(chalk.white('\n2. 🌊 Tidal API:'));
                console.log(chalk.gray('   • Visitá: ') + chalk.blue('https://developer.tidal.com/'));
                console.log(chalk.gray('   • Registrate como desarrollador'));
                console.log(chalk.gray('   • Creá una aplicación y obtené las credenciales'));
                
                console.log(chalk.white('\n3. 📝 Completá el archivo:'));
                console.log(chalk.gray('   • Abrí el archivo en tu editor favorito'));
                console.log(chalk.gray('   • Reemplazá los valores placeholder con tus credenciales reales'));
                
                console.log(chalk.red('\n⚠️  La aplicación no puede continuar sin credenciales válidas.'));
                console.log(chalk.white('Una vez que completes el archivo, ejecutá el comando nuevamente.\n'));
                
                process.exit(0);
                
            } catch (error) {
                console.error(chalk.red('\n❌ Error al crear el archivo de credenciales:'));
                console.error(chalk.red(error instanceof Error ? error.message : 'Error desconocido'));
                process.exit(1);
            }
        }
        
        // Validar las credenciales existentes
        try {
            const validation = await configManager.validateCredentialsFile(credentialsPath);
            
            if (!validation.isValid) {
                console.log(chalk.yellow('\n⚠️  Credenciales incompletas o inválidas'));
                console.log(chalk.white('📍 Archivo: ') + chalk.cyan(credentialsPath));
                
                if (validation.missingFields.length > 0) {
                    console.log(chalk.red('\n❌ Campos faltantes o vacíos:'));
                    validation.missingFields.forEach(field => {
                        console.log(chalk.red(`   • ${field}`));
                    });
                }
                
                console.log(chalk.white('\n🔧 Por favor completá todas las credenciales requeridas y ejecutá el comando nuevamente.\n'));
                process.exit(1);
            }
            
            console.log(chalk.green('✅ Credenciales validadas correctamente'));
            
        } catch (error) {
            console.error(chalk.red('\n❌ Error al validar credenciales:'));
            console.error(chalk.red(error instanceof Error ? error.message : 'Error desconocido'));
            process.exit(1);
        }
    }



    /**
     * Parse command line arguments
     */
    static parseArguments(args: string[]): CLIOptions {
        const options: CLIOptions = {};

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];

            switch (arg) {
                case '--mode':
                case '-m':
                    const mode = args[i + 1];
                    if (mode === 'interactive' || mode === 'auto') {
                        options.mode = mode;
                        i++; // Skip next argument
                    }
                    break;

                case '--credentials':
                case '-c':
                    options.credentialsPath = args[i + 1];
                    i++; // Skip next argument
                    break;

                case '--max-retries':
                case '-r':
                    const retries = parseInt(args[i + 1]);
                    if (!isNaN(retries) && retries > 0) {
                        options.maxRetries = retries;
                        i++; // Skip next argument
                    }
                    break;

                case '--batch-size':
                case '-b':
                    const batchSize = parseInt(args[i + 1]);
                    if (!isNaN(batchSize) && batchSize > 0) {
                        options.batchSize = batchSize;
                        i++; // Skip next argument
                    }
                    break;

                case '--help':
                case '-h':
                    SpotifyTidalCLI.showHelp();
                    process.exit(0);
                    break;
            }
        }

        return options;
    }

    /**
     * Display help information
     */
    static showHelp(): void {
        const defaultCredentialsPath = ConfigPaths.getCredentialsPath();
        
        console.log(chalk.bold('\n🎵 Importador de Playlists de Spotify a Tidal\n'));
        console.log('Uso: spotify-tidal-importer [opciones]\n');
        console.log('Opciones:');
        console.log('  -m, --mode <modo>           Modo de operación: "auto" o "interactive" (por defecto: interactive)');
        console.log(`  -c, --credentials <ruta>    Ruta al archivo de credenciales`);
        console.log(`                              (por defecto: ${defaultCredentialsPath})`);
        console.log('  -r, --max-retries <num>     Número máximo de reintentos (por defecto: 3)');
        console.log('  -b, --batch-size <num>      Tamaño del lote para procesamiento (por defecto: 10)');
        console.log('  -h, --help                  Mostrar este mensaje de ayuda\n');
        console.log('📁 Configuración:');
        console.log(`   El archivo de credenciales se crea automáticamente en:`);
        console.log(`   ${chalk.cyan(defaultCredentialsPath)}\n`);
        console.log('Ejemplos:');
        console.log('  spotify-tidal-importer');
        console.log('  spotify-tidal-importer --mode interactive');
        console.log('  spotify-tidal-importer --credentials ./mis-credenciales.txt');
        console.log('  spotify-tidal-importer --max-retries 5 --batch-size 20\n');
    }

    /**
     * Utility function to pause execution
     */
    private sleep(ms: number = 2000): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const options = SpotifyTidalCLI.parseArguments(args);

    const cli = new SpotifyTidalCLI(options);
    await cli.main();
}

// Execute main function when this file is run directly
main().catch((error) => {
    console.error(chalk.red('Error fatal:'), error);
    process.exit(1);
}); 