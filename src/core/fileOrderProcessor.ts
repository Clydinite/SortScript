import { minimatch } from 'minimatch';
import { OrderFile, Statement, Directive, CaptureGroupRef } from './parser';
import { FileSystemItem, File, Directory, Group } from './structure';

interface Path {
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  extname(path: string): string;
  basename(path: string, ext?: string): string;
}

interface Fs {
  statSync(path: string): { isDirectory(): boolean; size: number; mtimeMs: number; birthtimeMs: number; };
}

export class FileOrderProcessor {
  private rules: OrderRule[] = [];
  private explicitOrder: string[] = [];
  private globalTiebreakers: string[] = ['alphabetical'];

  constructor(private orderFile: OrderFile, private path: Path, private fs: Fs) {
    this.processOrderFile();
  }

  private processOrderFile() {
    this.processStatements(this.orderFile.statements);
  }

  private processStatements(statements: Statement[], basePath: string = '') {
    for (const statement of statements) {
      if (statement.type === 'pathBlock') {
        const newBasePath = this.path.join(basePath, statement.pattern || '');
        this.processStatements(statement.block || [], newBasePath);
      } else if (statement.type === 'filePattern') {
        const rule = this.createRule(statement, basePath);
        this.rules.push(rule);
        
        if (statement.pattern && !this.isGlobPattern(statement.pattern)) {
          this.explicitOrder.push(statement.pattern);
        }
      } else if (statement.type === 'directive') {
        if (statement.directive?.name === 'tiebreaker') {
            this.globalTiebreakers = this.parseTiebreakers(statement.directive.args || []);
        }
      }
    }
  }

  private createRule(statement: Statement, basePath: string): OrderRule {
    const rule: OrderRule = {
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
              rule.groupBy = arg.startsWith('@') ? arg.substring(1) : arg;
            } else if (typeof arg === 'object' && 'name' in arg) {
              rule.groupBy = (arg as Directive).name;
            }
          }
          break;
        case 'hidden':
          rule.isHidden = true;
          break;
      }
    }

    return rule;
  }

  private createPattern(pattern: string, basePath: string): string | RegExp {
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      return new RegExp(pattern.slice(1, -1));
    } else {
      return this.path.join(basePath, pattern);
    }
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

  public orderFiles(directory: Directory): Directory {
    const result = new Directory(directory.name, directory.path);
    const groups: Map<string, Group> = new Map();
    const ungrouped: FileSystemItem[] = [];

    for (const file of directory.children) {
      const rule = this.findMatchingRule(file);

      if (rule) {
        if (rule.isHidden) {
          continue;
        }

        if (rule.groupName) {
          if (!groups.has(rule.groupName)) {
            groups.set(rule.groupName, new Group(rule.groupName));
          }
          groups.get(rule.groupName)!.children.push(file);
        } else if (rule.groupBy) {
          const groupKey = this.getGroupKey(file as File, rule.groupBy);
          if (!groups.has(groupKey)) {
            groups.set(groupKey, new Group(groupKey));
          }
          groups.get(groupKey)!.children.push(file);
        } else {
          ungrouped.push(file);
        }
      } else {
        ungrouped.push(file);
      }
    }

    for (const [groupKey, group] of groups) {
      const orderedGroup = this.orderFileGroup(group.children);
      result.children.push(new Group(groupKey, orderedGroup));
    }

    result.children.push(...this.orderFileGroup(ungrouped));

    return result;
  }

  private findMatchingRule(file: FileSystemItem): OrderRule | null {
    const filePath = file instanceof File ? this.path.relative('/', file.path) : file.name;

    for (const rule of this.rules) {
      if (typeof rule.pattern === 'string') {
        const pattern = rule.pattern;
        const target = pattern.includes('/') ? filePath : file.name;
        if (minimatch(target, pattern)) {
          return rule;
        }
      } else if (rule.pattern instanceof RegExp) {
        if (rule.pattern.test(filePath)) {
          return rule;
        }
      }
    }

    return null;
  }

  private getGroupKey(file: File, groupBy: string): string {
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
  }

  private orderFileGroup(files: FileSystemItem[]): FileSystemItem[] {
    const explicitFiles: FileSystemItem[] = [];
    const implicitFiles: FileSystemItem[] = [];
    const explicitOrderMap = new Map<FileSystemItem, number>();

    for (const file of files) {
      const explicitIndex = this.explicitOrder.indexOf(file.name);
      if (explicitIndex !== -1) {
        explicitOrderMap.set(file, explicitIndex);
        explicitFiles.push(file);
      } else {
        implicitFiles.push(file);
      }
    }

    explicitFiles.sort((a, b) => (explicitOrderMap.get(a) ?? 0) - (explicitOrderMap.get(b) ?? 0));

    const tiebreakers = this.globalTiebreakers;
    const sortedImplicit = this.applyTiebreakers(implicitFiles, tiebreakers);

    return [...explicitFiles, ...sortedImplicit];
  }

  private applyTiebreakers(files: FileSystemItem[], tiebreakers: string[]): FileSystemItem[] {
    return files.sort((a, b) => {
      const aIsDir = a instanceof Directory;
      const bIsDir = b instanceof Directory;

      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;

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

      return a.name.localeCompare(b.name);
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

  public getRequiredFiles(): string[] {
    return this.rules
      .filter(rule => rule.isRequired)
      .map(rule => typeof rule.pattern === 'string' ? rule.pattern : rule.pattern.source);
  }

  public validateRequiredFiles(directory: Directory): string[] {
    const requiredPatterns = this.getRequiredFiles();
    const existingFiles = directory.children.map(f => f.name);
    
    return requiredPatterns.filter(pattern => {
      return !existingFiles.some(existingFile => minimatch(existingFile, pattern));
    });
  }
}

export interface OrderRule {
  pattern: string | RegExp;
  directives: Directive[];
  isRequired?: boolean;
  tiebreakers?: string[];
  groupBy?: string;
  groupName?: string;
  isHidden?: boolean;
}