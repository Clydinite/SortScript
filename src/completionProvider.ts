import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class OrderCompletionProvider implements vscode.CompletionItemProvider {
  
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    
    const linePrefix = document.lineAt(position).text.substr(0, position.character);
    
    // Check if we're typing a directive
    if (linePrefix.endsWith('@')) {
      return this.getDirectiveCompletions();
    }
    
    // Check if we're inside a directive with parentheses
    if (linePrefix.includes('@') && linePrefix.includes('(') && !linePrefix.includes(')')) {
      const directiveName = this.extractDirectiveName(linePrefix);
      return this.getDirectiveArgumentCompletions(directiveName);
    }
    
    // Check if we're typing a file pattern
    if (!linePrefix.includes('@') && !linePrefix.includes('{')) {
      return this.getFilePatternCompletions(document, position);
    }
    
    return [];
  }

  private getDirectiveCompletions(): vscode.CompletionItem[] {
    const directives = [
      {
        name: 'required',
        detail: 'Mark file as required',
        documentation: 'Indicates that a file matching the pattern must exist.',
        insertText: 'required'
      },
      {
        name: 'allowif',
        detail: 'Allow files matching pattern',
        documentation: 'Allow files only if they match the specified regex pattern.',
        insertText: 'allowif(/^[a-z]/)'
      },
      {
        name: 'disallowif',
        detail: 'Disallow files matching pattern',
        documentation: 'Disallow files if they match the specified regex pattern.',
        insertText: 'disallowif(/\\.test\\./)'
      },
      {
        name: 'tiebreaker',
        detail: 'Specify sorting method for unordered files',
        documentation: 'Specifies how files should be sorted when not explicitly ordered.',
        insertText: 'tiebreaker(@alphabetical)'
      },
      {
        name: 'groupby',
        detail: 'Group related files together',
        documentation: 'Groups files together based on basename or capture groups.',
        insertText: 'groupby(basename)'
      },
      {
        name: 'metadata',
        detail: 'Attach metadata to files',
        documentation: 'Attaches JSON metadata to files for use by tools.',
        insertText: 'metadata({"type": "component"})'
      }
    ];

    return directives.map(directive => {
      const item = new vscode.CompletionItem(directive.name, vscode.CompletionItemKind.Keyword);
      item.detail = directive.detail;
      item.documentation = new vscode.MarkdownString(directive.documentation);
      item.insertText = directive.insertText;
      return item;
    });
  }

  private getDirectiveArgumentCompletions(directiveName: string): vscode.CompletionItem[] {
    switch (directiveName) {
      case 'tiebreaker':
        return this.getTiebreakerCompletions();
      case 'groupby':
        return this.getGroupbyCompletions();
      case 'allowif':
      case 'disallowif':
        return this.getRegexCompletions();
      default:
        return [];
    }
  }

  private getTiebreakerCompletions(): vscode.CompletionItem[] {
    const methods = [
      {
        name: '@alphabetical',
        detail: 'Sort alphabetically',
        documentation: 'Sort files alphabetically by name.'
      },
      {
        name: '@reverse_alphabetical',
        detail: 'Sort reverse alphabetically',
        documentation: 'Sort files in reverse alphabetical order.'
      },
      {
        name: '@natural',
        detail: 'Natural sort order',
        documentation: 'Sort using natural order (file2 before file10).'
      },
      {
        name: '@extension',
        detail: 'Sort by file extension',
        documentation: 'Sort files by their file extension.'
      },
      {
        name: '@size',
        detail: 'Sort by file size',
        documentation: 'Sort files by size (largest first).'
      },
      {
        name: '@modified',
        detail: 'Sort by modification date',
        documentation: 'Sort files by last modification date (newest first).'
      },
      {
        name: '@created',
        detail: 'Sort by creation date',
        documentation: 'Sort files by creation date (newest first).'
      },
      {
        name: '@enum($1)',
        detail: 'Sort by capture group',
        documentation: 'Sort using captured group value.'
      }
    ];

    return methods.map(method => {
      const item = new vscode.CompletionItem(method.name, vscode.CompletionItemKind.Method);
      item.detail = method.detail;
      item.documentation = new vscode.MarkdownString(method.documentation);
      item.insertText = method.name;
      return item;
    });
  }

  private getGroupbyCompletions(): vscode.CompletionItem[] {
    const options = [
      {
        name: 'basename',
        detail: 'Group by file basename',
        documentation: 'Group files by their basename (filename without extension).'
      },
      {
        name: '$1',
        detail: 'Group by first capture group',
        documentation: 'Group files using the first regex capture group.'
      },
      {
        name: '$2',
        detail: 'Group by second capture group',
        documentation: 'Group files using the second regex capture group.'
      }
    ];

    return options.map(option => {
      const item = new vscode.CompletionItem(option.name, vscode.CompletionItemKind.Value);
      item.detail = option.detail;
      item.documentation = new vscode.MarkdownString(option.documentation);
      item.insertText = option.name;
      return item;
    });
  }

  private getRegexCompletions(): vscode.CompletionItem[] {
    const patterns = [
      {
        name: '/^[A-Z]/',
        detail: 'Starts with capital letter',
        documentation: 'Matches files that start with a capital letter.'
      },
      {
        name: '/^[a-z]/',
        detail: 'Starts with lowercase letter',
        documentation: 'Matches files that start with a lowercase letter.'
      },
      {
        name: '/\\.test\\.|spec\\.|stories\\.|module\\./',
        detail: 'Test/spec/story/module files',
        documentation: 'Matches test, spec, stories, or module files.'
      },
      {
        name: '/^([A-Z][a-z]+)Component\\.(tsx|ts)$/',
        detail: 'React component pattern',
        documentation: 'Matches React component files with capture groups.'
      },
      {
        name: '/\\.(js|ts|jsx|tsx)$/',
        detail: 'JavaScript/TypeScript files',
        documentation: 'Matches JavaScript and TypeScript files.'
      }
    ];

    return patterns.map(pattern => {
      const item = new vscode.CompletionItem(pattern.name, vscode.CompletionItemKind.Snippet);
      item.detail = pattern.detail;
      item.documentation = new vscode.MarkdownString(pattern.documentation);
      item.insertText = pattern.name;
      return item;
    });
  }

  private getFilePatternCompletions(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) return [];

    const currentDir = path.dirname(document.uri.fsPath);
    
    try {
      const files = fs.readdirSync(currentDir);
      const completions: vscode.CompletionItem[] = [];

      // Add common glob patterns
      const globPatterns = [
        { name: '*.js', detail: 'All JavaScript files' },
        { name: '*.ts', detail: 'All TypeScript files' },
        { name: '*.tsx', detail: 'All TSX files' },
        { name: '*.jsx', detail: 'All JSX files' },
        { name: '*.css', detail: 'All CSS files' },
        { name: '*.scss', detail: 'All SCSS files' },
        { name: '*.md', detail: 'All Markdown files' },
        { name: '**/', detail: 'All subdirectories' },
        { name: '*.{js,ts}', detail: 'JavaScript and TypeScript files' },
        { name: '*.test.*', detail: 'All test files' },
        { name: '*.spec.*', detail: 'All spec files' }
      ];

      globPatterns.forEach(pattern => {
        const item = new vscode.CompletionItem(pattern.name, vscode.CompletionItemKind.File);
        item.detail = pattern.detail;
        item.insertText = pattern.name;
        completions.push(item);
      });

      // Add actual files in the directory
      files.forEach(file => {
        if (file !== '.order') {
          const filePath = path.join(currentDir, file);
          const stat = fs.statSync(filePath);
          
          const item = new vscode.CompletionItem(
            file, 
            stat.isDirectory() ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File
          );
          item.detail = stat.isDirectory() ? 'Directory' : 'File';
          item.insertText = file;
          completions.push(item);
        }
      });

      return completions;
    } catch (error) {
      console.error('Error reading directory for completions:', error);
      return [];
    }
  }

  private extractDirectiveName(linePrefix: string): string {
    const match = linePrefix.match(/@([a-zA-Z_][a-zA-Z0-9_]*)/);
    return match ? match[1] : '';
  }
}

