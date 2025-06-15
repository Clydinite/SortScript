# VS Code Extension Development Setup

## How to Debug the Extension

Follow these steps to run and debug the Order File Extension in a separate VS Code debug instance:

### 1. **Open the Extension Project**
```bash
# Extract the extension files
tar -xzf order-extension.tar.gz
cd order-extension

# Install dependencies
npm install

# Compile TypeScript
npm run compile
```

### 2. **Open in VS Code**
```bash
code .
```

### 3. **Start Debugging**

#### Method 1: Using the Debug Panel
1. Open the **Run and Debug** panel (`Ctrl+Shift+D` or `Cmd+Shift+D`)
2. Select **"Run Extension"** from the dropdown
3. Click the **Play button** (▶️) or press `F5`

#### Method 2: Using Keyboard Shortcut
- Simply press `F5` while in the extension project

#### Method 3: Using Command Palette
1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type "Debug: Start Debugging"
3. Select it and choose "Run Extension"

### 4. **What Happens Next**

When you start debugging:

1. **TypeScript Compilation**: The extension will automatically compile TypeScript files
2. **New VS Code Window**: A new "Extension Development Host" window will open
3. **Extension Loaded**: Your extension will be loaded and active in the new window
4. **Debug Console**: You can see debug output in the original VS Code window

### 5. **Testing the Extension**

In the new Extension Development Host window:

1. **Open a Project**: Open a folder that contains `.order` files (use the demo project)
2. **View the Tree**: Look for "Order Files" in the Activity Bar (left sidebar)
3. **Create .order Files**: Create new `.order` files and see syntax highlighting
4. **Test Autocompletion**: Type `@` in a `.order` file to see autocompletion

### 6. **Debug Features**

#### Set Breakpoints
- Click in the gutter next to line numbers in your TypeScript files
- Execution will pause at breakpoints when the extension runs

#### Debug Console
- Use `console.log()` in your extension code
- Output appears in the Debug Console of the original VS Code window

#### Hot Reload
- Make changes to your TypeScript code
- Press `Ctrl+R` (or `Cmd+R`) in the Extension Development Host window to reload

### 7. **Available Debug Configurations**

The extension includes two debug configurations:

#### "Run Extension"
- Launches the extension in a new VS Code window
- Use this for normal development and testing

#### "Extension Tests"
- Runs the extension test suite
- Use this to run automated tests

### 8. **Development Workflow**

1. **Make Changes**: Edit TypeScript files in the original window
2. **Compile**: Run `npm run compile` or use the watch task
3. **Reload**: Press `Ctrl+R` in the Extension Development Host window
4. **Test**: Verify your changes work as expected

### 9. **Watch Mode (Optional)**

For continuous compilation during development:

```bash
npm run watch
```

This will automatically recompile TypeScript files when you save changes.

### 10. **Troubleshooting**

#### Extension Not Loading
- Check the Debug Console for error messages
- Ensure `npm run compile` completed successfully
- Verify `package.json` activation events are correct

#### Breakpoints Not Working
- Ensure source maps are enabled in `tsconfig.json`
- Check that `outFiles` path in `launch.json` is correct

#### Changes Not Reflected
- Press `Ctrl+R` in the Extension Development Host window
- Check if TypeScript compilation was successful

### 11. **Demo Project Testing**

Extract and use the demo project to test the extension:

```bash
tar -xzf demo-project.tar.gz
```

Then open the demo project in the Extension Development Host window to see the extension in action.

## File Structure

The extension includes these key debug configuration files:

- `.vscode/launch.json` - Debug launch configurations
- `.vscode/tasks.json` - Build tasks
- `.vscode/settings.json` - Workspace settings
- `.vscode/extensions.json` - Recommended extensions

This setup follows the official VS Code extension development guidelines and provides a smooth debugging experience!

