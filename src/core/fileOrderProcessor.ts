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
  typeOrder: string[];
}

export class FileOrderProcessor {
    constructor(private orderFile: OrderFile, private path: Path, private fs: Fs) {} // shorthand for declearing all the fields

    public orderFiles(directory: Directory): Directory {
        return this.processDirectory(directory, this.orderFile.statements);
    }

    private processDirectory(directory: Directory, statements: Statement[], basePath = ""): Directory {
        const result = new Directory(directory.name, []);
        const children = [...directory.children];

        const pathBlocks = statements.filter((s) => s.type === "pathBlock");
        const remainingStatements = statements.filter((s) => s.type !== "pathBlock");

        const processedChildren = new Set<FileSystemItem>();
        const orderedChildren: FileSystemItem[] = [];

        for (const block of pathBlocks) {
            const blockPattern = this.createPattern(block.pattern || "", basePath);
            const matchingChildren = children.filter((c) => {
                if (processedChildren.has(c)) return false;
                const childPath = this.path.join(basePath, c.name);
                if (typeof blockPattern === "string") {
                    let pattern = blockPattern;
                    if (pattern.endsWith('/')) {
                        pattern = pattern.slice(0, -1);
                    }
                    return minimatch(childPath, pattern, { matchBase: true });
                } else {
                    return blockPattern.test(childPath);
                }
            });

            if (matchingChildren.length > 0) {
                const blockStatements = block.block || [];
                const blockDirectives = block.blockDirectives || [];
                let blockTiebreakers: string[] | undefined = undefined;
                for (const directive of blockDirectives) {
                    if (directive.name === "tiebreaker") {
                        blockTiebreakers = this.parseTiebreakers(directive.args || []);
                    }
                }

                const sortedBlockChildren = this.processChildren(
                    matchingChildren,
                    blockStatements,
                    basePath,
                    blockTiebreakers
                );
                orderedChildren.push(...sortedBlockChildren);
                matchingChildren.forEach((c) => processedChildren.add(c));
            }
        }

        const remainingChildren = children.filter((c) => !processedChildren.has(c));
        const sortedRemainingChildren = this.processChildren(remainingChildren, remainingStatements, basePath);
        orderedChildren.push(...sortedRemainingChildren);

        // Process subdirectories recursively
        for (const item of orderedChildren) {
            if (item instanceof Directory) {
                const pathBlock = this.findMatchingPathBlock(this.path.join(basePath, item.name), statements);
                if (pathBlock) {
                    const subDirectoryStatements = pathBlock.block || [];
                    const sortedSubDirectory = this.processDirectory(
                        item,
                        subDirectoryStatements,
                        this.path.join(basePath, item.name)
                    );
                    result.children.push(sortedSubDirectory);
                } else {
                    result.children.push(this.processDirectory(item, [], this.path.join(basePath, item.name)));
                }
            } else {
                result.children.push(item);
            }
        }

        return result;
    }

