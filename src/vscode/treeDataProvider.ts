import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseOrderFile } from '../core/parser';
import { FileOrderProcessor } from '../core/fileOrderProcessor';
import { toFileSystemItem, toTreeItem } from './adapter';
import { Directory } from '../core/structure';

export class OrderedFileTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = 
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = 
    this._onDidChangeTreeData.event;

  private orderProcessor: FileOrderProcessor | null = null;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.loadOrderFile();
  }

  refresh(): void {
    this.loadOrderFile();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No workspace folder open');
      return Promise.resolve([]);
    }

    if (element) {
      // If the element is a directory or group, return its children
      if (element.contextValue === 'folder' || element.contextValue === 'group') {
        const fsPath = (element as { fsPath: string }).fsPath; // Assuming fsPath is stored in the TreeItem
        const directory = toFileSystemItem(vscode.Uri.file(fsPath));
        const orderedDirectory = this.orderProcessor ? this.orderProcessor.orderFiles(directory) : directory;
        return Promise.resolve(orderedDirectory.children.map(toTreeItem));
      }
      return Promise.resolve([]);
    } else {
      // Get root level files
      const directory = toFileSystemItem(vscode.Uri.file(this.workspaceRoot));
      const orderedDirectory = this.orderProcessor ? this.orderProcessor.orderFiles(directory) : directory;
      return Promise.resolve(orderedDirectory.children.map(toTreeItem));
    }
  }

  private loadOrderFile(): void {
    const orderFilePath = path.join(this.workspaceRoot, '.order');
    if (fs.existsSync(orderFilePath)) {
      const content = fs.readFileSync(orderFilePath, 'utf8');
      const orderFile = parseOrderFile(content);
      if (orderFile) {
        this.orderProcessor = new FileOrderProcessor(orderFile, path, fs);
      }
    }
  }
}