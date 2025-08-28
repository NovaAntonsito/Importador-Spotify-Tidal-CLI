#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';
import gradient from 'gradient-string';
import chalkAnimation from 'chalk-animation';
import figlet from 'figlet';
import { createSpinner } from 'nanospinner';
import { SpotifyTidalApp, AppConfig } from '../SpotifyTidalApp.js';

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
            credentialsPath: './credentials.txt',
            maxRetries: 3,
            batchSize: 10,
            ...options
        };
    }

  
    async main(): Promise<void> {
        try {
            await this.showWelcome();

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

    /**
     * Display welcome screen with figlet and chalk animations
     * Requirements: 1.3
     */
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
        console.log(chalk.bold('\n🎵 Importador de Playlists de Spotify a Tidal\n'));
        console.log('Uso: spotify-tidal-importer [opciones]\n');
        console.log('Opciones:');
        console.log('  -m, --mode <modo>           Modo de operación: "auto" o "interactive" (por defecto: interactive)');
        console.log('  -c, --credentials <ruta>    Ruta al archivo de credenciales (por defecto: ./credentials.txt)');
        console.log('  -r, --max-retries <num>     Número máximo de reintentos (por defecto: 3)');
        console.log('  -b, --batch-size <num>      Tamaño del lote para procesamiento (por defecto: 10)');
        console.log('  -h, --help                  Mostrar este mensaje de ayuda\n');
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