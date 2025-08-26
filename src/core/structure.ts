export abstract class FileSystemItem {
  constructor(public name: string) {}
}

export class File extends FileSystemItem {
  constructor(name: string, public path: string) {
    super(name);
  }
}

export class Directory extends FileSystemItem {
  public children: FileSystemItem[] = [];

  constructor(name: string, public path: string) {
    super(name);
  }
}

export class Group extends FileSystemItem {
  public children: FileSystemItem[] = [];

  constructor(name: string, children: FileSystemItem[] = []) {
    super(name);
    this.children = children;
  }
}
