import { SerialPort } from 'serialport';
import PrinterBuffer, { Alignment, TextSize, Commands } from '../index';

type MockSerialPortInstance = {
    isOpen: boolean;
    opening: boolean;
    open: jest.Mock<void, [(error?: Error) => void]>;
    write: jest.Mock<void, [string, (error?: Error) => void]>;
    drain: jest.Mock<void, [() => void]>;
    close: jest.Mock<void, [(error?: Error) => void]>;
    on: jest.Mock;
    once: jest.Mock;
    removeListener: jest.Mock;
    removeAllListeners: jest.Mock;
    emit: jest.Mock;
    listeners: Map<string, Function[]>;
};

const createMockInstance = (options: { error?: Error } = {}): MockSerialPortInstance => {
    const instance: MockSerialPortInstance = {
        isOpen: false,
        opening: false,
        listeners: new Map(),
        open: jest.fn((callback: (error?: Error) => void) => {
            if (options.error) {
                callback(options.error);
                return;
            }
            instance.isOpen = true;
            instance.opening = false;
            callback();
            const listeners = instance.listeners.get('open') || [];
            listeners.forEach(listener => listener());
        }),
        write: jest.fn((data: string, callback: (error?: Error) => void) => callback()),
        drain: jest.fn((callback: () => void) => callback()),
        close: jest.fn((callback: (error?: Error) => void) => {
            instance.isOpen = false;
            callback();
            const listeners = instance.listeners.get('close') || [];
            listeners.forEach(listener => listener());
        }),
        on: jest.fn((event: string, handler: Function) => {
            const listeners = instance.listeners.get(event) || [];
            listeners.push(handler);
            instance.listeners.set(event, listeners);
        }),
        once: jest.fn((event: string, handler: Function) => {
            const listeners = instance.listeners.get(event) || [];
            const wrappedHandler = (...args: any[]) => {
                handler(...args);
                const index = listeners.indexOf(wrappedHandler);
                if (index !== -1) {
                    listeners.splice(index, 1);
                }
            };
            listeners.push(wrappedHandler);
            instance.listeners.set(event, listeners);
        }),
        removeListener: jest.fn((event: string, handler: Function) => {
            const listeners = instance.listeners.get(event) || [];
            const index = listeners.indexOf(handler);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }),
        removeAllListeners: jest.fn((event?: string) => {
            if (event) {
                instance.listeners.delete(event);
            } else {
                instance.listeners.clear();
            }
        }),
        emit: jest.fn((event: string, ...args: any[]) => {
            const listeners = instance.listeners.get(event) || [];
            listeners.forEach(listener => listener(...args));
        })
    };
    return instance;
};

jest.mock('serialport', () => {
    return { SerialPort: jest.fn().mockImplementation(() => createMockInstance()) };
});

const MockSerialPort = SerialPort as unknown as jest.Mock<MockSerialPortInstance>;

describe('PrinterBuffer', () => {
    let printer: PrinterBuffer;
    const mockPort = '/dev/test';

    beforeEach(() => {
        printer = new PrinterBuffer({ portPath: mockPort });
        jest.clearAllMocks();
        MockSerialPort.mockImplementation(() => createMockInstance());
    });

    describe('Buffer Operations', () => {
        it('should initialize with empty buffer', () => {
            expect(printer['buffer']).toHaveLength(0);
        });

        it('should add text to buffer', () => {
            printer.text('Hello');
            expect(printer['buffer']).toHaveLength(1);
            expect(printer['buffer'][0]).toBe('Hello\n');
        });

        it('should chain commands', () => {
            printer
                .init()
                .text('Line 1')
                .size(TextSize.DOUBLE_HEIGHT)
                .text('Big Text')
                .size(TextSize.NORMAL)
                .feed(2);

            expect(printer['buffer']).toHaveLength(6);
            expect(printer['buffer']).toContain(Commands.init);
            expect(printer['buffer']).toContain('Line 1\n');
            expect(printer['buffer']).toContain(TextSize.DOUBLE_HEIGHT);
            expect(printer['buffer']).toContain('Big Text\n');
            expect(printer['buffer']).toContain(TextSize.NORMAL);
        });

        it('should handle text alignment', () => {
            printer.align(Alignment.CENTER).text('Centered');
            expect(printer['buffer']).toContain(Alignment.CENTER);
        });

        it('should handle text size', () => {
            printer
                .size(TextSize.DOUBLE_HEIGHT)
                .text('Big Text')
                .size(TextSize.NORMAL);
            expect(printer['buffer']).toContain(TextSize.DOUBLE_HEIGHT);
            expect(printer['buffer']).toContain('Big Text\n');
            expect(printer['buffer']).toContain(TextSize.NORMAL);
        });

        it('should clear buffer', () => {
            printer
                .text('Test')
                .size(TextSize.DOUBLE_HEIGHT)
                .text('Big Text')
                .size(TextSize.NORMAL);
            expect(printer['buffer'].length).toBeGreaterThan(0);
            
            printer.clear();
            expect(printer['buffer']).toHaveLength(0);
        });
    });

    describe('Printing Operations', () => {
        it('should not print empty buffer', async () => {
            await printer.print();
            expect(MockSerialPort).not.toHaveBeenCalled();
        });

        it('should open port and print buffer contents', async () => {
            printer.text('Test Print');
            await printer.print();

            expect(MockSerialPort).toHaveBeenCalledWith({
                path: mockPort,
                baudRate: 9600,
                autoOpen: false
            });

            const mockInstance = MockSerialPort.mock.results[0].value;
            expect(mockInstance.write).toHaveBeenCalled();
            expect(mockInstance.drain).toHaveBeenCalled();
        }, 10000);

        it('should handle print errors', async () => {
            const mockError = new Error('Print failed');
            MockSerialPort.mockImplementation(() => createMockInstance({ error: mockError }));

            printer.text('Test');
            await expect(printer.print()).rejects.toThrow('Failed to open port: Print failed');
        });

        it('should close port properly', async () => {
            const instance = createMockInstance();
            MockSerialPort.mockImplementation(() => instance);

            const customPrinter = new PrinterBuffer({ portPath: mockPort });
            customPrinter.text('Test');
            await customPrinter.print();
            await customPrinter.close();

            expect(instance.close).toHaveBeenCalled();
        });
    });

    describe('Configuration', () => {
        it('should accept custom baudRate', async () => {
            const customBaudRate = 115200;
            const instance = createMockInstance();
            MockSerialPort.mockImplementation(() => instance);

            const customPrinter = new PrinterBuffer({ 
                portPath: mockPort, 
                baudRate: customBaudRate 
            });

            customPrinter.text('Test');
            await customPrinter.print();
            
            expect(MockSerialPort).toHaveBeenCalledWith({
                path: mockPort,
                baudRate: customBaudRate,
                autoOpen: false
            });
        });

        it('should accept autoOpen configuration', async () => {
            const instance = createMockInstance();
            MockSerialPort.mockImplementation(() => instance);

            const customPrinter = new PrinterBuffer({ 
                portPath: mockPort, 
                autoOpen: false 
            });

            customPrinter.text('Test');
            await customPrinter.print();
            
            expect(MockSerialPort).toHaveBeenCalledWith({
                path: mockPort,
                baudRate: 9600,
                autoOpen: false
            });
        });
    });
}); 