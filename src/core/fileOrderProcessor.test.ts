import { expect, it, describe, vi } from 'vitest';
import { FileOrderProcessor } from './fileOrderProcessor';
import { Directory, File, Group, FileState } from './structure';
import { parseOrderFile } from './parser';
import { createRoot, assertFileSystem } from './testUtils';

// Mock implementations for Path and Fs interfaces
const mockPath = {
  join: (...paths: string[]) => paths.filter(p => p).join('/'),
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
  statSync: vi.fn((path: string) => ({
    isDirectory: () => !path.includes('.'),
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

    const rootDir = createRoot([
      new File('c.txt'),
      new File('a.txt'),
      new File('b.txt'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);

    const expectedDir = createRoot([
      new File('a.txt'),
      new File('b.txt'),
      new File('c.txt'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should apply explicit order from .order file', () => {
    const orderFileContent = `
      b.txt
      a.txt
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
      new File('c.txt'),
      new File('a.txt'),
      new File('b.txt'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
      new File('b.txt'),
      new File('a.txt'),
      new File('c.txt'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should group files by basename', () => {
    const orderFileContent = `
      *.js @group_by(@basename)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
      new File('component.js'),
      new File('component.test.js'),
      new File('another.js'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    
    const expectedDir = createRoot([
        new Group('another', [
            new File('another.js'),
        ]),
        new Group('component', [
            new File('component.js'),
            new File('component.test.js'),
        ]),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should hide files marked with @hidden', () => {
    const orderFileContent = `
      *.log @hidden
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
      new File('app.log'),
      new File('index.js'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new File('index.js'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should mark files as @required', () => {
    const orderFileContent = `
      required.txt @required
      optional.txt
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
        new File('required.txt'),
        new File('optional.txt'),
    ]);

    const missingFiles = processor.validateRequiredFiles(rootDir);
    expect(missingFiles).toEqual([]);

    const rootDirMissing = createRoot([
        new File('optional.txt'),
    ]);
    const missingFiles2 = processor.validateRequiredFiles(rootDirMissing);
    expect(missingFiles2).toEqual(['required.txt']);
  });

  it('should apply tiebreakers: alphabetical', () => {
    const orderFileContent = `
      @tiebreaker(@alphabetical)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
      new File('c.txt'),
      new File('a.txt'),
      new File('b.txt'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new File('a.txt'),
        new File('b.txt'),
        new File('c.txt'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should apply tiebreakers: reverse_alphabetical', () => {
    const orderFileContent = `
      @tiebreaker(@reverse_alphabetical)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
      new File('c.txt'),
      new File('a.txt'),
      new File('b.txt'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new File('c.txt'),
        new File('b.txt'),
        new File('a.txt'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should apply tiebreakers: natural', () => {
    const orderFileContent = `
      @tiebreaker(@natural)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
      new File('file10.txt'),
      new File('file2.txt'),
      new File('file1.txt'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new File('file1.txt'),
        new File('file2.txt'),
        new File('file10.txt'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should apply tiebreakers: extension', () => {
    const orderFileContent = `
      @tiebreaker(@extension)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
      new File('file.ts'),
      new File('file.js'),
      new File('file.css'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new File('file.css'),
        new File('file.js'),
        new File('file.ts'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should apply tiebreakers: size', () => {
    const orderFileContent = `
      @tiebreaker(@size)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
        new File('a.txt'),
        new File('b.txt'),
        new File('c.txt'),
    ]);

    mockFs.statSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith('a.txt')) return { isDirectory: () => false, size: 100, mtimeMs: 0, birthtimeMs: 0 };
      if (filePath.endsWith('b.txt')) return { isDirectory: () => false, size: 50, mtimeMs: 0, birthtimeMs: 0 };
      if (filePath.endsWith('c.txt')) return { isDirectory: () => false, size: 200, mtimeMs: 0, birthtimeMs: 0 };
      return { isDirectory: () => false, size: 0, mtimeMs: 0, birthtimeMs: 0 };
    });

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new File('c.txt'),
        new File('a.txt'),
        new File('b.txt'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should apply tiebreakers: modified', () => {
    const orderFileContent = `
      @tiebreaker(@modified)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
        new File('a.txt'),
        new File('b.txt'),
        new File('c.txt'),
    ]);

    mockFs.statSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith('a.txt')) return { isDirectory: () => false, size: 0, mtimeMs: 100, birthtimeMs: 0 };
      if (filePath.endsWith('b.txt')) return { isDirectory: () => false, size: 0, mtimeMs: 50, birthtimeMs: 0 };
      if (filePath.endsWith('c.txt')) return { isDirectory: () => false, size: 0, mtimeMs: 200, birthtimeMs: 0 };
      return { isDirectory: () => false, size: 0, mtimeMs: 0, birthtimeMs: 0 };
    });

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new File('c.txt'),
        new File('a.txt'),
        new File('b.txt'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should apply tiebreakers: created', () => {
    const orderFileContent = `
      @tiebreaker(@created)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
        new File('a.txt'),
        new File('b.txt'),
        new File('c.txt'),
    ]);

    mockFs.statSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith('a.txt')) return { isDirectory: () => false, size: 0, mtimeMs: 0, birthtimeMs: 100 };
      if (filePath.endsWith('b.txt')) return { isDirectory: () => false, size: 0, mtimeMs: 0, birthtimeMs: 50 };
      if (filePath.endsWith('c.txt')) return { isDirectory: () => false, size: 0, mtimeMs: 0, birthtimeMs: 200 };
      return { isDirectory: () => false, size: 0, mtimeMs: 0, birthtimeMs: 0 };
    });

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new File('c.txt'),
        new File('a.txt'),
        new File('b.txt'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should group files by a named group block', () => {
    const orderFileContent = `
      @group("JS Files") {
        a.js
        b.js
      }
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
      new File('a.js'),
      new File('b.js'),
      new File('c.js'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new Group('JS Files', [
            new File('a.js'),
            new File('b.js'),
        ]),
        new File('c.js'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should handle @root directive', () => {
    const orderFileContent = `
      @root {
        @tiebreaker(@reverse_alphabetical)
      }
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
      new File('a.txt'),
      new File('b.txt'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new File('b.txt'),
        new File('a.txt'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should set FileState for @allow_if', () => {
    const orderFileContent = `
      *.js @allow_if(/component/)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
        new File('component.js'),
        new File('another.js'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    
    const sortedComponentFile = sortedDir.children.find(f => f.name === 'component.js') as File;
    const sortedAnotherFile = sortedDir.children.find(f => f.name === 'another.js') as File;

    expect(sortedComponentFile.state).toBe(FileState.Normal);
    expect(sortedAnotherFile.state).toBe(FileState.Disallowed);
  });

  it('should group files by regex capture group', () => {
    const orderFileContent = `
      *.js @group_by(/^(.*)\.js$/)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
      new File('feature-a.js'),
      new File('feature-b.js'),
      new File('util.js'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new Group('feature-a', [new File('feature-a.js')]),
        new Group('feature-b', [new File('feature-b.js')]),
        new Group('util', [new File('util.js')]),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should set FileState for @disallow_if', () => {
    const orderFileContent = `
      *.js @disallow_if(/component/)
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
        new File('component.js'),
        new File('another.js'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    
    const sortedComponentFile = sortedDir.children.find(f => f.name === 'component.js') as File;
    const sortedAnotherFile = sortedDir.children.find(f => f.name === 'another.js') as File;

    expect(sortedComponentFile.state).toBe(FileState.Disallowed);
    expect(sortedAnotherFile.state).toBe(FileState.Normal);
  });
});

describe('FileOrderProcessor (Complex Cases)', () => {
  // Test 1: Nested blocks and directives
  it('should handle nested path blocks with directives', () => {
    const orderFileContent = `
      *.md @tiebreaker(@alphabetical) {
        setup_tutorial.md
        faq.md
        error_codes.md
      }
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
        new Directory('docs', [
            new File('error_codes.md'),
            new File('faq.md'),
            new File('setup_tutorial.md'),
            new File('b.md'),
            new File('a.md'),
            new File('image.png'),
        ])
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new Directory('docs', [
            new File('setup_tutorial.md'),
            new File('faq.md'),
            new File('error_codes.md'),
            new File('a.md'),
            new File('b.md'),
            new File('image.png'),
        ])
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  // Test 2: @group block with mixed content
  it('should handle @group block with mixed content', () => {
    const orderFileContent = `
      @group("Config") {
        package.json
        tsconfig.json
        .gitignore
      }
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
        new File('tsconfig.json'),
        new File('package.json'),
        new File('.gitignore'),
        new File('README.md'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new Group('Config', [
            new File('package.json'),
            new File('tsconfig.json'),
            new File('.gitignore'),
        ]),
        new File('README.md'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should respect explicit ordering within a path block', () => {
    const orderFileContent = `
      docs/ {
        fileC.md
        fileA.md
        fileB.md
      }
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
        new Directory('docs', [
            new File('fileA.md'),
            new File('fileB.md'),
            new File('fileC.md'),
        ])
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new Directory('docs', [
            new File('fileC.md'),
            new File('fileA.md'),
            new File('fileB.md'),
        ])
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should apply tiebreakers to all files within a path block if no explicit files', () => {
    const orderFileContent = `
      docs/ {
        *.md @tiebreaker(@reverse_alphabetical)
      }
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
        new Directory('docs', [
            new File('fileA.md'),
            new File('fileB.md'),
            new File('fileC.md'),
        ])
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new Directory('docs', [
            new File('fileC.md'),
            new File('fileB.md'),
            new File('fileA.md'),
        ])
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should handle mixed explicit and tiebreaker ordering in a path block', () => {
    const orderFileContent = `
      docs/ {
        explicitB.md
        explicitA.md
        *.md @tiebreaker(@alphabetical)
      }
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
        new Directory('docs', [
            new File('fileX.md'),
            new File('explicitA.md'),
            new File('fileY.md'),
            new File('explicitB.md'),
        ])
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new Directory('docs', [
            new File('explicitB.md'),
            new File('explicitA.md'),
            new File('fileX.md'),
            new File('fileY.md'),
        ])
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  it('should not affect files outside the path block pattern', () => {
    const orderFileContent = `
      docs/ {
        *.md @tiebreaker(@alphabetical)
      }
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
        new Directory('docs', [
            new File('fileA.md'),
            new File('image.png'),
            new File('fileB.md'),
        ])
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new Directory('docs', [
            new File('fileA.md'),
            new File('fileB.md'),
            new File('image.png'),
        ])
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  // Test 3: src/** glob pattern
  it('should handle src/** glob pattern in path block', () => {
    const orderFileContent = `
      src/** {
        *.ts
        *.css
      }
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
        new Directory('src', [
            new File('index.ts'),
            new Directory('sub', [
                new File('style.css'),
            ]),
        ]),
        new File('main.js'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new Directory('src', [
            new File('index.ts'),
            new Directory('sub', [
                new File('style.css'),
            ]),
        ]),
        new File('main.js'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });

  // Test 4: @root with multiple directives
  it('should handle @root with multiple tiebreaker directives', () => {
    const orderFileContent = `
      @root {
        @tiebreaker(@extension, @alphabetical)
      }
    `;
    const orderFile = parseOrderFile(orderFileContent);
    const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

    const rootDir = createRoot([
      new File('file.ts'),
      new File('file.js'),
      new File('file.css'),
    ]);

    const sortedDir = processor.orderFiles(rootDir);
    const expectedDir = createRoot([
        new File('file.css'),
        new File('file.js'),
        new File('file.ts'),
    ]);

    assertFileSystem(sortedDir, expectedDir);
  });
});
