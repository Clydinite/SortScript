import { minimatch } from "minimatch";
import { OrderFile, Statement, Directive, CaptureGroupRef } from "./parser";
import { FileSystemItem, File, Directory, Group, FileState } from "./structure";

interface Path {
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  extname(path: string): string;
  basename(path: string, ext?: string): string;
}

interface Fs {
  statSync(path: string): {
    isDirectory(): boolean;
    size: number;
    mtimeMs: number;
    birthtimeMs: number;
  };
}

interface Rule {
  pattern: string | RegExp;
  directives: Directive[];
  isRequired?: boolean;
  tiebreakers?: string[];
  groupName?: string;
  groupBy?: string | RegExp;
  isHidden?: boolean;
  allowIf?: RegExp;
  disallowIf?: RegExp;
}

interface ProcessStatementsResult {
  rules: Rule[];
  tiebreakers: string[];
  explicitOrder: string[];
}

export class FileOrderProcessor {
  constructor(
    private orderFile: OrderFile,
    private path: Path,
    private fs: Fs
  ) {}

  public orderFiles(directory: Directory): Directory {
    const result = this.processDirectory(directory, this.orderFile.statements);
    return result;
  }

  private processDirectory(directory: Directory, statements: Statement[], basePath = ''): Directory {
    const result = new Directory(directory.name, []);
    const children = [...directory.children];

    const { rules, tiebreakers, explicitOrder } = this.processStatements(statements, basePath);

    const groupBlocks = statements.filter(s => s.type === 'groupBlock');
    const groups: Group[] = [];
    for (const block of groupBlocks) {
        const group = new Group(block.groupName || '', []);
        const groupFilePatterns = (block.block || []).map(st => st.pattern || '');
        for (const pattern of groupFilePatterns) {
            const fileIndex = children.findIndex(f => f.name === pattern);
            if (fileIndex > -1) {
                group.children.push(children[fileIndex]);
                children.splice(fileIndex, 1);
            }
        }
        if (group.children.length > 0) {
            groups.push(group);
        }
    }

    result.children.push(...groups);

    const explicitlyOrderedItems: FileSystemItem[] = [];
    const remainingItems: FileSystemItem[] = [];
    const processedItems = new Set<FileSystemItem>();

    // Handle explicit order first
    for (const pattern of explicitOrder) {
      for (const item of children) {
        if (!processedItems.has(item) && minimatch(item.name, pattern, { matchBase: true })) {
          explicitlyOrderedItems.push(item);
          processedItems.add(item);
        }
      }
    }

    // Separate remaining items
    for (const item of children) {
      if (!processedItems.has(item)) {
        remainingItems.push(item);
      }
    }

    // Apply rules (grouping, hiding, etc.) to the remaining items
    const { orderedChildren: ruleOrderedItems, remainingChildren: finalRemainingItems } = this.applyRulesToChildren(
      remainingItems,
      rules,
      tiebreakers
    );

    // Process subdirectories recursively
    const processedSubdirectories = new Set<FileSystemItem>();
    const finalChildren = [...explicitlyOrderedItems, ...ruleOrderedItems, ...finalRemainingItems];
    for (const item of finalChildren) {
      if (item instanceof Directory) {
        const pathBlock = this.findMatchingPathBlock(this.path.join(basePath, item.name), statements);
        if (pathBlock) {
          const subDirectoryStatements = pathBlock.block || [];
          const sortedSubDirectory = this.processDirectory(item, subDirectoryStatements, this.path.join(basePath, item.name));
          result.children.push(sortedSubDirectory);
          processedSubdirectories.add(item);
        } 
      }
    }

    // Add all non-directory items and non-processed directories
    for(const item of finalChildren) {
        if (!(item instanceof Directory)) {
            result.children.push(item);
        } else if (!processedSubdirectories.has(item)) {
            result.children.push(this.processDirectory(item, [], this.path.join(basePath, item.name)));
        }
    }
    
    // Final sort of the directory content
    result.children = this.applyTiebreakers(result.children, tiebreakers);

    // Re-apply explicit order at the end to ensure it is respected
    const finalExplicitlyOrdered: FileSystemItem[] = [];
    const finalRemaining: FileSystemItem[] = [...result.children];
    const finalProcessed = new Set<FileSystemItem>();

    for (const pattern of explicitOrder) {
        let foundIndex = -1;
        for (let i = 0; i < finalRemaining.length; i++) {
            const item = finalRemaining[i];
            if (!finalProcessed.has(item) && minimatch(item.name, pattern, { matchBase: true })) {
                finalExplicitlyOrdered.push(item);
                finalProcessed.add(item);
                foundIndex = i;
                break; 
            }
        }
        if (foundIndex > -1) {
            finalRemaining.splice(foundIndex, 1);
        }
    }

    result.children = [...finalExplicitlyOrdered, ...finalRemaining];

    return result;
  }

