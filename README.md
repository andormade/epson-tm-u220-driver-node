# Epson TM-U220* Printer Driver

A TypeScript driver for the Epson TM-U220* receipt printers. Since it uses standard ESC/POS commands, it may work with other compatible printers as well. I only tested it with the TM-U220IID model.

For general ESC/POS printer usage, I recommend using the [escpos](https://www.npmjs.com/package/escpos) package. This driver is intended for cases where you need a minimal, specialized solution specifically for TM-U220* series printers.

## Installation

```bash
npm install epson-tm-u220iid-driver
```

## Usage

### Basic Example

```typescript
import PrinterBuffer, { Alignment, TextSize } from 'epson-tm-u220iid-driver';

const printer = new PrinterBuffer({
    portPath: '/dev/tty.usbserial',  // Your serial port path
    baudRate: 9600,                  // Optional, defaults to 9600
    autoOpen: true                   // Optional, defaults to true
});

// Simple print job
await printer
    .init()
    .text('Hello World!')
    .print();

// Formatted print job
await printer
    .init()
    .align(Alignment.CENTER)
    .size(TextSize.DOUBLE_HEIGHT, 'Welcome')
    .align(Alignment.LEFT)
    .text('Regular text')
    .bold('This is bold')
    .feed(3)
    .print();

await printer.close(); // Close the port when done
```

### Text Formatting

The driver supports various text formatting options:

```typescript
// Alignment
printer.align(Alignment.LEFT);    // Default alignment
printer.align(Alignment.CENTER);  // Center text
printer.align(Alignment.RIGHT);   // Right align text

// Text Size
printer.size(TextSize.NORMAL, 'Normal text');
printer.size(TextSize.DOUBLE_HEIGHT, 'Double height');
printer.size(TextSize.DOUBLE_WIDTH, 'Double width');
printer.size(TextSize.DOUBLE_BOTH, 'Double height and width');

// Bold Text
printer.bold('This will be bold');
```

## API Reference

### Constructor Options

```typescript
interface PrinterOptions {
    portPath: string;    // Path to the serial port
    baudRate?: number;   // Baud rate (default: 9600)
    autoOpen?: boolean;  // Auto-open port (default: true)
}
```

### Methods

- `init()`: Initialize the printer
- `text(text: string)`: Add text to the buffer
- `bold(text: string)`: Add bold text
- `align(alignment: Alignment)`: Set text alignment
- `size(size: TextSize, text: string)`: Set text size
- `feed(lines: number = 2)`: Feed paper lines
- `clear()`: Clear the print buffer
- `print()`: Print the buffer contents
- `close()`: Close the serial port

### Enums

```typescript
enum Alignment {
    LEFT = '\x1B\x61\x00',
    CENTER = '\x1B\x61\x01',
    RIGHT = '\x1B\x61\x02'
}

enum TextSize {
    NORMAL = '\x1B\x21\x00',
    DOUBLE_HEIGHT = '\x1B\x21\x10',
    DOUBLE_WIDTH = '\x1B\x21\x20',
    DOUBLE_BOTH = '\x1B\x21\x30'
}
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```