# Order File Extension for VS Code

A VS Code extension that provides support for `.order` files, enabling declarative file organization and custom tree view ordering.

## Features

- **Custom File Ordering**: Define file order using `.order` files
- **Syntax Highlighting**: Full syntax highlighting for `.order` files
- **Autocompletion**: Intelligent autocompletion for directives and patterns
- **File Grouping**: Group related files together (e.g., component files)
- **Validation**: Real-time validation of `.order` file syntax
- **Tree View**: Custom tree view showing files in the specified order

## .order File Syntax

### Basic File Ordering

```
README.md @required
LICENSE.md @required
package.json

src/ {
  index.js @required
  *.js {
    @allowif(/^[a-z]/)
    @tiebreaker(@alphabetical)
  }
}
```

### Supported Directives

- `@required` - Mark files as required
- `@allowif(regex)` - Allow files matching regex pattern
- `@disallowif(regex)` - Disallow files matching regex pattern
- `@tiebreaker(method1, method2, ...)` - Specify sorting for unordered files
- `@groupby(expression)` - Group related files together
- `@metadata(json)` - Attach metadata to files

### Tiebreaker Methods

- `@alphabetical` - Sort alphabetically
- `@reverse_alphabetical` - Sort reverse alphabetically
- `@natural` - Natural sort order
- `@extension` - Sort by file extension
- `@size` - Sort by file size
- `@modified` - Sort by modification date
- `@created` - Sort by creation date
- `@enum(value)` - Sort by enumerated value

### File Grouping

Group related files by basename:
```
src/components/ {
  @groupby(basename) {
    @tiebreaker(@extension)
  }
}
```

This groups files like:
- Button.tsx, Button.test.tsx, Button.stories.tsx
- Modal.tsx, Modal.test.tsx, Modal.stories.tsx

### Regex Patterns and Capture Groups

Use regex patterns with capture groups:
```
src/ {
  /^([A-Z][a-z]+)\.(tsx|ts|test\.tsx?)$/ {
    @groupby($1)  # Group by component name
    @tiebreaker(@enum($2, ["tsx", "ts", "test.tsx", "test.ts"]))
  }
}
```

## Commands

- `Order Files: Refresh` - Refresh the ordered file view
- `Order Files: Validate` - Validate current directory's .order file
- `Order Files: Show Groups` - Show file groupings for current directory

## Installation

1. Install the extension from the VS Code marketplace
2. Create `.order` files in your project directories
3. The extension will automatically detect and apply the ordering rules

## Configuration

- `orderFile.autoRefresh` - Automatically refresh when .order files change (default: true)
- `orderFile.showValidationErrors` - Show validation errors (default: true)
- `orderFile.enableHover` - Enable hover documentation (default: true)

## Examples

### React Component Organization

```
src/components/ {
  # Core components first
  Button.tsx @required
  Input.tsx @required
  Modal.tsx @required
  
  # Group component files
  /^([A-Z][a-z]+)\.(tsx|ts|test\.tsx|stories\.tsx)$/ {
    @groupby($1)
    @tiebreaker(@enum($2, ["tsx", "ts", "test.tsx", "stories.tsx"]))
  }
}
```

### API Route Organization

```
src/api/ {
  /^v(\d+)\/([a-z]+)\.(routes|controller|service|test)\.(ts|js)$/ {
    @groupby($2)  # Group by resource
    @tiebreaker(@enum($1), @enum($3, ["service", "controller", "routes", "test"]))
  }
}
```

## License

MIT