export class OrderHoverProvider implements vscode.HoverProvider {
  
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    
    const range = document.getWordRangeAtPosition(position, /@[a-zA-Z_][a-zA-Z0-9_]*/);
    if (!range) return;

    const word = document.getText(range);
    const directiveName = word.substring(1); // Remove @

    const documentation = this.getDirectiveDocumentation(directiveName);
    if (documentation) {
      return new vscode.Hover(new vscode.MarkdownString(documentation), range);
    }

    return;
  }

  private getDirectiveDocumentation(directiveName: string): string | null {
    const docs: { [key: string]: string } = {
      'required': '**@required** - Indicates that a file matching the pattern must exist.\n\nExample: `README.md @required`',
      'allowif': '**@allowif** - Allow files only if they match the specified regex pattern.\n\nExample: `*.js @allowif(/^[a-z]/)`',
      'disallowif': '**@disallowif** - Disallow files if they match the specified regex pattern.\n\nExample: `*.js @disallowif(/\\.test\\./)`',
      'tiebreaker': '**@tiebreaker** - Specifies how files should be sorted when not explicitly ordered.\n\nExample: `@tiebreaker(@alphabetical, @extension)`',
      'groupby': '**@groupby** - Groups files together based on basename or capture groups.\n\nExample: `@groupby(basename)` or `@groupby($1)`',
      'metadata': '**@metadata** - Attaches JSON metadata to files for use by tools.\n\nExample: `*.js @metadata({"type": "source"})`',
      'alphabetical': '**@alphabetical** - Sort files alphabetically by name.',
      'reverse_alphabetical': '**@reverse_alphabetical** - Sort files in reverse alphabetical order.',
      'natural': '**@natural** - Sort using natural order (file2 before file10).',
      'extension': '**@extension** - Sort files by their file extension.',
      'size': '**@size** - Sort files by size (largest first).',
      'modified': '**@modified** - Sort files by last modification date (newest first).',
      'created': '**@created** - Sort files by creation date (newest first).',
      'enum': '**@enum** - Sort using enumerated values or capture groups.\n\nExample: `@enum($1)` or `@enum("high", "medium", "low")`'
    };

    return docs[directiveName] || null;
  }
}

