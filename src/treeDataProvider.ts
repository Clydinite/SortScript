import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseOrderFile, OrderFile } from './parser';
import { FileOrderProcessor, FileItem } from './fileOrderProcessor';

export class OrderedFileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly fileItem: FileItem,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(fileItem.name, collapsibleState);
    
    this.tooltip = fileItem.path;
    this.description = fileItem.metadata?.description;
    
    if (!fileItem.isDirectory) {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(fileItem.path)]
      };
      this.contextValue = 'file';
    } else {
      this.contextValue = 'folder';
    }

    // Set icon based on file type
    if (fileItem.isDirectory) {
      this.iconPath = new vscode.ThemeIcon('folder');
    } else {
      this.iconPath = new vscode.ThemeIcon('file');
    }

    // Add group indicator if file is grouped
    if (fileItem.group) {
      this.description = `[${fileItem.group}] ${this.description || ''}`;
    }
  }
}

export class OrderedFileTreeDataProvider implements vscode.TreeDataProvider<OrderedFileTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<OrderedFileTreeItem | undefined | null | void> = 
    new vscode.EventEmitter<OrderedFileTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<OrderedFileTreeItem | undefined | null | void> = 
    this._onDidChangeTreeData.event;

  private orderProcessors: Map<string, FileOrderProcessor> = new Map();
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.loadOrderFiles();
  }

  refresh(): void {
    this.loadOrderFiles();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: OrderedFileTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: OrderedFileTreeItem): Thenable<OrderedFileTreeItem[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No workspace folder open');
      return Promise.resolve([]);
    }

    if (element) {
      // Get children of a directory
      return Promise.resolve(this.getDirectoryChildren(element.fileItem));
    } else {
      // Get root level files
      return Promise.resolve(this.getRootChildren());
    }
  }

  private loadOrderFiles(): void {
    this.orderProcessors.clear();
    this.findOrderFiles(this.workspaceRoot);
  }

  private findOrderFiles(dir: string): void {
    try {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // Recursively search subdirectories
          this.findOrderFiles(filePath);
        } else if (file === '.order') {
          // Found an .order file
          this.loadOrderFile(filePath, dir);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error);
    }
  }

  private loadOrderFile(orderFilePath: string, dirPath: string): void {
    try {
      const content = fs.readFileSync(orderFilePath, 'utf8');
      const orderFile = parseOrderFile(content);
      
      if (orderFile) {
        const processor = new FileOrderProcessor(orderFile);
        this.orderProcessors.set(dirPath, processor);
        console.log(`Loaded .order file for ${dirPath}`);
      }
    } catch (error) {
      console.error(`Error loading .order file ${orderFilePath}:`, error);
    }
  }

  private getRootChildren(): OrderedFileTreeItem[] {
    return this.getDirectoryChildren({
      name: '',
      path: this.workspaceRoot,
      isDirectory: true
    });
  }

  private getDirectoryChildren(dirItem: FileItem): OrderedFileTreeItem[] {
    try {
      const files = fs.readdirSync(dirItem.path);
      const fileItems: FileItem[] = [];

      for (const file of files) {
        // Skip .order files from display
        if (file === '.order') continue;
        
        const filePath = path.join(dirItem.path, file);
        const stat = fs.statSync(filePath);
        
        fileItems.push({
          name: file,
          path: filePath,
          isDirectory: stat.isDirectory()
        });
      }

      // Apply ordering if there's an .order file for this directory
      const processor = this.findOrderProcessor(dirItem.path);
      const orderedFiles = processor ? processor.orderFiles(fileItems, dirItem.path) : fileItems;

      // Convert to tree items
      return orderedFiles.map(fileItem => {
        const collapsibleState = fileItem.isDirectory 
          ? vscode.TreeItemCollapsibleState.Collapsed 
          : vscode.TreeItemCollapsibleState.None;
        
        return new OrderedFileTreeItem(fileItem, collapsibleState);
      });

    } catch (error) {
      console.error(`Error reading directory ${dirItem.path}:`, error);
      return [];
    }
  }

  private findOrderProcessor(dirPath: string): FileOrderProcessor | null {
    // Look for the most specific .order file
    let currentPath = dirPath;
    
    while (currentPath && currentPath !== path.dirname(currentPath)) {
      if (this.orderProcessors.has(currentPath)) {
        return this.orderProcessors.get(currentPath)!;
      }
      currentPath = path.dirname(currentPath);
    }
    
    return null;
  }

  public validateCurrentDirectory(): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return;

    const currentDir = path.dirname(activeEditor.document.uri.fsPath);
    const processor = this.findOrderProcessor(currentDir);
    
    if (!processor) {
      vscode.window.showInformationMessage('No .order file found for current directory');
      return;
    }

    try {
      const files = fs.readdirSync(currentDir);
      const fileItems: FileItem[] = files.map(file => ({
        name: file,
        path: path.join(currentDir, file),
        isDirectory: fs.statSync(path.join(currentDir, file)).isDirectory()
      }));

      const missingRequired = processor.validateRequiredFiles(fileItems);
      
      if (missingRequired.length > 0) {
        vscode.window.showWarningMessage(
          `Missing required files: ${missingRequired.join(', ')}`
        );
      } else {
        vscode.window.showInformationMessage('All required files are present');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error validating directory: ${error}`);
    }
  }

  public showFileGroups(): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return;

    const currentDir = path.dirname(activeEditor.document.uri.fsPath);
    const processor = this.findOrderProcessor(currentDir);
    
    if (!processor) {
      vscode.window.showInformationMessage('No .order file found for current directory');
      return;
    }

    try {
      const files = fs.readdirSync(currentDir);
      const fileItems: FileItem[] = files.map(file => ({
        name: file,
        path: path.join(currentDir, file),
        isDirectory: fs.statSync(path.join(currentDir, file)).isDirectory()
      }));

      const orderedFiles = processor.orderFiles(fileItems, currentDir);
      const groups = new Map<string, string[]>();
      
      for (const file of orderedFiles) {
        const group = file.group || 'ungrouped';
        if (!groups.has(group)) {
          groups.set(group, []);
        }
        groups.get(group)!.push(file.name);
      }

      let message = 'File Groups:\n';
      for (const [group, files] of groups) {
        message += `\n${group}: ${files.join(', ')}`;
      }

      vscode.window.showInformationMessage(message);
    } catch (error) {
      vscode.window.showErrorMessage(`Error analyzing file groups: ${error}`);
    }
  }
}

