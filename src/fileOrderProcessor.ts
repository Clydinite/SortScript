import * as path from 'path';
import * as fs from 'fs';
import { OrderFile, Statement, Directive } from './parser';

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileItem[];
  metadata?: any;
  order?: number;
  group?: string;
}

export interface OrderRule {
  pattern: string | RegExp;
  directives: Directive[];
  isRequired?: boolean;
  allowPattern?: RegExp;
  disallowPattern?: RegExp;
  tiebreakers?: string[];
  groupBy?: string;
  metadata?: any;
}

export class FileOrderProcessor {
  private rules: OrderRule[] = [];
  private explicitOrder: string[] = [];

  constructor(private orderFile: OrderFile) {
    this.processOrderFile();
  }

  private processOrderFile() {
    this.processStatements(this.orderFile.statements);
  }

  private processStatements(statements: Statement[], basePath: string = '') {
    for (const statement of statements) {
      if (statement.type === 'pathBlock') {
        // Process nested path block
        const newBasePath = path.join(basePath, statement.pattern || '');
        this.processStatements(statement.block || [], newBasePath);
      } else if (statement.type === 'filePattern') {
        // Process file pattern with directives
        const rule = this.createRule(statement, basePath);
        this.rules.push(rule);
        
        // Track explicit order
        if (statement.pattern && !this.isGlobPattern(statement.pattern)) {
          this.explicitOrder.push(statement.pattern);
        }
      }
    }
  }

  private createRule(statement: Statement, basePath: string): OrderRule {
    const rule: OrderRule = {
      pattern: this.createPattern(statement.pattern || '', basePath),
      directives: statement.directives || []
    };

    // Process directives
    for (const directive of statement.directives || []) {
      switch (directive.name) {
        case 'required':
          rule.isRequired = true;
          break;
        case 'allowif':
          if (directive.args && directive.args[0]) {
            rule.allowPattern = this.parseRegex(directive.args[0] as string);
          }
          break;
        case 'disallowif':
          if (directive.args && directive.args[0]) {
            rule.disallowPattern = this.parseRegex(directive.args[0] as string);
          }
          break;
        case 'tiebreaker':
          rule.tiebreakers = this.parseTiebreakers(directive.args || []);
          break;
        case 'groupby':
          if (directive.args && directive.args[0]) {
            rule.groupBy = directive.args[0] as string;
          }
          break;
        case 'metadata':
          if (directive.args && directive.args[0]) {
            try {
              rule.metadata = JSON.parse(directive.args[0] as string);
            } catch (e) {
              console.warn('Invalid metadata JSON:', directive.args[0]);
            }
          }
          break;
      }
    }

    return rule;
  }

