import { expect, it, describe, vi } from "vitest";
import { FileOrderProcessor } from "./fileOrderProcessor";
import { Directory, File, Group, FileState } from "./structure";
import { parseOrderFile } from "./parser";
import {
    createRoot,
    assertFileSystem,
    scrambleExpectedFileSystemIntoATest as scrambleExpectedFileSystemToTest,
} from "./testUtils";

// Mock implementations for Path and Fs interfaces
const mockPath = {
    join: (...paths: string[]) => paths.filter((p) => p).join("/"),
    relative: (from: string, to: string) => to.replace(from, ""),
    extname: (path: string) => {
        const lastDotIndex = path.lastIndexOf(".");
        return lastDotIndex !== -1 ? path.substring(lastDotIndex) : "";
    },
    basename: (path: string, ext?: string) => {
        const lastSlashIndex = path.lastIndexOf("/");
        let basename =
            lastSlashIndex !== -1 ? path.substring(lastSlashIndex + 1) : path;
        if (ext && basename.endsWith(ext)) {
            basename = basename.substring(0, basename.length - ext.length);
        }
        return basename;
    },
};

const mockFs = {
    statSync: vi.fn((path: string) => ({
        isDirectory: () => !path.includes("."),
        size: 0,
        mtimeMs: 0,
        birthtimeMs: 0,
    })),
};

