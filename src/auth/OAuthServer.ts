import http from 'http';
import url from 'url';
import crypto from 'crypto';


export interface OAuthResult {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
}

//Primera vez que hago PKCE

/**
 * Servidor OAuth flujo de código de autorización OAuth
 */
export class OAuthServer {
  private server: http.Server | null = null;
  private port: number;
  private redirectUri: string;

  constructor(port: number = 8888) {
    this.port = port;
    this.redirectUri = `http://127.0.0.1:${port}/callback`;
  }

  /**
   * Generar verificador de código PKCE y desafío para flujo OAuth seguro
   */
  generatePKCEChallenge(): PKCEChallenge {
    // Generar verificador de código (43-128 caracteres, URL-safe)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');

    // Generar desafío de código (hash SHA256 del verificador, codificado en base64url)
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return {
      codeVerifier,
      codeChallenge
    };
  }


  generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  buildAuthorizationUrl(
    clientId: string,
    scopes: string[],
    codeChallenge: string,
    state: string
  ): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(' '),
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      state: state
    });

    return `https://login.tidal.com/authorize?${params.toString()}`;
  }

  /**
   * Iniciar servidor temporal y esperar callback OAuth
   */
  async waitForCallback(timeoutMs: number = 120000): Promise<OAuthResult> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      // Establecer timeout
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.stopServer();
          reject(new Error('La autorización OAuth expiró'));
        }
      }, timeoutMs);

      // Crear servidor
      this.server = http.createServer((req, res) => {
        if (resolved) return;

        const parsedUrl = url.parse(req.url || '', true);

        if (parsedUrl.pathname === '/callback') {
          resolved = true;
          clearTimeout(timeout);

          const query = parsedUrl.query;

          // Enviar respuesta al navegador
          if (query.error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head><title>Autorización Fallida</title></head>
                <body>
                  <h1>Autorización Fallida</h1>
                  <p>Error: ${query.error}</p>
                  <p>Descripción: ${query.error_description || 'Error desconocido'}</p>
                  <p>Podés cerrar esta ventana.</p>
                </body>
              </html>
            `);

            this.stopServer();
            resolve({
              error: query.error as string,
              error_description: query.error_description as string
            });
          } else if (query.code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head><title>Autorización Exitosa</title></head>
                <body>
                  <h1>¡Autorización Exitosa!</h1>
                  <p>Has autorizado exitosamente la aplicación.</p>
                  <p>Podés cerrar esta ventana y volver a la terminal.</p>
                  <script>
                    setTimeout(() => window.close(), 3000);
                  </script>
                </body>
              </html>
            `);

            this.stopServer();
            resolve({
              code: query.code as string,
              state: query.state as string
            });
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head><title>Solicitud Inválida</title></head>
                <body>
                  <h1>Solicitud Inválida</h1>
                  <p>No se recibió código de autorización.</p>
                  <p>Podés cerrar esta ventana.</p>
                </body>
              </html>
            `);

            this.stopServer();
            resolve({
              error: 'invalid_request',
              error_description: 'No se recibió código de autorización'
            });
          }
        } else {
          // Manejar otras rutas
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head><title>No Encontrado</title></head>
              <body>
                <h1>No Encontrado</h1>
                <p>Esperando callback OAuth...</p>
              </body>
            </html>
          `);
        }
      });

      // Manejar errores del servidor
      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);

          if (err.code === 'EADDRINUSE') {
            reject(new Error(`El puerto ${this.port} ya está en uso. Por favor, cerrá otras aplicaciones que lo estén utilizando.`));
          } else {
            reject(new Error(`Error del servidor: ${err.message}`));
          }
        }
      });

      // Iniciar servidor
      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`Servidor OAuth ejecutándose en ${this.redirectUri}`);
        console.log('Esperando autenticación...');
      });
    });
  }

  /**
   * Detener el servidor temporal
   */
  stopServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('Servidor OAuth detenido');
    }
  }

  /**
   * Obtener la URI de redirección para este servidor
   */
  getRedirectUri(): string {
    return this.redirectUri;
  }

  /**
   * Obtener el puerto que está usando este servidor
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Verificar si un puerto está disponible
   */
  static async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = http.createServer();

      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });

      server.on('error', () => resolve(false));
    });
  }

  /**
   * Encontrar un puerto disponible comenzando desde el puerto dado
   */
  static async findAvailablePort(startPort: number = 8888): Promise<number> {
    let port = startPort;

    while (port < startPort + 100) { // Intentar hasta 100 puertos
      if (await OAuthServer.isPortAvailable(port)) {
        return port;
      }
      port++;
    }

    throw new Error(`No se encontraron puertos disponibles comenzando desde ${startPort}`);
  }
}