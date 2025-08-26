import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileSystemItem, File, Directory, Group } from '../core/structure';

export function toFileSystemItem(uri: vscode.Uri): Directory {
  const stats = fs.statSync(uri.fsPath);
  const name = path.basename(uri.fsPath);

  if (stats.isDirectory()) {
    const directory = new Directory(name, uri.fsPath);
    const children = fs.readdirSync(uri.fsPath);
    for (const child of children) {
      const childUri = vscode.Uri.joinPath(uri, child);
      const childStats = fs.statSync(childUri.fsPath);
      if (childStats.isDirectory()) {
        directory.children.push(new Directory(child, childUri.fsPath));
      } else {
        directory.children.push(new File(child, childUri.fsPath));
      }
    }
    return directory;
  } else {
    throw new Error('URI is not a directory');
  }
}

export function toTreeItem(item: FileSystemItem): vscode.TreeItem {
  const isDirectory = item instanceof Directory;
  const collapsibleState = isDirectory
    ? vscode.TreeItemCollapsibleState.Collapsed
    : vscode.TreeItemCollapsibleState.None;

  const treeItem: vscode.TreeItem & { fsPath?: string } = new vscode.TreeItem(item.name, collapsibleState);
  if (item instanceof File) {
    treeItem.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [vscode.Uri.file(item.path)],
    };
    treeItem.contextValue = 'file';
    treeItem.fsPath = item.path;
  } else if (item instanceof Directory) {
    treeItem.contextValue = 'folder';
    treeItem.fsPath = item.path;
  } else if (item instanceof Group) {
    treeItem.contextValue = 'group';
  }

  return treeItem;
}
