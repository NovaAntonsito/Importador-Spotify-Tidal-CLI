#!/usr/bin/env node

import os from 'os';
import path from 'path';

function getConfigDir() {
    const platform = os.platform();
    const appName = 'spotify-tidal-importer';
    
    switch (platform) {
        case 'win32':
            return path.join(os.homedir(), 'AppData', 'Roaming', appName);
        case 'darwin':
            return path.join(os.homedir(), 'Library', 'Application Support', appName);
        default: // Linux y otros Unix
            return path.join(os.homedir(), '.config', appName);
    }
}

function showWelcomeMessage() {
    const configDir = getConfigDir();
    const credentialsPath = path.join(configDir, 'credentials.txt');
    
    console.log('\n🎵 ¡Spotify Tidal Importer instalado exitosamente!\n');
    console.log('📋 Configuración automática:\n');
    console.log('✅ El archivo de credenciales se creará automáticamente en:');
    console.log(`   📁 ${credentialsPath}\n`);
    console.log('🚀 Para comenzar, simplemente ejecutá:');
    console.log('   npx spotify-tidal-importer\n');
    console.log('📖 La aplicación te guiará paso a paso para:');
    console.log('   • Crear el archivo de credenciales');
    console.log('   • Obtener las credenciales de Spotify y Tidal');
    console.log('   • Configurar la autenticación OAuth\n');
    console.log('💡 Para más opciones:');
    console.log('   npx spotify-tidal-importer --help\n');
    console.log('🔗 Documentación: https://github.com/NovaAntonsito/Importador-Spotify-Tidal-CLI\n');
}

// Ejecutar solo si se instala globalmente o con npx
if (process.env.npm_config_global === 'true' || process.env.npm_execpath?.includes('npx')) {
    showWelcomeMessage();
}