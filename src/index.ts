import { SerialPort } from 'serialport';

export const ESC: string = '\x1B';

export enum Alignment {
    LEFT = '\x1B\x61\x00',
    CENTER = '\x1B\x61\x01',
    RIGHT = '\x1B\x61\x02'
}

export enum TextSize {
    NORMAL = '\x1B\x21\x00',
    DOUBLE_HEIGHT = '\x1B\x21\x10',
    DOUBLE_WIDTH = '\x1B\x21\x20',
    DOUBLE_BOTH = '\x1B\x21\x30'
}

export interface PrinterOptions {
    portPath: string;
    baudRate?: number;
    autoOpen?: boolean;
}

export const Commands = {
    init: ESC + '@',
    boldOn: ESC + 'E',
    boldOff: ESC + 'F',
    align: (alignment: Alignment): string => alignment,
    setTextSize: (size: TextSize): string => size,
    feedLines: (n: number): string => ESC + 'd' + String.fromCharCode(n),
    line: (text: string = ''): string => text + '\n'
} as const;

class PrinterBuffer {
    private buffer: string[];
    private port: SerialPort | null;
    private options: PrinterOptions;
    private openPromise: Promise<void> | null;

    constructor(options: PrinterOptions) {
        this.buffer = [];
        this.port = null;
        this.openPromise = null;
        this.options = {
            baudRate: 9600,
            autoOpen: true,
            ...options
        };
    }

    private setupPort(): void {
        if (this.port) {
            return;
        }

        this.port = new SerialPort({
            path: this.options.portPath,
            baudRate: this.options.baudRate ?? 9600,
            autoOpen: false
        });

        // Global error handler for unexpected errors
        this.port.on('error', (error) => {
            console.error(`Port error: ${error.message}`);
        });

        // Handle unexpected closes
        this.port.on('close', () => {
            this.port = null;
            this.openPromise = null;
        });
    }

    private async ensurePortOpen(): Promise<void> {
        // If we already have an open port, return immediately
        if (this.port?.isOpen) {
            return;
        }

        // If we're already in the process of opening, return the existing promise
        if (this.openPromise) {
            return this.openPromise;
        }

        this.setupPort();

        // Create a new open promise
        this.openPromise = new Promise<void>((resolve, reject) => {
            if (!this.port) {
                reject(new Error('Port not initialized'));
                return;
            }

            const cleanup = () => {
                this.port?.removeListener('open', onOpen);
                this.port?.removeListener('error', onError);
                this.openPromise = null;
            };

            const onOpen = () => {
                cleanup();
                resolve();
            };

            const onError = (error: Error) => {
                cleanup();
                reject(new Error(`Failed to open port: ${error.message}`));
            };

            // Set up one-time event handlers
            this.port.once('open', onOpen);
            this.port.once('error', onError);

            // Attempt to open the port
            try {
                this.port.open((err) => {
                    if (err) {
                        cleanup();
                        reject(new Error(`Failed to open port: ${err.message}`));
                    }
                });
            } catch (err) {
                cleanup();
                reject(new Error(`Failed to open port: ${err}`));
            }
        });

        return this.openPromise;
    }

    init(): PrinterBuffer {
        this.buffer.push(Commands.init);
        return this;
    }

    align(alignment: Alignment): PrinterBuffer {
        this.buffer.push(Commands.align(alignment));
        return this;
    }

    bold(text: string): PrinterBuffer {
        this.buffer.push(Commands.boldOn, Commands.line(text), Commands.boldOff);
        return this;
    }

    size(size: TextSize, text: string): PrinterBuffer {
        this.buffer.push(Commands.setTextSize(size), Commands.line(text), Commands.setTextSize(TextSize.NORMAL));
        return this;
    }

    text(text: string): PrinterBuffer {
        this.buffer.push(Commands.line(text));
        return this;
    }

    feed(n: number = 2): PrinterBuffer {
        this.buffer.push(Commands.feedLines(n));
        return this;
    }

    clear(): PrinterBuffer {
        this.buffer = [];
        return this;
    }

    async print(): Promise<void> {
        if (this.buffer.length === 0) {
            return;
        }

        try {
            await this.ensurePortOpen();

            if (!this.port?.isOpen) {
                throw new Error('Port is not open');
            }

            await new Promise<void>((resolve, reject) => {
                const data = this.buffer.join('');

                const writeAndDrain = () => {
                    this.port!.write(data, (writeError) => {
                        if (writeError) {
                            reject(new Error(`Write error: ${writeError.message}`));
                            return;
                        }

                        this.port!.drain((drainError) => {
                            if (drainError) {
                                reject(new Error(`Drain error: ${drainError.message}`));
                                return;
                            }
                            this.buffer = [];
                            resolve();
                        });
                    });
                };

                // Handle errors during write/drain
                const onError = (error: Error) => {
                    this.port?.removeListener('error', onError);
                    reject(new Error(`Port error during write: ${error.message}`));
                };

                this.port!.on('error', onError);
                writeAndDrain();
            });
        } catch (error: any) {
            // Reset state on error
            this.port = null;
            this.openPromise = null;
            throw new Error(`Print failed: ${error.message}`);
        }
    }

    async close(): Promise<void> {
        if (!this.port) {
            return;
        }

        try {
            await new Promise<void>((resolve, reject) => {
                const cleanup = () => {
                    this.port?.removeAllListeners();
                    this.port = null;
                    this.openPromise = null;
                };

                if (!this.port?.isOpen) {
                    cleanup();
                    resolve();
                    return;
                }

                this.port.close((error) => {
                    if (error) {
                        cleanup();
                        reject(new Error(`Failed to close port: ${error.message}`));
                        return;
                    }
                    cleanup();
                    resolve();
                });
            });
        } catch (error: any) {
            // Make sure we clean up even on error
            this.port?.removeAllListeners();
            this.port = null;
            this.openPromise = null;
            throw error;
        }
    }
}

export default PrinterBuffer;