    private processChildren(
        children: FileSystemItem[],
        statements: Statement[],
        basePath: string,
        incomingTiebreakers?: string[]
    ): FileSystemItem[] {
        const { rules, tiebreakers, explicitOrder, typeOrder } = this.processStatements(statements, basePath);
        const finalTiebreakers = incomingTiebreakers || tiebreakers;

        const groupBlocks = statements.filter((s) => s.type === "groupBlock");
        const groups: Group[] = [];
        for (const block of groupBlocks) {
            const group = new Group(block.groupName || "", []);
            const groupFilePatterns = (block.block || []).map((st) => st.pattern || "");
            for (const pattern of groupFilePatterns) {
                const fileIndex = children.findIndex((f) => f.name === pattern);
                if (fileIndex > -1) {
                    group.children.push(children[fileIndex]);
                    children.splice(fileIndex, 1);
                }
            }
            if (group.children.length > 0) {
                groups.push(group);
            }
        }

        const explicitlyOrderedItems: FileSystemItem[] = [];
        const remainingForRules: FileSystemItem[] = [];
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
                remainingForRules.push(item);
            }
        }

        const { orderedChildren: ruleOrderedItems, remainingChildren: finalRemainingItems } = this.applyRulesToChildren(
            remainingForRules,
            rules,
            finalTiebreakers,
            typeOrder
        );

        const sortedFinalRemainingItems = this.applyTiebreakers(finalRemainingItems, finalTiebreakers, typeOrder);

        return [...groups, ...explicitlyOrderedItems, ...ruleOrderedItems, ...sortedFinalRemainingItems];
    }

    private findMatchingPathBlock(itemName: string, statements: Statement[]): Statement | undefined {
        for (const statement of statements) {
            if (statement.type === "pathBlock") {
                let pattern = statement.pattern || "";
                if (pattern.endsWith("/")) {
                    pattern = pattern.slice(0, -1);
                }
                if (minimatch(itemName, pattern, { matchBase: true })) {
                    return statement;
                }
            }
        }
        return undefined;
    }

    private processStatements(statements: Statement[], basePath: string): ProcessStatementsResult {
        const rules: Rule[] = [];
        let tiebreakers: string[] = [];
        const explicitOrder: string[] = [];
        let typeOrder: string[] = [];

        for (const statement of statements) {
            if (statement.type === "filePattern") {
                const pattern = statement.pattern || "";
                if (pattern === "@folders") {
                    if (typeOrder.indexOf("folders") === -1) typeOrder.push("folders");
                    continue;
                }
                if (pattern === "@groups") {
                    if (typeOrder.indexOf("groups") === -1) typeOrder.push("groups");
                    continue;
                }
                if (!this.isGlobPattern(pattern) && !statement.directives?.length) {
                    explicitOrder.push(pattern);
                }
                const rule: any = {
                    pattern: this.createPattern(pattern, basePath),
                    directives: statement.directives || [],
                };
                for (const directive of statement.directives || []) {
                    switch (directive.name) {
                        case "required":
                            rule.isRequired = true;
                            break;
                        case "tiebreaker":
                            rule.tiebreakers = this.parseTiebreakers(directive.args || []);
                            break;
                        case "group":
                            if (directive.args && directive.args[0]) {
                                rule.groupName = directive.args[0] as string;
                            }
                            break;
                        case "group_by":
                            if (directive.args && directive.args[0]) {
                                const arg = directive.args[0];
                                if (typeof arg === "string") {
                                    if (arg.startsWith("/") && arg.endsWith("/")) {
                                        rule.groupBy = new RegExp(arg.slice(1, -1));
                                    } else {
                                        rule.groupBy = arg.startsWith("@") ? arg.substring(1) : arg;
                                    }
                                } else if (typeof arg === "object" && "name" in arg) {
                                    rule.groupBy = (arg as Directive).name;
                                }
                            }
                            break;
                        case "hidden":
                            rule.isHidden = true;
                            break;
                        case "allow_if":
                            if (directive.args && directive.args[0]) {
                                const arg = directive.args[0] as string;
                                if (arg.startsWith("/") && arg.endsWith("/")) {
                                    rule.allowIf = new RegExp(arg.slice(1, -1));
                                }
                            }
                            break;
                        case "disallow_if":
                            if (directive.args && directive.args[0]) {
                                const arg = directive.args[0] as string;
                                if (arg.startsWith("/") && arg.endsWith("/")) {
                                    rule.disallowIf = new RegExp(arg.slice(1, -1));
                                }
                            }
                            break;
                    }
                }
                rules.push(rule);
            } else if (statement.type === "directive") {
                if (statement.directive?.name === "tiebreaker") {
                    tiebreakers = this.parseTiebreakers(statement.directive.args || []);
                }
                if (statement.directive?.name === "type") {
                    typeOrder = this.parseTiebreakers(statement.directive.args || []);
                }
            } else if (statement.type === "pathBlock") {
                if (statement.pattern === "") {
                    // @root block
                    const rootBlockScope = this.processStatements(statement.block || [], basePath);
                    tiebreakers.push(...rootBlockScope.tiebreakers);
                    rules.push(...rootBlockScope.rules);
                    explicitOrder.push(...rootBlockScope.explicitOrder);
                    if (rootBlockScope.typeOrder.length > 0) {
                        typeOrder = rootBlockScope.typeOrder;
                    }
                } else {
                    // For path blocks, rules are handled when processing the directory
                }
            } else if (statement.type === "groupBlock") {
                const group = new Group(statement.groupName || "");
                const groupScope = this.processStatements(statement.block || [], "");
                const rule: Rule = {
                    pattern: "",
                    directives: [],
                    groupName: statement.groupName,
                    tiebreakers: groupScope.tiebreakers,
                };
                rules.push(rule);
            }
        }

        // FIXME: this behavior is not correct, it should instead follow the default as state in @root
        if (tiebreakers.length === 0) {
            tiebreakers.push("alphabetical");
        }

        return { rules, tiebreakers, explicitOrder, typeOrder };
    }

    private applyRulesToChildren(
        children: FileSystemItem[],
        rules: Rule[],
        incomingTiebreakers: string[],
        typeOrder: string[]
    ): { orderedChildren: FileSystemItem[]; remainingChildren: FileSystemItem[] } {
        let orderedChildren: FileSystemItem[] = [];
        let remainingChildren: FileSystemItem[] = [...children];
        const groups: Map<string, Group> = new Map();
        const processedItems = new Set<FileSystemItem>();

        for (const rule of rules) {
            const matchedFiles = remainingChildren.filter((item) => {
                if (processedItems.has(item)) return false;
                const filePath = item instanceof File ? this.path.relative("/", item.path) : item.name;
                if (typeof rule.pattern === "string") {
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

        remainingChildren = remainingChildren.filter((item) => !processedItems.has(item));

        const groupItems: FileSystemItem[] = [];
        const sortedGroupKeys = Array.from(groups.keys()).sort();
        for (const key of sortedGroupKeys) {
            const group = groups.get(key)!;
            group.children = this.applyTiebreakers(group.children, incomingTiebreakers, typeOrder);
            groupItems.push(group);
        }

        orderedChildren.push(...groupItems);
        orderedChildren = this.applyTiebreakers(orderedChildren, incomingTiebreakers, typeOrder);

        return { orderedChildren, remainingChildren };
    }

    private createPattern(pattern: string, basePath: string): string | RegExp {
        if (pattern.startsWith("/") && pattern.endsWith("/")) {
            return new RegExp(pattern.slice(1, -1));
        }
        return this.path.join(basePath, pattern);
    }

    private parseTiebreakers(args: (string | Directive | CaptureGroupRef)[]): string[] {
        return args.map((arg) => {
            let value: string;
            if (typeof arg === "object" && arg !== null && "name" in arg) {
                value = (arg as Directive).name;
            } else {
                value = arg as string;
            }
            return value.startsWith("@") ? value.substring(1) : value;
        });
    }

    private isGlobPattern(pattern: string): boolean {
        return pattern.includes("*") || pattern.includes("?") || pattern.includes("[");
    }

    private getGroupKey(file: File, groupBy: string | RegExp): string {
        if (typeof groupBy === "string") {
            if (groupBy === "basename") {
                let basename = file.name;
                let ext = this.path.extname(basename);
                while (ext) {
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
            return "";
        }
        return "";
    }

    private applyTiebreakers(files: FileSystemItem[], tiebreakers: string[], typeOrder: string[]): FileSystemItem[] {
        return files.sort((a, b) => {
            if (typeOrder && typeOrder.length > 0) {
                const aType = a instanceof Group ? "groups" : a instanceof Directory ? "folders" : "files";
                const bType = b instanceof Group ? "groups" : b instanceof Directory ? "folders" : "files";
                const aIndex = typeOrder.indexOf(aType);
                const bIndex = typeOrder.indexOf(bType);

                if (aIndex !== -1 && bIndex !== -1) {
                    if (aIndex !== bIndex) {
                        return aIndex - bIndex;
                    }
                }
            }

            // Apply tiebreakers for items of the same type or files
            for (const tiebreaker of tiebreakers) {
                let result = 0;
                switch (tiebreaker) {
                    case "alphabetical":
                        result = a.name.localeCompare(b.name);
                        break;
                    case "reverse_alphabetical":
                        result = b.name.localeCompare(a.name);
                        break;
                    case "natural":
                        result = this.naturalCompare(a.name, b.name);
                        break;
                    case "extension":
                        result = this.path.extname(a.name).localeCompare(this.path.extname(b.name));
                        break;
                    case "size":
                        try {
                            const aSize = this.fs.statSync((a as File).path).size;
                            const bSize = this.fs.statSync((b as File).path).size;
                            result = bSize - aSize;
                        } catch {
                            result = 0;
                        }
                        break;
                    case "modified":
                        try {
                            const aTime = this.fs.statSync((a as File).path).mtimeMs;
                            const bTime = this.fs.statSync((b as File).path).mtimeMs;
                            result = bTime - aTime;
                        } catch {
                            result = 0;
                        }
                        break;
                    case "created":
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
                        const filePath = this.path.relative("/", item.path);
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
            if (statement.type === "filePattern") {
                for (const directive of statement.directives || []) {
                    if (directive.name === "required") {
                        if (statement.pattern) {
                            requiredPatterns.push(statement.pattern);
                        }
                    }
                }
            } else if (statement.type === "pathBlock" && statement.block) {
                requiredPatterns.push(...this.getRequiredFilesFromStatements(statement.block));
            } else if (statement.type === "groupBlock" && statement.block) {
                requiredPatterns.push(...this.getRequiredFilesFromStatements(statement.block));
            }
        }
        return requiredPatterns;
    }
}