  private createPattern(pattern: string, basePath: string): string | RegExp {
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      // Regex pattern
      return new RegExp(pattern.slice(1, -1));
    } else {
      // Glob pattern - convert to full path
      return path.join(basePath, pattern);
    }
  }

  private parseRegex(regexStr: string): RegExp {
    if (regexStr.startsWith('/') && regexStr.includes('/')) {
      const lastSlash = regexStr.lastIndexOf('/');
      const pattern = regexStr.slice(1, lastSlash);
      const flags = regexStr.slice(lastSlash + 1);
      return new RegExp(pattern, flags);
    }
    return new RegExp(regexStr);
  }

  private parseTiebreakers(args: any[]): string[] {
    return args.map(arg => {
      if (typeof arg === 'object' && arg.name) {
        // Nested directive like @alphabetical
        return arg.name;
      }
      return arg as string;
    });
  }

  private isGlobPattern(pattern: string): boolean {
    return pattern.includes('*') || pattern.includes('?') || pattern.includes('[');
  }

  public orderFiles(files: FileItem[], dirPath: string): FileItem[] {
    const result: FileItem[] = [];
    const groups: Map<string, FileItem[]> = new Map();
    const ungrouped: FileItem[] = [];

    // First pass: apply rules and group files
    for (const file of files) {
      const matchingRule = this.findMatchingRule(file, dirPath);
      
      if (matchingRule) {
        // Apply validation
        if (!this.validateFile(file, matchingRule)) {
          continue; // Skip invalid files
        }

        // Apply metadata
        if (matchingRule.metadata) {
          file.metadata = { ...file.metadata, ...matchingRule.metadata };
        }

        // Group files if needed
        if (matchingRule.groupBy) {
          const groupKey = this.getGroupKey(file, matchingRule.groupBy);
          if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
          }
          groups.get(groupKey)!.push(file);
        } else {
          ungrouped.push(file);
        }
      } else {
        ungrouped.push(file);
      }
    }

    // Second pass: order files within groups and add to result
    for (const [groupKey, groupFiles] of groups) {
      const orderedGroup = this.orderFileGroup(groupFiles, dirPath);
      result.push(...orderedGroup);
    }

    // Add ungrouped files
    const orderedUngrouped = this.orderFileGroup(ungrouped, dirPath);
    result.push(...orderedUngrouped);

    return result;
  }

  private findMatchingRule(file: FileItem, dirPath: string): OrderRule | null {
    const filePath = path.relative(dirPath, file.path);
    
    for (const rule of this.rules) {
      if (typeof rule.pattern === 'string') {
        // Glob pattern matching
        if (this.matchGlob(rule.pattern, filePath)) {
          return rule;
        }
      } else {
        // Regex pattern matching
        if (rule.pattern.test(file.name)) {
          return rule;
        }
      }
    }
    
    return null;
  }

  private matchGlob(pattern: string, filePath: string): boolean {
    // Simple glob matching - can be enhanced with a proper glob library
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  private validateFile(file: FileItem, rule: OrderRule): boolean {
    if (rule.allowPattern && !rule.allowPattern.test(file.name)) {
      return false;
    }
    
    if (rule.disallowPattern && rule.disallowPattern.test(file.name)) {
      return false;
    }
    
    return true;
  }

  private getGroupKey(file: FileItem, groupBy: string): string {
    if (groupBy === 'basename') {
      const ext = path.extname(file.name);
      return path.basename(file.name, ext);
    }
    
    // Handle capture group references like $1
    if (groupBy.startsWith('$')) {
      // This would need to be implemented with actual regex matching
      // For now, return basename
      return path.basename(file.name, path.extname(file.name));
    }
    
    return groupBy;
  }

  private orderFileGroup(files: FileItem[], dirPath: string): FileItem[] {
    // Sort by explicit order first
    const explicitFiles: FileItem[] = [];
    const implicitFiles: FileItem[] = [];

    for (const file of files) {
      const explicitIndex = this.explicitOrder.indexOf(file.name);
      if (explicitIndex !== -1) {
        file.order = explicitIndex;
        explicitFiles.push(file);
      } else {
        implicitFiles.push(file);
      }
    }

    // Sort explicit files by their order
    explicitFiles.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Apply tiebreakers to implicit files
    const sortedImplicit = this.applyTiebreakers(implicitFiles);

    return [...explicitFiles, ...sortedImplicit];
  }

  private applyTiebreakers(files: FileItem[]): FileItem[] {
    // Default to alphabetical sorting
    return files.sort((a, b) => {
      // Directories first
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      
      // Then alphabetical
      return a.name.localeCompare(b.name);
    });
  }

  public getRequiredFiles(): string[] {
    return this.rules
      .filter(rule => rule.isRequired)
      .map(rule => typeof rule.pattern === 'string' ? rule.pattern : rule.pattern.source);
  }

  public validateRequiredFiles(files: FileItem[]): string[] {
    const requiredFiles = this.getRequiredFiles();
    const existingFiles = files.map(f => f.name);
    
    return requiredFiles.filter(required => !existingFiles.includes(required));
  }
}

