import { expect, it, describe, vi } from 'vitest';
import { FileOrderProcessor } from './fileOrderProcessor';
import { Directory, File, Group } from './structure';
import { parseOrderFile } from './parser';

// Mock implementations for Path and Fs interfaces
const mockPath = {
  join: (...paths: string[]) => paths.join('/'),
  relative: (from: string, to: string) => to.replace(from, ''),
  extname: (path: string) => {
    const lastDotIndex = path.lastIndexOf('.');
    return lastDotIndex !== -1 ? path.substring(lastDotIndex) : '';
  },
  basename: (path: string, ext?: string) => {
    const lastSlashIndex = path.lastIndexOf('/');
    let basename = lastSlashIndex !== -1 ? path.substring(lastSlashIndex + 1) : path;
    if (ext && basename.endsWith(ext)) {
      basename = basename.substring(0, basename.length - ext.length);
    }
    return basename;
  },
};

const mockFs = {
  statSync: vi.fn((_: string) => ({
    isDirectory: () => false,
    size: 0,
    mtimeMs: 0,
    birthtimeMs: 0,
  })),
};

describe('FileOrderProcessor (Unit Tests)', () => {
  it('should sort files alphabetically by default', () => {
    const orderFileContent = ''; // Empty order file for default sorting
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = new Directory('root', '/test');
    rootDir.children.push(new File('c.txt', '/test/c.txt'));
    rootDir.children.push(new File('a.txt', '/test/a.txt'));
    rootDir.children.push(new File('b.txt', '/test/b.txt'));

    const sortedDir = processor.orderFiles(rootDir);
    const fileNames = sortedDir.children.map(item => item.name);

    expect(fileNames).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('should apply explicit order from .order file', () => {
    const orderFileContent = `
      b.txt
      a.txt
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = new Directory('root', '/test');
    rootDir.children.push(new File('c.txt', '/test/c.txt'));
    rootDir.children.push(new File('a.txt', '/test/a.txt'));
    rootDir.children.push(new File('b.txt', '/test/b.txt'));

    const sortedDir = processor.orderFiles(rootDir);
    const fileNames = sortedDir.children.map(item => item.name);

    expect(fileNames).toEqual(['b.txt', 'a.txt', 'c.txt']);
  });

  it('should group files by basename', () => {
    const orderFileContent = `
      *.js @group_by(@basename)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = new Directory('root', '/test');
    rootDir.children.push(new File('component.js', '/test/component.js'));
    rootDir.children.push(new File('component.test.js', '/test/component.test.js'));
    rootDir.children.push(new File('another.js', '/test/another.js'));

    const sortedDir = processor.orderFiles(rootDir);
    
    expect(sortedDir.children.length).toBe(2); // Two groups: component and another
    expect(sortedDir.children[0]).toBeInstanceOf(Group);
    expect(sortedDir.children[0].name).toBe('another');
    expect(sortedDir.children[1]).toBeInstanceOf(Group);
    expect(sortedDir.children[1].name).toBe('component');

    const componentGroup = sortedDir.children[1] as Group;
    const componentFileNames = componentGroup.children.map(item => item.name);
    expect(componentFileNames).toEqual(['component.js', 'component.test.js']);
  });

  it('should hide files marked with @hidden', () => {
    const orderFileContent = `
      *.log @hidden
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = new Directory('root', '/test');
    rootDir.children.push(new File('app.log', '/test/app.log'));
    rootDir.children.push(new File('index.js', '/test/index.js'));

    const sortedDir = processor.orderFiles(rootDir);
    const fileNames = sortedDir.children.map(item => item.name);

    expect(fileNames).toEqual(['index.js']);
  });

  it('should mark files as @required', () => {
    const orderFileContent = `
      required.txt @required
      optional.txt
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = new Directory('root', '/test');
    rootDir.children.push(new File('required.txt', '/test/required.txt'));
    rootDir.children.push(new File('optional.txt', '/test/optional.txt'));

    const missingFiles = processor.validateRequiredFiles(rootDir);
    expect(missingFiles).toEqual([]);

    const rootDirMissing = new Directory('root', '/test');
    rootDirMissing.children.push(new File('optional.txt', '/test/optional.txt'));
    const missingFiles2 = processor.validateRequiredFiles(rootDirMissing);
    expect(missingFiles2).toEqual(['required.txt']);
  });

  it('should apply tiebreakers: alphabetical', () => {
    const orderFileContent = `
      @tiebreaker(@alphabetical)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = new Directory('root', '/test');
    rootDir.children.push(new File('c.txt', '/test/c.txt'));
    rootDir.children.push(new File('a.txt', '/test/a.txt'));
    rootDir.children.push(new File('b.txt', '/test/b.txt'));

    const sortedDir = processor.orderFiles(rootDir);
    const fileNames = sortedDir.children.map(item => item.name);

    expect(fileNames).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('should apply tiebreakers: reverse_alphabetical', () => {
    const orderFileContent = `
      @tiebreaker(@reverse_alphabetical)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = new Directory('root', '/test');
    rootDir.children.push(new File('c.txt', '/test/c.txt'));
    rootDir.children.push(new File('a.txt', '/test/a.txt'));
    rootDir.children.push(new File('b.txt', '/test/b.txt'));

    const sortedDir = processor.orderFiles(rootDir);
    const fileNames = sortedDir.children.map(item => item.name);
    expect(fileNames).toEqual(['c.txt', 'b.txt', 'a.txt']);
  });

  it('should apply tiebreakers: natural', () => {
    const orderFileContent = `
      @tiebreaker(@natural)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = new Directory('root', '/test');
    rootDir.children.push(new File('file10.txt', '/test/file10.txt'));
    rootDir.children.push(new File('file2.txt', '/test/file2.txt'));
    rootDir.children.push(new File('file1.txt', '/test/file1.txt'));

    const sortedDir = processor.orderFiles(rootDir);
    const fileNames = sortedDir.children.map(item => item.name);
    expect(fileNames).toEqual(['file1.txt', 'file2.txt', 'file10.txt']);
  });

  it('should apply tiebreakers: extension', () => {
    const orderFileContent = `
      @tiebreaker(@extension)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = new Directory('root', '/test');
    rootDir.children.push(new File('file.ts', '/test/file.ts'));
    rootDir.children.push(new File('file.js', '/test/file.js'));
    rootDir.children.push(new File('file.css', '/test/file.css'));

    const sortedDir = processor.orderFiles(rootDir);
    const fileNames = sortedDir.children.map(item => item.name);
    expect(fileNames).toEqual(['file.css', 'file.js', 'file.ts']); // Sorted by extension alphabetically
  });

  it('should apply tiebreakers: size', () => {
    const orderFileContent = `
      @tiebreaker(@size)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const fileA = new File('a.txt', '/test/a.txt');
    const fileB = new File('b.txt', '/test/b.txt');
    const fileC = new File('c.txt', '/test/c.txt');

    mockFs.statSync.mockImplementation((filePath: string) => {
      if (filePath === fileA.path) return { isDirectory: () => false, size: 100, mtimeMs: 0, birthtimeMs: 0 };
      if (filePath === fileB.path) return { isDirectory: () => false, size: 50, mtimeMs: 0, birthtimeMs: 0 };
      if (filePath === fileC.path) return { isDirectory: () => false, size: 200, mtimeMs: 0, birthtimeMs: 0 };
      return { isDirectory: () => false, size: 0, mtimeMs: 0, birthtimeMs: 0 };
    });

    const rootDir = new Directory('root', '/test');
    rootDir.children.push(fileA, fileB, fileC);

    const sortedDir = processor.orderFiles(rootDir);
    const fileNames = sortedDir.children.map(item => item.name);
    expect(fileNames).toEqual(['c.txt', 'a.txt', 'b.txt']); // Largest first
  });

  it('should apply tiebreakers: modified', () => {
    const orderFileContent = `
      @tiebreaker(@modified)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const fileA = new File('a.txt', '/test/a.txt');
    const fileB = new File('b.txt', '/test/b.txt');
    const fileC = new File('c.txt', '/test/c.txt');

    mockFs.statSync.mockImplementation((filePath: string) => {
      if (filePath === fileA.path) return { isDirectory: () => false, size: 0, mtimeMs: 100, birthtimeMs: 0 };
      if (filePath === fileB.path) return { isDirectory: () => false, size: 0, mtimeMs: 50, birthtimeMs: 0 };
      if (filePath === fileC.path) return { isDirectory: () => false, size: 0, mtimeMs: 200, birthtimeMs: 0 };
      return { isDirectory: () => false, size: 0, mtimeMs: 0, birthtimeMs: 0 };
    });

    const rootDir = new Directory('root', '/test');
    rootDir.children.push(fileA, fileB, fileC);

    const sortedDir = processor.orderFiles(rootDir);
    const fileNames = sortedDir.children.map(item => item.name);
    expect(fileNames).toEqual(['c.txt', 'a.txt', 'b.txt']); // Newest first
  });

  it('should apply tiebreakers: created', () => {
    const orderFileContent = `
      @tiebreaker(@created)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const fileA = new File('a.txt', '/test/a.txt');
    const fileB = new File('b.txt', '/test/b.txt');
    const fileC = new File('c.txt', '/test/c.txt');

    mockFs.statSync.mockImplementation((filePath: string) => {
      if (filePath === fileA.path) return { isDirectory: () => false, size: 0, mtimeMs: 0, birthtimeMs: 100 };
      if (filePath === fileB.path) return { isDirectory: () => false, size: 0, mtimeMs: 0, birthtimeMs: 50 };
      if (filePath === fileC.path) return { isDirectory: () => false, size: 0, mtimeMs: 0, birthtimeMs: 200 };
      return { isDirectory: () => false, size: 0, mtimeMs: 0, birthtimeMs: 0 };
    });

    const rootDir = new Directory('root', '/test');
    rootDir.children.push(fileA, fileB, fileC);

    const sortedDir = processor.orderFiles(rootDir);
    const fileNames = sortedDir.children.map(item => item.name);
    """    expect(fileNames).toEqual(['c.txt', 'a.txt', 'b.txt']); // Newest first
  });

  it('should match glob patterns correctly', () => {
    const orderFileContent = `
      *.js @group_by(@basename)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);
    const file = new File('component.js', '/test/component.js');
    const rule = (processor as any).findMatchingRule(file);
    expect(rule).not.toBeNull();
    expect(rule.groupBy).toBe('basename');
  });

  it('should return correct required files', () => {
    const orderFileContent = `
      required.txt @required
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);
    const requiredFiles = processor.getRequiredFiles();
    expect(requiredFiles).toEqual(['required.txt']);
  });
});""