  private findMatchingPathBlock(itemName: string, statements: Statement[]): Statement | undefined {
    for (const statement of statements) {
      if (statement.type === 'pathBlock' && minimatch(itemName, statement.pattern || '', { matchBase: true })) {
        return statement;
      }
    }
    return undefined;
  }

  private processStatements(statements: Statement[], basePath: string): ProcessStatementsResult {
    const rules: Rule[] = [];
    let tiebreakers: string[] = [];
    const explicitOrder: string[] = [];

    for (const statement of statements) {
        if (statement.type === 'filePattern') {
            if (!this.isGlobPattern(statement.pattern || '') && !statement.directives?.length) {
                explicitOrder.push(statement.pattern || '');
            }
            const rule: any = {
              pattern: this.createPattern(statement.pattern || '', basePath),
              directives: statement.directives || []
            };
            for (const directive of statement.directives || []) {
              switch (directive.name) {
                case 'required':
                  rule.isRequired = true;
                  break;
                case 'tiebreaker':
                  rule.tiebreakers = this.parseTiebreakers(directive.args || []);
                  break;
                case 'group':
                  if (directive.args && directive.args[0]) {
                    rule.groupName = directive.args[0] as string;
                  }
                  break;
                case 'group_by':
                  if (directive.args && directive.args[0]) {
                    const arg = directive.args[0];
                    if (typeof arg === 'string') {
                      if (arg.startsWith('/') && arg.endsWith('/')) {
                        rule.groupBy = new RegExp(arg.slice(1, -1));
                      } else {
                        rule.groupBy = arg.startsWith('@') ? arg.substring(1) : arg;
                      }
                    } else if (typeof arg === 'object' && 'name' in arg) {
                      rule.groupBy = (arg as Directive).name;
                    }
                  }
                  break;
                case 'hidden':
                  rule.isHidden = true;
                  break;
                case 'allow_if':
                  if (directive.args && directive.args[0]) {
                    const arg = directive.args[0] as string;
                    if (arg.startsWith('/') && arg.endsWith('/')) {
                      rule.allowIf = new RegExp(arg.slice(1, -1));
                    }
                  }
                  break;
                case 'disallow_if':
                  if (directive.args && directive.args[0]) {
                    const arg = directive.args[0] as string;
                    if (arg.startsWith('/') && arg.endsWith('/')) {
                      rule.disallowIf = new RegExp(arg.slice(1, -1));
                    }
                  }
                  break;
              }
            }
            rules.push(rule);
        } else if (statement.type === 'directive') {
            if (statement.directive?.name === 'tiebreaker') {
                tiebreakers = this.parseTiebreakers(statement.directive.args || []);
            }
        } else if (statement.type === 'pathBlock') {
            if (statement.pattern === '') { // @root block
                const rootBlockScope = this.processStatements(statement.block || [], basePath);
                tiebreakers.push(...rootBlockScope.tiebreakers);
                rules.push(...rootBlockScope.rules);
                explicitOrder.push(...rootBlockScope.explicitOrder);
            } else {
                // For path blocks, rules are handled when processing the directory
            }
        } else if (statement.type === 'groupBlock') {
            const group = new Group(statement.groupName || '');
            const groupScope = this.processStatements(statement.block || [], '');
            const rule: Rule = {
                pattern: '', 
                directives: [],
                groupName: statement.groupName,
                tiebreakers: groupScope.tiebreakers,
            };
            rules.push(rule);
        }
    }

    if (tiebreakers.length === 0) {
        tiebreakers.push('alphabetical');
    }

    return { rules, tiebreakers, explicitOrder };
  }