describe("FileOrderProcessor (Unit Tests)", () => {
    it("should sort files alphabetically by default", () => {
        const orderFileContent = ""; // Empty order file for default sorting
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("c.txt"),
            new File("a.txt"),
            new File("b.txt"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);

        const expectedDir = createRoot([
            new File("a.txt"),
            new File("b.txt"),
            new File("c.txt"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should apply explicit order from .order file", () => {
        const orderFileContent = `
      b.txt
      a.txt
    `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("c.txt"),
            new File("a.txt"),
            new File("b.txt"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new File("b.txt"),
            new File("a.txt"),
            new File("c.txt"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should group files by basename", () => {
        const orderFileContent = `
            *.js @group_by(@basename)
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("component.js"),
            new File("component.test.js"),
            new File("another.js"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);

        const expectedDir = createRoot([
            new Group("another", [
                new File("another.js"),
            ]),
            new Group("component", [
                new File("component.js"),
                new File("component.test.js"),
            ]),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should hide files marked with @hidden", () => {
        const orderFileContent = `
            *.log @hidden
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([new File("app.log"), new File("index.js")]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([new File("index.js")]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should mark files as @required", () => {
        const orderFileContent = `
            required.txt @required
            optional.txt
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("required.txt"),
            new File("optional.txt"),
        ]);

        const missingFiles = processor.validateRequiredFiles(rootDir);
        expect(missingFiles).toEqual([]);

        const rootDirMissing = createRoot([new File("optional.txt")]);
        const missingFiles2 = processor.validateRequiredFiles(rootDirMissing);
        expect(missingFiles2).toEqual(["required.txt"]);
    });

    it("should apply tiebreakers: alphabetical", () => {
        const orderFileContent = `
            @tiebreaker(@alphabetical)
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("c.txt"),
            new File("a.txt"),
            new File("b.txt"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new File("a.txt"),
            new File("b.txt"),
            new File("c.txt"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should apply tiebreakers: reverse_alphabetical", () => {
        const orderFileContent = `
            @tiebreaker(@reverse_alphabetical)
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("c.txt"),
            new File("a.txt"),
            new File("b.txt"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new File("c.txt"),
            new File("b.txt"),
            new File("a.txt"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should apply tiebreakers: natural", () => {
        const orderFileContent = `
            @tiebreaker(@natural)
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("file10.txt"),
            new File("file2.txt"),
            new File("file1.txt"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new File("file1.txt"),
            new File("file2.txt"),
            new File("file10.txt"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should apply tiebreakers: extension", () => {
        const orderFileContent = `
            @tiebreaker(@extension)
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("file.ts"),
            new File("file.js"),
            new File("file.css"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new File("file.css"),
            new File("file.js"),
            new File("file.ts"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should apply tiebreakers: size", () => {
        const orderFileContent = `
            @tiebreaker(@size)
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("a.txt"),
            new File("b.txt"),
            new File("c.txt"),
        ]);

        mockFs.statSync.mockImplementation((filePath: string) => {
            if (filePath.endsWith("a.txt"))
                return {
                    isDirectory: () => false,
                    size: 100,
                    mtimeMs: 0,
                    birthtimeMs: 0,
                };
            if (filePath.endsWith("b.txt"))
                return {
                    isDirectory: () => false,
                    size: 50,
                    mtimeMs: 0,
                    birthtimeMs: 0,
                };
            if (filePath.endsWith("c.txt"))
                return {
                    isDirectory: () => false,
                    size: 200,
                    mtimeMs: 0,
                    birthtimeMs: 0,
                };
            return {
                isDirectory: () => false,
                size: 0,
                mtimeMs: 0,
                birthtimeMs: 0,
            };
        });

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new File("c.txt"),
            new File("a.txt"),
            new File("b.txt"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should apply tiebreakers: modified", () => {
        const orderFileContent = `
            @tiebreaker(@modified)
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("a.txt"),
            new File("b.txt"),
            new File("c.txt"),
        ]);

        mockFs.statSync.mockImplementation((filePath: string) => {
            if (filePath.endsWith("a.txt"))
                return {
                    isDirectory: () => false,
                    size: 0,
                    mtimeMs: 100,
                    birthtimeMs: 0,
                };
            if (filePath.endsWith("b.txt"))
                return {
                    isDirectory: () => false,
                    size: 0,
                    mtimeMs: 50,
                    birthtimeMs: 0,
                };
            if (filePath.endsWith("c.txt"))
                return {
                    isDirectory: () => false,
                    size: 0,
                    mtimeMs: 200,
                    birthtimeMs: 0,
                };
            return {
                isDirectory: () => false,
                size: 0,
                mtimeMs: 0,
                birthtimeMs: 0,
            };
        });

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new File("c.txt"),
            new File("a.txt"),
            new File("b.txt"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should apply tiebreakers: created", () => {
        const orderFileContent = `
            @tiebreaker(@created)
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("a.txt"),
            new File("b.txt"),
            new File("c.txt"),
        ]);

        mockFs.statSync.mockImplementation((filePath: string) => {
            if (filePath.endsWith("a.txt"))
                return {
                    isDirectory: () => false,
                    size: 0,
                    mtimeMs: 0,
                    birthtimeMs: 100,
                };
            if (filePath.endsWith("b.txt"))
                return {
                    isDirectory: () => false,
                    size: 0,
                    mtimeMs: 0,
                    birthtimeMs: 50,
                };
            if (filePath.endsWith("c.txt"))
                return {
                    isDirectory: () => false,
                    size: 0,
                    mtimeMs: 0,
                    birthtimeMs: 200,
                };
            return {
                isDirectory: () => false,
                size: 0,
                mtimeMs: 0,
                birthtimeMs: 0,
            };
        });

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new File("c.txt"),
            new File("a.txt"),
            new File("b.txt"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should group files by a named group block", () => {
        const orderFileContent = `
            @type(@groups, @files)
            @group("JS Files") {
                a.js
                b.js
            }
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("a.js"),
            new File("b.js"),
            new File("c.js"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Group("JS Files", [new File("a.js"), new File("b.js")]),
            new File("c.js"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should set FileState for @allow_if with capitalized files", () => {
        const orderFileContent = `
            *.js @allow_if(/^[A-Z]/)
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("Component.js"),
            new File("component.js"),
            new File("another.js"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);

        const capitalizedFile = sortedDir.children.find(
            (f) => f.name === "Component.js"
        ) as File;
        const uncapitalizedFile = sortedDir.children.find(
            (f) => f.name === "component.js"
        ) as File;
        const anotherUncapitalizedFile = sortedDir.children.find(
            (f) => f.name === "another.js"
        ) as File;

        expect(capitalizedFile.state).toBe(FileState.Normal);
        expect(uncapitalizedFile.state).toBe(FileState.Disallowed);
        expect(anotherUncapitalizedFile.state).toBe(FileState.Disallowed);
    });

    it("should group files by regex capture group, and name the group by the captured value", () => {
        const orderFileContent = `
            @type(@groups, @files)
            * @group_by(/^(.*)\.(?:cpp|h)$/)
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("a.cpp"),
            new File("a.h"),
            new File("b.cpp"),
            new File("b.h"),
            new File("c.cpp"),
            new File("c.h"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Group("a", [
                new File("a.cpp"),
                new File("a.h"),
            ]),
            new Group("b", [
                new File("b.cpp"),
                new File("b.h"),
            ]),
            new Group("c", [
                new File("c.cpp"),
                new File("c.h"),
            ]),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should set FileState for @disallow_if", () => {
        const orderFileContent = `
            *.js @disallow_if(/component/)
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("component.js"),
            new File("another.js"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);

        const sortedComponentFile = sortedDir.children.find(f => f.name === "component.js") as File;
        const sortedAnotherFile = sortedDir.children.find(f => f.name === "another.js") as File;

        expect(sortedComponentFile.state).toBe(FileState.Disallowed);
        expect(sortedAnotherFile.state).toBe(FileState.Normal);
    });

    it("should handle explicit ordering and tiebreakers within a glob pattern rule", () => {
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
            new Directory("docs", [
                new File("error_codes.md"),
                new File("faq.md"),
                new File("setup_tutorial.md"),
                new File("b.md"),
                new File("a.md"),
                new File("image.png"),
            ]),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Directory("docs", [
                new File("setup_tutorial.md"),
                new File("faq.md"),
                new File("error_codes.md"),
                new File("a.md"),
                new File("b.md"),
                new File("image.png"),
            ]),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should handle @group block with mixed content", () => {
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
            new File("tsconfig.json"),
            new File("package.json"),
            new File(".gitignore"),
            new File("README.md"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Group("Config", [
                new File("package.json"),
                new File("tsconfig.json"),
                new File(".gitignore"),
            ]),
            new File("README.md"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should sort group names by the explicit ordering", () => {
        const orderFileContent = `
            @root {
                @tiebreaker(@alphabetical)
            }

            @group("Important Files") {
                README.md
                CHANGELOG.md
                CONTRIBUTING.md
                LICENSE
            }
            
            @group("Config") {
                vite.config.ts
                tsconfig.json
                package.json
            }
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("README.md"),
            new File("CHANGELOG.md"),
            new File("CONTRIBUTING.md"),
            new File("LICENSE"),
            new File("vite.config.ts"),
            new File("tsconfig.json"),
            new File("package.json"),
            new File("bait.md"),
            new File("do_not_sort.md"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Group("Important Files", [
                new File("README.md"),
                new File("CHANGELOG.md"),
                new File("CONTRIBUTING.md"),
                new File("LICENSE"),
            ]),
            new Group("Config", [
                new File("vite.config.ts"),
                new File("tsconfig.json"),
                new File("package.json"),
            ]),
            new File("bait.md"),
            new File("do_not_sort.md"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should respect explicit ordering within a path block", () => {
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
            new Directory("docs", [
                new File("fileA.md"),
                new File("fileB.md"),
                new File("fileC.md"),
            ]),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Directory("docs", [
                new File("fileC.md"),
                new File("fileA.md"),
                new File("fileB.md"),
            ]),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should respect explicit ordering then tiebreakers within a path block", () => {
        const orderFileContent = `
            docs/ @tiebreaker(@alphabetical) {
                fileC.md
                fileA.md
                fileB.md 
            }
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new Directory("docs", [
                new File("fileA.md"),
                new File("fileE.md"),
                new File("fileC.md"),
                new File("fileB.md"),
                new File("fileD.md"),
            ]),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Directory("docs", [
                new File("fileC.md"),
                new File("fileA.md"),
                new File("fileB.md"),
                new File("fileD.md"),
                new File("fileE.md"),
            ]),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should let block scoped tiebreakers override global ones", () => {
        const orderFileContent = `
            @tiebreaker(@alphabetical)

            docs/ @tiebreaker(@natural)
        `;

        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new Directory("docs", [
                new File("file2.md"),
                new File("file1.md"),
                new File("file10.md"),
            ]),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Directory("docs", [
                new File("file1.md"),
                new File("file2.md"),
                new File("file10.md"),
            ]),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should let inner block scoped tiebreakers override outer ones", () => {
        const orderFileContent = `
            finances/ @tiebreaker(@alphabetical) {
                *.docs @tiebreaker(@reverse_alphabetical)
            }
        `;

        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new Directory("junk_drawer", [
                new File("2020_finance_report.docs"),
                new File("2021_finance_report.docs"),
                new File("2022_finance_report.docs"),
            ]),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Directory("junk_drawer", [
                new File("2022_finance_report.docs"),
                new File("2021_finance_report.docs"),
                new File("2020_finance_report.docs"),
            ]),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should apply tiebreakers to all files within a path block if no explicit files", () => {
        const orderFileContent = `
            docs/ {
                *.md @tiebreaker(@reverse_alphabetical)
            }
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new Directory("docs", [
                new File("fileA.md"),
                new File("fileB.md"),
                new File("fileC.md"),
            ]),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Directory("docs", [
                new File("fileC.md"),
                new File("fileB.md"),
                new File("fileA.md"),
            ]),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should handle mixed explicit and tiebreaker ordering in a path block", () => {
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
            new Directory("docs", [
                new File("fileX.md"),
                new File("explicitA.md"),
                new File("fileY.md"),
                new File("explicitB.md"),
            ]),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Directory("docs", [
                new File("explicitB.md"),
                new File("explicitA.md"),
                new File("fileX.md"),
                new File("fileY.md"),
            ]),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should not affect files outside the path block pattern", () => {
        const orderFileContent = `
            docs/ {
                *.md @tiebreaker(@alphabetical)
            }
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new Directory("docs", [
                new File("fileA.md"),
                new File("image.png"),
                new File("fileB.md"),
            ]),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Directory("docs", [
                new File("fileA.md"),
                new File("fileB.md"),
                new File("image.png"),
            ]),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should handle src/** glob pattern in path block", () => {
        const orderFileContent = `
            src/** {
              *.ts
              *.css
            }
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new Directory("src", [
                new File("style.css"),
                new File("index.ts"),
                new Directory("sub", [
                    new File("style.css"),
                    new File("index.ts"),
                ]),
            ]),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Directory("src", [
                new File("index.ts"),
                new File("style.css"),
                new Directory("sub", [
                    new File("index.ts"),
                    new File("style.css"),
                ]),
            ]),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should handle @root with multiple tiebreaker directives", () => {
        const orderFileContent = `
            @root {
              @tiebreaker(@extension, @alphabetical)
            }
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);
        const expectedDir = createRoot([
            new File("a.css"),
            new File("b.css"),
            new File("a.js"),
            new File("b.js"),
            new File("a.md"),
            new File("c.md"),
            new File("a.ts"),
            new File("b.ts"),
        ]);

        const rootDir = scrambleExpectedFileSystemToTest(expectedDir);
        const sortedDir = processor.orderFiles(rootDir);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should handle @root with multiple tiebreaker directives, but in reverse", () => {
        const orderFileContent = `
            @root {
                @tiebreaker(@alphabetical, @extension)
            }
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const expectedDir = createRoot([
            new File("a.css"),
            new File("a.js"),
            new File("a.md"),
            new File("a.ts"),
            new File("b.css"),
            new File("b.js"),
            new File("b.ts"),
            new File("c.md"),
        ]);

        const rootDir = scrambleExpectedFileSystemToTest(expectedDir);
        const sortedDir = processor.orderFiles(rootDir);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should handle files with reserved characters correctly if quoted", () => {
        const orderFileContent = `
          "@types/" @tiebreaker(@alphabetical)
        `;

        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new Directory("@types", [
                new File("c.ts"),
                new File("a.ts"),
                new File("b.ts"),
            ]),
        ]);

        const sortedDir = processor.orderFiles(rootDir);
        const expectedDir = createRoot([
            new Directory("@types", [
                new File("a.ts"),
                new File("b.ts"),
                new File("c.ts"),
            ]),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should sort files and folders based on @type directive", () => {
        const orderFileContent = `
            @type(@files, @folders)
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new Directory("folder-a"),
            new File("file-a.txt"),
            new Directory("folder-b"),
            new File("file-b.txt"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);

        const expectedDir = createRoot([
            new File("file-a.txt"),
            new File("file-b.txt"),
            new Directory("folder-a"),
            new Directory("folder-b"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should handle @folders and @files as patterns", () => {
        const orderFileContent = `
            @files
            @folders
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new Directory("folder-a"),
            new File("file-a.txt"),
            new Directory("folder-b"),
            new File("file-b.txt"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);

        const expectedDir = createRoot([
            new File("file-a.txt"),
            new File("file-b.txt"),
            new Directory("folder-a"),
            new Directory("folder-b"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should sort folders alphabetically", () => {
        const orderFileContent = `
            @tiebreaker(@alphabetical)
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new Directory("folder-c"),
            new Directory("folder-a"),
            new Directory("folder-b"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);

        const expectedDir = createRoot([
            new Directory("folder-a"),
            new Directory("folder-b"),
            new Directory("folder-c"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should sort groups, files and folders based on @type directive", () => {
        const orderFileContent = `
            @type(@groups, @files, @folders)
            @group("my-group") {
                file-in-group.txt
            }
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new Directory("folder-a"),
            new File("file-a.txt"),
            new File("file-in-group.txt"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);

        const expectedDir = createRoot([
            new Group("my-group", [new File("file-in-group.txt")]),
            new File("file-a.txt"),
            new Directory("folder-a"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });

    it("should handle path block with glob pattern", () => {
        const orderFileContent = `
            *.md @tiebreaker(@alphabetical) {
                c.md
                a.md
            }
        `;
        const orderFile = parseOrderFile(orderFileContent);
        const processor = new FileOrderProcessor(orderFile!, mockPath, mockFs);

        const rootDir = createRoot([
            new File("b.md"),
            new File("c.md"),
            new File("a.md"),
            new File("d.txt"),
        ]);

        const sortedDir = processor.orderFiles(rootDir);

        const expectedDir = createRoot([
            new File("c.md"),
            new File("a.md"),
            new File("b.md"),
            new File("d.txt"),
        ]);

        assertFileSystem(sortedDir, expectedDir);
    });
});
