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

    constructor(options: PrinterOptions) {
        this.buffer = [];
        this.port = null;
        this.options = {
            baudRate: 9600,
            autoOpen: true,
            ...options
        };
    }

    private async ensurePortOpen(): Promise<void> {
        if (!this.port) {
            this.port = new SerialPort({
                path: this.options.portPath,
                baudRate: this.options.baudRate ?? 9600,
                autoOpen: this.options.autoOpen
            });
        }

        if (!this.port.isOpen) {
            await new Promise<void>((resolve, reject) => {
                this.port!.open((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
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
        if (this.buffer.length === 0) return;

        try {
            await this.ensurePortOpen();
            await new Promise<void>((resolve, reject) => {
                this.port!.write(this.buffer.join(''), (error) => {
                    if (error) reject(error);
                    else {
                        this.port!.drain(() => {
                            this.buffer = [];
                            resolve();
                        });
                    }
                });
            });
        } catch (error: any) {
            throw new Error(`Failed to print: ${error?.message || 'Unknown error'}`);
        }
    }

    async close(): Promise<void> {
        if (this.port?.isOpen) {
            await new Promise<void>((resolve, reject) => {
                this.port!.close((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        }
        this.port = null;
    }
}

export default PrinterBuffer;