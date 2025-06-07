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
    align: (alignment: Alignment): string => alignment,
    setTextSize: (size: TextSize): string => size,
    feedLines: (n: number): string => ESC + 'd' + String.fromCharCode(n),
    line: (text: string = ''): string => text + '\n',
    boldOn: ESC + 'E',
    boldOff: ESC + 'F'
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

        this.port.on('close', () => {
            this.port = null;
            this.openPromise = null;
        });
    }

    private async ensurePortOpen(): Promise<void> {
        if (this.port?.isOpen) {
            return;
        }

        if (this.openPromise) {
            return this.openPromise;
        }

        this.setupPort();

        if (!this.port) {
            throw new Error('Port not initialized');
        }

        this.openPromise = new Promise<void>((resolve, reject) => {
            this.port!.once('open', () => {
                this.openPromise = null;
                resolve();
            });

            this.port!.open((err) => {
                if (err) {
                    this.openPromise = null;
                    reject(new Error(`Failed to open port: ${err.message}`));
                }
            });
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

    size(size: TextSize): PrinterBuffer {
        this.buffer.push(Commands.setTextSize(size));
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

    bold(): PrinterBuffer {
        this.buffer.push(Commands.boldOn);
        return this;
    }

    boldOff(): PrinterBuffer {
        this.buffer.push(Commands.boldOff);
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

        const port = this.port; 

        try {
            await new Promise<void>((resolve, reject) => {
                port.once('close', () => {
                    this.port = null;
                    this.openPromise = null;
                    resolve();
                });

                port.once('error', (error) => {
                    this.port = null;
                    this.openPromise = null;
                    reject(error);
                });

                port.close((err) => {
                    if (err) {
                        this.port = null;
                        this.openPromise = null;
                        reject(new Error(`Failed to close port: ${err.message}`));
                    }
                });
            });
        } catch (error: any) {
            this.port = null;
            this.openPromise = null;
            throw error;
        }
    }
}

export default PrinterBuffer;