  private applyRulesToChildren(
    children: FileSystemItem[],
    rules: Rule[],
    incomingTiebreakers: string[]
  ): { orderedChildren: FileSystemItem[], remainingChildren: FileSystemItem[] } {
    let orderedChildren: FileSystemItem[] = [];
    let remainingChildren: FileSystemItem[] = [...children];
    const groups: Map<string, Group> = new Map();
    const processedItems = new Set<FileSystemItem>();

    for (const rule of rules) {
        const matchedFiles = remainingChildren.filter(item => {
            if (processedItems.has(item)) return false;
            const filePath = item instanceof File ? this.path.relative('/', item.path) : item.name;
            if (typeof rule.pattern === 'string') {
                return minimatch(filePath, rule.pattern, { matchBase: true });
            } else if (rule.pattern instanceof RegExp) {
                return rule.pattern.test(filePath);
            }
            return false;
        });

        for (const file of matchedFiles) {
            if (rule.isHidden) {
                processedItems.add(file);
                continue;
            }

            if (rule.disallowIf && rule.disallowIf.test(file.name)) {
                (file as File).state = FileState.Disallowed;
            } else if (rule.allowIf) {
                (file as File).state = rule.allowIf.test(file.name) ? FileState.Normal : FileState.Disallowed;
            } else {
                (file as File).state = FileState.Normal;
            }

            if (rule.groupName) {
                if (!groups.has(rule.groupName)) {
                    groups.set(rule.groupName, new Group(rule.groupName));
                }
                groups.get(rule.groupName)!.children.push(file);
                processedItems.add(file);
            } else if (rule.groupBy) {
                const groupKey = this.getGroupKey(file as File, rule.groupBy);
                if (groupKey) {
                    if (!groups.has(groupKey)) {
                        groups.set(groupKey, new Group(groupKey));
                    }
                    groups.get(groupKey)!.children.push(file);
                    processedItems.add(file);
                }
            } else {
                orderedChildren.push(file);
                processedItems.add(file);
            }
        }
    }

    remainingChildren = remainingChildren.filter(item => !processedItems.has(item));

    const groupItems: FileSystemItem[] = [];
    const sortedGroupKeys = Array.from(groups.keys()).sort();
    for (const key of sortedGroupKeys) {
        const group = groups.get(key)!;
        group.children = this.applyTiebreakers(group.children, incomingTiebreakers);
        groupItems.push(group);
    }

    orderedChildren.push(...groupItems);
    orderedChildren = this.applyTiebreakers(orderedChildren, incomingTiebreakers);
    
    return { orderedChildren, remainingChildren };
  }

