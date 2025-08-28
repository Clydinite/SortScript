import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export class OrderCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        const linePrefix = document
            .lineAt(position)
            .text.substr(0, position.character);

        // Check if we're typing a directive
        if (linePrefix.endsWith("@")) {
            return this.getDirectiveCompletions();
        }

        // Check if we're inside a directive with parentheses
        if (
            linePrefix.includes("@") &&
            linePrefix.includes("(") &&
            !linePrefix.includes(")")
        ) {
            const directiveName = this.extractDirectiveName(linePrefix);
            return this.getDirectiveArgumentCompletions(directiveName);
        }

        // Check if we're typing a file pattern
        if (!linePrefix.includes("@") && !linePrefix.includes("{")) {
            return this.getFilePatternCompletions(document, position);
        }

        return [];
    }

    private getDirectiveCompletions(): vscode.CompletionItem[] {
        const directives = [
            {
                name: "required",
                detail: "Mark file as required",
                documentation:
                    "Indicates that a file matching the pattern must exist.",
                insertText: "required",
            },
            {
                name: "allow_if",
                detail: "Allow files matching pattern",
                documentation:
                    "Allow files only if they match the specified regex pattern.",
                insertText: "allow_if(/^[a-z]/)",
            },
            {
                name: "disallow_if",
                detail: "Disallow files matching pattern",
                documentation:
                    "Disallow files if they match the specified regex pattern.",
                insertText: "disallow_if(/\\.test\\./)",
            },
            {
                name: "tiebreaker",
                detail: "Specify sorting method for unordered files",
                documentation:
                    "Specifies how files should be sorted when not explicitly ordered.",
                insertText: "tiebreaker(@alphabetical)",
            },
            {
                name: "group_by",
                detail: "Group related files together",
                documentation:
                    "Groups files together based on basename or capture groups.",
                insertText: "group_by(@basename)",
            },
        ];

        return directives.map((directive) => {
            const item = new vscode.CompletionItem(
                directive.name,
                vscode.CompletionItemKind.Keyword
            );
            item.detail = directive.detail;
            item.documentation = new vscode.MarkdownString(
                directive.documentation
            );
            item.insertText = directive.insertText;
            return item;
        });
    }

    private getDirectiveArgumentCompletions(
        directiveName: string
    ): vscode.CompletionItem[] {
        switch (directiveName) {
            case "tiebreaker":
                return this.getTiebreakerCompletions();
            case "group_by":
                return this.getgroup_byCompletions();
            default:
                return [];
        }
    }

    private getTiebreakerCompletions(): vscode.CompletionItem[] {
        const methods = [
            {
                name: "@alphabetical",
                detail: "Sort alphabetically",
                documentation: "Sort files alphabetically by name.",
            },
            {
                name: "@reverse_alphabetical",
                detail: "Sort reverse alphabetically",
                documentation: "Sort files in reverse alphabetical order.",
            },
            {
                name: "@natural",
                detail: "Natural sort order",
                documentation:
                    "Sort using natural order (file2 before file10).",
            },
            {
                name: "@extension",
                detail: "Sort by file extension",
                documentation: "Sort files by their file extension.",
            },
            {
                name: "@size",
                detail: "Sort by file size",
                documentation: "Sort files by size (largest first).",
            },
            {
                name: "@modified",
                detail: "Sort by modification date",
                documentation:
                    "Sort files by last modification date (newest first).",
            },
            {
                name: "@created",
                detail: "Sort by creation date",
                documentation: "Sort files by creation date (newest first).",
            },
        ];

        return methods.map((method) => {
            const item = new vscode.CompletionItem(
                method.name,
                vscode.CompletionItemKind.Method
            );
            item.detail = method.detail;
            item.documentation = new vscode.MarkdownString(
                method.documentation
            );
            item.insertText = method.name;
            return item;
        });
    }

    private getgroup_byCompletions(): vscode.CompletionItem[] {
        const options = [
            {
                name: "basename",
                detail: "Group by file basename",
                documentation:
                    "Group files by their basename (filename without extension).",
            },
            {
                name: "extension",
                detail: "Group by file extension",
                documentation: "Group files by their file extension.",
            },
        ];

        return options.map((option) => {
            const item = new vscode.CompletionItem(
                option.name,
                vscode.CompletionItemKind.Value
            );
            item.detail = option.detail;
            item.documentation = new vscode.MarkdownString(
                option.documentation
            );
            item.insertText = option.name;
            return item;
        });
    }

    private getFilePatternCompletions(
        document: vscode.TextDocument,
        _position: vscode.Position
    ): vscode.CompletionItem[] {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
            document.uri
        );
        if (!workspaceFolder) return [];

        const currentDir = path.dirname(document.uri.fsPath);

        try {
            const files = fs.readdirSync(currentDir);
            const completions: vscode.CompletionItem[] = [];

            // Add common glob patterns
            const globPatterns = [
                { name: "*.js", detail: "All JavaScript files" },
                { name: "*.ts", detail: "All TypeScript files" },
                { name: "*.tsx", detail: "All TSX files" },
                { name: "*.jsx", detail: "All JSX files" },
                { name: "src/**", detail: "All files in the src directory" },
                {
                    name: "src/*.js",
                    detail: "All JavaScript files in the src directory",
                },
                {
                    name: "src/*.ts",
                    detail: "All TypeScript files in the src directory",
                },
                { name: "*.css", detail: "All CSS files" },
                { name: "*.scss", detail: "All SCSS files" },
                { name: "*.md", detail: "All Markdown files" },
                { name: "**/", detail: "All subdirectories" },
                {
                    name: "*.{js,ts}",
                    detail: "JavaScript and TypeScript files",
                },
                { name: "*.test.*", detail: "All test files" },
                { name: "*.spec.*", detail: "All spec files" },
            ];

            globPatterns.forEach((pattern) => {
                const item = new vscode.CompletionItem(
                    pattern.name,
                    vscode.CompletionItemKind.File
                );
                item.detail = pattern.detail;
                item.insertText = pattern.name;
                completions.push(item);
            });

            // Add actual files in the directory
            files.forEach((file) => {
                if (file !== ".order") {
                    const filePath = path.join(currentDir, file);
                    const stat = fs.statSync(filePath);

                    const item = new vscode.CompletionItem(
                        file,
                        stat.isDirectory()
                            ? vscode.CompletionItemKind.Folder
                            : vscode.CompletionItemKind.File
                    );
                    item.detail = stat.isDirectory() ? "Directory" : "File";
                    item.insertText = file;
                    completions.push(item);
                }
            });

            return completions;
        } catch (error) {
            console.error("Error reading directory for completions:", error);
            return [];
        }
    }

    private extractDirectiveName(linePrefix: string): string {
        const match = linePrefix.match(/@([a-zA-Z_][a-zA-Z0-9_]*)/);
        return match ? match[1] : "";
    }
}

