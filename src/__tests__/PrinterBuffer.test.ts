import { SerialPort } from 'serialport';
import PrinterBuffer, { Alignment, TextSize, Commands } from '../index';

type MockSerialPortInstance = {
    isOpen: boolean;
    open: jest.Mock<void, [(error?: Error) => void]>;
    write: jest.Mock<void, [string, (error?: Error) => void]>;
    drain: jest.Mock<void, [() => void]>;
    close: jest.Mock<void, [(error?: Error) => void]>;
};

jest.mock('serialport', () => {
    const mockSerialPort = jest.fn().mockImplementation(() => {
        const instance: MockSerialPortInstance = {
            isOpen: false,
            open: jest.fn((callback: (error?: Error) => void) => callback()),
            write: jest.fn((data: string, callback: (error?: Error) => void) => callback()),
            drain: jest.fn((callback: () => void) => callback()),
            close: jest.fn((callback: (error?: Error) => void) => callback()),
        };
        return instance;
    });
    return { SerialPort: mockSerialPort };
});

const MockSerialPort = SerialPort as unknown as jest.Mock<MockSerialPortInstance>;

describe('PrinterBuffer', () => {
    let printer: PrinterBuffer;
    const mockPort = '/dev/test';

    beforeEach(() => {
        printer = new PrinterBuffer({ portPath: mockPort });
        jest.clearAllMocks();
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
                .bold('Bold Text')
                .feed(2);

            expect(printer['buffer']).toHaveLength(6);
            expect(printer['buffer']).toContain(Commands.init);
            expect(printer['buffer']).toContain('Line 1\n');
            expect(printer['buffer']).toContain(Commands.boldOn);
            expect(printer['buffer']).toContain('Bold Text\n');
            expect(printer['buffer']).toContain(Commands.boldOff);
        });

        it('should handle text alignment', () => {
            printer.align(Alignment.CENTER).text('Centered');
            expect(printer['buffer']).toContain(Alignment.CENTER);
        });

        it('should handle text size', () => {
            printer.size(TextSize.DOUBLE_HEIGHT, 'Big Text');
            expect(printer['buffer']).toContain(TextSize.DOUBLE_HEIGHT);
            expect(printer['buffer']).toContain('Big Text\n');
            expect(printer['buffer']).toContain(TextSize.NORMAL);
        });

        it('should clear buffer', () => {
            printer.text('Test').bold('Bold');
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
                autoOpen: true
            });

            const mockInstance = MockSerialPort.mock.results[0].value;
            expect(mockInstance.write).toHaveBeenCalled();
            expect(mockInstance.drain).toHaveBeenCalled();
        });

        it('should handle print errors', async () => {
            const mockError = new Error('Print failed');
            MockSerialPort.mockImplementationOnce(() => ({
                isOpen: false,
                open: jest.fn((callback: (error?: Error) => void) => callback(mockError)),
                write: jest.fn(),
                drain: jest.fn(),
                close: jest.fn(),
            }));

            printer.text('Test');
            await expect(printer.print()).rejects.toThrow('Failed to print: Print failed');
        });

        it('should close port properly', async () => {
            const mockClose = jest.fn((callback: (error?: Error) => void) => callback());
            MockSerialPort.mockImplementation(() => ({
                isOpen: true,
                open: jest.fn((callback: (error?: Error) => void) => callback()),
                write: jest.fn((data: string, callback: (error?: Error) => void) => callback()),
                drain: jest.fn((callback: () => void) => callback()),
                close: mockClose,
            }));

            const customPrinter = new PrinterBuffer({ portPath: mockPort });
            customPrinter.text('Test');
            await customPrinter.print();
            await customPrinter.close();

            expect(mockClose).toHaveBeenCalled();
        });
    });

    describe('Configuration', () => {
        it('should accept custom baudRate', async () => {
            const customBaudRate = 115200;
            const customPrinter = new PrinterBuffer({ 
                portPath: mockPort, 
                baudRate: customBaudRate 
            });

            customPrinter.text('Test');
            await customPrinter.print();
            
            expect(MockSerialPort).toHaveBeenCalledWith({
                path: mockPort,
                baudRate: customBaudRate,
                autoOpen: true
            });
        });

        it('should accept autoOpen configuration', async () => {
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