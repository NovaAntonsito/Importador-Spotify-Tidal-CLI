# 🎵 CLI Importer Spotify → Tidal

Una herramienta CLI para importar playlists de Spotify a Tidal de manera fácil y rápida.

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
  - [1. Configurar Aplicación de Spotify](#1-configurar-aplicación-de-spotify)
  - [2. Configurar Aplicación de Tidal](#2-configurar-aplicación-de-tidal)
  - [3. Configurar Credenciales](#3-configurar-credenciales)
- [Uso](#-uso)
- [Solución de Problemas](#-solución-de-problemas)
- [Desarrollo](#-desarrollo)

## ✨ Características

- 🔄 Importación completa de playlists de Spotify a Tidal
- 🎯 Matching inteligente de canciones usando múltiples estrategias
- 🔐 Autenticación OAuth2 segura para ambas plataformas
- 📊 Reportes detallados de progreso y coincidencias
- 🛡️ Manejo robusto de errores con reintentos automáticos
- 💾 Recuperación de progreso en caso de interrupciones
- 🎨 Interfaz CLI interactiva y colorida

## 🔧 Requisitos Previos

- **Node.js** v18 o superior
- **npm** o **yarn**
- Cuenta activa de **Spotify**
- Cuenta activa de **Tidal** (con suscripción)

## 📦 Instalación

1. **Clonar el repositorio:**
   ```bash
   git clone <url-del-repositorio>
   cd cli-importer-spotify-tidal
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Compilar el proyecto:**
   ```bash
   npm run build
   ```

## ⚙️ Configuración

### 1. Configurar Aplicación de Spotify

1. **Ir al Dashboard de Spotify:**
   - Visitá [Spotify for Developers](https://developer.spotify.com/dashboard)
   - Iniciá sesión con tu cuenta de Spotify

2. **Crear una nueva aplicación:**
   - Hacé clic en "Create app"
   - Completá los campos:
     - **App name:** `Spotify Tidal Importer` (o el nombre que prefieras)
     - **App description:** `CLI tool for importing playlists from Spotify to Tidal`
     - **Website:** `http://localhost` (opcional)
     - **Redirect URI:** `http://127.0.0.1:8888/callback`
   - Aceptá los términos y hacé clic en "Save"

3. **Obtener credenciales:**
   - En el dashboard de tu aplicación, hacé clic en "Settings"
   - Copiá el **Client ID** y **Client Secret**
   - ⚠️ **Importante:** Agregá la URI de redirección `http://127.0.0.1:8888/callback` en la sección "Redirect URIs"

### 2. Configurar Aplicación de Tidal

1. **Ir al Portal de Desarrolladores de Tidal:**
   - Visitá [Tidal for Developers](https://developer.tidal.com/)
   - Iniciá sesión con tu cuenta de Tidal

2. **Crear una nueva aplicación:**
   - Hacé clic en "Create App" o "My Apps"
   - Completá los campos requeridos:
     - **App name:** `Spotify Tidal Importer`
     - **Description:** `CLI tool for importing playlists`
     - **Redirect URI:** `http://127.0.0.1:8888/callback`

3. **Obtener credenciales:**
   - Copiá el **Client ID** y **Client Secret** de tu aplicación
   - ⚠️ **Importante:** Asegurate de que la URI de redirección `http://127.0.0.1:8888/callback` esté configurada

### 3. Configurar Credenciales

1. **Crear archivo de credenciales:**
   - En la raíz del proyecto, creá o editá el archivo `credentials.txt`
   - Usá el siguiente formato:

   ```
   TIDAL_CLIENT_ID = tu_tidal_client_id_aqui
   TIDAL_CLIENT_SECRET = tu_tidal_client_secret_aqui

   ------------------------------

   SPOTIFY_CLIENT_ID = tu_spotify_client_id_aqui
   SPOTIFY_CLIENT_SECRET = tu_spotify_client_secret_aqui
   ```

2. **Ejemplo de archivo credentials.txt:**
   ```
   TIDAL_CLIENT_ID = abc123def456
   TIDAL_CLIENT_SECRET = xyz789uvw012345678901234567890abcdef

   ------------------------------

   SPOTIFY_CLIENT_ID = 1234567890abcdef1234567890abcdef
   SPOTIFY_CLIENT_SECRET = abcdef1234567890abcdef1234567890
   ```

⚠️ **Importante:** 
- No compartas este archivo públicamente
- Asegurate de que `credentials.txt` esté en tu `.gitignore`
- Las credenciales deben estar en una sola línea cada una

## 🚀 Uso

### Ejecutar la aplicación

```bash
# Modo desarrollo (recomendado para testing)
npm run dev

# Modo producción (después de compilar)
npm start
```

### Flujo de uso

1. **Iniciar la aplicación:**
   - Ejecutá `npm run dev`
   - La aplicación mostrará un menú interactivo

2. **Autenticación:**
   - Seleccioná la opción de importar playlists
   - Se abrirá automáticamente tu navegador para autenticar con Spotify
   - Después se abrirá otra ventana para autenticar con Tidal
   - Seguí las instrucciones en pantalla

3. **Seleccionar playlists:**
   - La aplicación mostrará todas tus playlists de Spotify
   - Seleccioná las que querés importar a Tidal

4. **Proceso de importación:**
   - La aplicación buscará cada canción en Tidal
   - Mostrará el progreso en tiempo real
   - Creará las playlists en Tidal con las canciones encontradas

5. **Reporte final:**
   - Al finalizar, verás un resumen detallado:
     - Canciones importadas exitosamente
     - Canciones no encontradas
     - Estadísticas de coincidencias

### Comandos disponibles

```bash
# Desarrollo
npm run dev          # Ejecutar en modo desarrollo
npm run build        # Compilar TypeScript
npm run type-check   # Verificar tipos sin compilar

# Testing
npm test             # Ejecutar tests
npm run test:watch   # Ejecutar tests en modo watch
npm run test:ui      # Interfaz web para tests

# Producción
npm start            # Ejecutar versión compilada
```

## 🔧 Solución de Problemas

### Error: "Puerto ya en uso"
```
Error: El puerto 8888 ya está en uso
```
**Solución:** Cerrá otras aplicaciones que puedan estar usando el puerto 8888, o esperá unos minutos y volvé a intentar.

### Error: "Credenciales inválidas"
```
Error: Invalid credentials
```
**Solución:** 
- Verificá que las credenciales en `credentials.txt` sean correctas
- Asegurate de que no haya espacios extra al principio o final
- Verificá que las URIs de redirección estén configuradas correctamente

### Error: "No se encontraron playlists"
```
⚠️ No se encontraron playlists en la respuesta
```
**Solución:**
- Asegurate de tener playlists en tu cuenta de Spotify
- Verificá que hayas autorizado correctamente ambas aplicaciones
- Intentá cerrar sesión y volver a autenticar

### Canciones no encontradas
Si muchas canciones no se encuentran en Tidal:
- Esto es normal, ya que los catálogos de música pueden diferir
- La aplicación usa múltiples estrategias de búsqueda para maximizar las coincidencias
- Podés revisar el log detallado para ver qué canciones no se encontraron

### Error de autenticación OAuth
```
Error: Authorization failed
```
**Solución:**
- Verificá que las URIs de redirección sean exactamente: `http://127.0.0.1:8888/callback`
- Asegurate de que las aplicaciones estén configuradas correctamente en ambas plataformas
- Intentá usar un navegador diferente o modo incógnito

## 🛠️ Desarrollo

### Estructura del proyecto

```
src/
├── auth/           # Manejo de autenticación OAuth
├── cli/            # Interfaz de línea de comandos
├── config/         # Configuración y credenciales
├── matching/       # Algoritmos de matching de canciones
├── models/         # Tipos y modelos de datos
├── services/       # Servicios de API (Spotify/Tidal)
└── utils/          # Utilidades y helpers
```

### Scripts de desarrollo

```bash
# Verificar tipos
npm run type-check

# Ejecutar tests
npm run test:watch

# Compilar y ejecutar
npm run build && npm start
```

### Contribuir

1. Fork el repositorio
2. Creá una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commitea tus cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Creá un Pull Request

## 📝 Notas

- **Limitaciones de API:** Tanto Spotify como Tidal tienen límites de rate limiting. La aplicación maneja esto automáticamente con reintentos.
- **Matching de canciones:** El algoritmo de matching usa título, artista, álbum y duración para encontrar las mejores coincidencias.
- **Progreso guardado:** Si la importación se interrumpe, podés reanudarla desde donde se quedó.

## 📄 Licencia

ISC License - ver el archivo LICENSE para más detalles.

---

**¿Problemas?** Abrí un issue en el repositorio con los detalles del error y los pasos para reproducirlo.