export class OrderHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        const range = document.getWordRangeAtPosition(
            position,
            /@[a-zA-Z_][a-zA-Z0-9_]*/
        );
        if (!range) return;

        const word = document.getText(range);
        const directiveName = word.substring(1); // Remove @

        const documentation = this.getDirectiveDocumentation(directiveName);
        if (documentation) {
            return new vscode.Hover(
                new vscode.MarkdownString(documentation),
                range
            );
        }

        return;
    }

    private getDirectiveDocumentation(directiveName: string): string | null {
        const docs: { [key: string]: string } = {
            required:
                "**@required** - Indicates that a file matching the pattern must exist.\n\nExample: `README.md @required`",
            allow_if:
                "**@allow_if** - Allow files only if they match the specified regex pattern.\n\nExample: `*.js @allow_if(/^[a-z]/)`",
            disallow_if:
                "**@disallow_if** - Disallow files if they match the specified regex pattern.\n\nExample: `*.js @disallow_if(/\\.test\\./)`",
            tiebreaker:
                "**@tiebreaker** - Specifies how files should be sorted when not explicitly ordered.\n\nExample: `@tiebreaker(@alphabetical, @extension)`",
            group_by:
                "**@group_by** - Groups files together based on basename or capture groups.\n\nExample: `@group_by(basename)` or `@group_by($1)`",
            alphabetical:
                "**@alphabetical** - Sort files alphabetically by name.",
            reverse_alphabetical:
                "**@reverse_alphabetical** - Sort files in reverse alphabetical order.",
            natural:
                "**@natural** - Sort using natural order (file2 before file10).",
            extension: "**@extension** - Sort files by their file extension.",
            size: "**@size** - Sort files by size (largest first).",
            modified:
                "**@modified** - Sort files by last modification date (newest first).",
            created:
                "**@created** - Sort files by creation date (newest first).",
        };

        return docs[directiveName] || null;
    }
}
