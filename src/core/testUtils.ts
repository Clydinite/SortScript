import { Directory, FileSystemItem, Group, File, FileState } from "./structure";
import { expect } from "vitest";

export function createRoot(children: FileSystemItem[]): Directory {
    const root = new Directory("root", children);
    root.path = "/test";

    function buildPaths(items: FileSystemItem[], basePath: string) {
        for (const item of items) {
            item.path = `${basePath}/${item.name}`;
            if (item instanceof Directory) {
                buildPaths(item.children, item.path);
            }
        }
    }

    buildPaths(root.children, root.path);
    return root;
}

/**
 * @param expected root of the expected file system
 */
export function scrambleExpectedFileSystemIntoATest(expected: Directory) {
    // groups are not real in a normal file system, so the test input won't contain them
    const noGroups = expected.children.filter((f) => !(f instanceof Group));

    function scrambleChildrenOrder(children: FileSystemItem[]) {
        const scrambled = children.sort(() => Math.random() - 0.5);
        for (const child of scrambled) {
            if (child instanceof Directory) {
                scrambleChildrenOrder(child.children);
            } else if (child instanceof Group) {
                throw new Error("Groups are not real in a normal file system");
            }
        }
        return scrambled;
    }

    return new Directory(expected.name, scrambleChildrenOrder(noGroups));
}

export function assertFileSystem(
    actual: FileSystemItem,
    expected: FileSystemItem
) {
    expect(serializeFileSystem(actual)).toBe(serializeFileSystem(expected));
}

export function serializeFileSystem(item: FileSystemItem, indent = 0): string {
    const indentation = "  ".repeat(indent);
    let result = `${indentation}${item.constructor.name}: ${item.name}`;

    if (item instanceof File) {
        result += ` (state: ${FileState[item.state]})`;
    }

    result += "\n";

    if (item instanceof Directory || item instanceof Group) {
        for (const child of item.children) {
            result += serializeFileSystem(child, indent + 1);
        }
    }

    return result;
}
