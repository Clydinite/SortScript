import * as vscode from 'vscode';
import { OrderedFileTreeDataProvider } from '@vscode/treeDataProvider';
import { OrderCompletionProvider, OrderHoverProvider } from '@vscode/completionProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('Order File Extension is now active!');

  // Get workspace folder
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    console.log('No workspace folder found');
    return;
  }

  // Create tree data provider
  const treeDataProvider = new OrderedFileTreeDataProvider(workspaceFolder.uri.fsPath);
  
  // Register tree view
  const treeView = vscode.window.createTreeView('orderedFiles', {
    treeDataProvider,
    showCollapseAll: true
  });

  // Register commands
  const refreshCommand = vscode.commands.registerCommand('orderedFiles.refresh', () => {
    treeDataProvider.refresh();
    vscode.window.showInformationMessage('Ordered file view refreshed');
  });

  const openFileCommand = vscode.commands.registerCommand('orderedFiles.openFile', (fileUri: vscode.Uri) => {
    vscode.window.showTextDocument(fileUri);
  });

  // Register language providers
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'order' },
    new OrderCompletionProvider(),
    '@', '(', ','
  );

  const hoverProvider = vscode.languages.registerHoverProvider(
    { scheme: 'file', language: 'order' },
    new OrderHoverProvider()
  );

  // Watch for .order file changes
  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/.order');
  
  fileWatcher.onDidCreate(() => {
    treeDataProvider.refresh();
  });
  
  fileWatcher.onDidChange(() => {
    treeDataProvider.refresh();
  });
  
  fileWatcher.onDidDelete(() => {
    treeDataProvider.refresh();
  });

  // Add status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(list-ordered) Order';
  statusBarItem.tooltip = 'Order File Extension Active';
  statusBarItem.command = 'orderedFiles.refresh';
  statusBarItem.show();

  // Register all disposables
  context.subscriptions.push(
    treeView,
    refreshCommand,
    openFileCommand,
    completionProvider,
    hoverProvider,
    fileWatcher,
    statusBarItem
  );

  // Initial refresh
  treeDataProvider.refresh();
}

export function deactivate() {
  console.log('Order File Extension is now deactivated');
}