  private createPattern(pattern: string, basePath: string): string | RegExp {
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      return new RegExp(pattern.slice(1, -1));
    }
    return this.path.join(basePath, pattern);
  }

  private parseTiebreakers(args: (string | Directive | CaptureGroupRef)[]): string[] {
    return args.map(arg => {
      let value: string;
      if (typeof arg === 'object' && arg !== null && 'name' in arg) {
        value = (arg as Directive).name;
      } else {
        value = arg as string;
      }
      return value.startsWith('@') ? value.substring(1) : value;
    });
  }

  private isGlobPattern(pattern: string): boolean {
    return pattern.includes('*') || pattern.includes('?') || pattern.includes('[');
  }

  private getGroupKey(file: File, groupBy: string | RegExp): string {
    if (typeof groupBy === 'string') {
        if (groupBy === 'basename') {
            let basename = file.name;
            let ext = this.path.extname(basename);
            while(ext) {
                basename = this.path.basename(basename, ext);
                ext = this.path.extname(basename);
            }
            return basename;
        }
        return groupBy;
    } else if (groupBy instanceof RegExp) {
        const match = file.name.match(groupBy);
        if (match && match[1]) {
            return match[1];
        }
        return '';
    }
    return '';
  }

  private applyTiebreakers(files: FileSystemItem[], tiebreakers: string[]): FileSystemItem[] {
    return files.sort((a, b) => {
      const aIsGroup = a instanceof Group;
      const bIsGroup = b instanceof Group;
      const aIsDir = a instanceof Directory;
      const bIsDir = b instanceof Directory;

      // Directories first
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;

      // Groups after directories
      if (aIsGroup && !bIsGroup) return -1;
      if (!aIsGroup && bIsGroup) return 1;

      // Apply tiebreakers for items of the same type or files
      for (const tiebreaker of tiebreakers) {
        let result = 0;
        switch (tiebreaker) {
          case 'alphabetical':
            result = a.name.localeCompare(b.name);
            break;
          case 'reverse_alphabetical':
            result = b.name.localeCompare(a.name);
            break;
          case 'natural':
            result = this.naturalCompare(a.name, b.name);
            break;
          case 'extension':
            result = this.path.extname(a.name).localeCompare(this.path.extname(b.name));
            break;
          case 'size':
            try {
              const aSize = this.fs.statSync((a as File).path).size;
              const bSize = this.fs.statSync((b as File).path).size;
              result = bSize - aSize;
            } catch {
              result = 0;
            }
            break;
          case 'modified':
            try {
              const aTime = this.fs.statSync((a as File).path).mtimeMs;
              const bTime = this.fs.statSync((b as File).path).mtimeMs;
              result = bTime - aTime;
            } catch {
              result = 0;
            }
            break;
          case 'created':
            try {
              const aTime = this.fs.statSync((a as File).path).birthtimeMs;
              const bTime = this.fs.statSync((b as File).path).birthtimeMs;
              result = bTime - aTime;
            } catch {
              result = 0;
            }
            break;
        }
        if (result !== 0) return result;
      }

      return 0; 
    });
  }

  private naturalCompare(a: string, b: string): number {
    const aParts = a.match(/(\d+)|(\D+)/g) || [];
    const bParts = b.match(/(\d+)|(\D+)/g) || [];

    for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
      const aPart = aParts[i];
      const bPart = bParts[i];

      if (!isNaN(parseInt(aPart)) && !isNaN(parseInt(bPart))) {
        const numA = parseInt(aPart);
        const numB = parseInt(bPart);
        if (numA !== numB) {
          return numA - numB;
        }
      } else {
        if (aPart !== bPart) {
          return aPart.localeCompare(bPart);
        }
      }
    }

    return a.length - b.length;
  }

  public validateRequiredFiles(directory: Directory): string[] {
    const missingFiles: string[] = [];
    const requiredPatterns = this.getRequiredFilesFromStatements(this.orderFile.statements);

    for (const pattern of requiredPatterns) {
      let found = false;
      const searchDirectory = (dir: Directory) => {
        for (const item of dir.children) {
          if (item instanceof File) {
            const filePath = this.path.relative('/', item.path);
            if (minimatch(filePath, pattern, { matchBase: true })) {
              found = true;
              break;
            }
          } else if (item instanceof Directory) {
            searchDirectory(item);
            if (found) break;
          }
        }
      };
      searchDirectory(directory);

      if (!found) {
        missingFiles.push(pattern.toString());
      }
    }
    return missingFiles;
  }

  private getRequiredFilesFromStatements(statements: Statement[]): string[] {
      const requiredPatterns: string[] = [];
      for (const statement of statements) {
          if (statement.type === 'filePattern') {
              for (const directive of statement.directives || []) {
                  if (directive.name === 'required') {
                      if (statement.pattern) {
                          requiredPatterns.push(statement.pattern);
                      }
                  }
              }
          } else if (statement.type === 'pathBlock' && statement.block) {
              requiredPatterns.push(...this.getRequiredFilesFromStatements(statement.block));
          } else if (statement.type === 'groupBlock' && statement.block) {
              requiredPatterns.push(...this.getRequiredFilesFromStatements(statement.block));
          }
      }
      return requiredPatterns;
  }
}
