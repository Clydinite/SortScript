export enum FileState {
  Normal,
  Disallowed,
}

export abstract class FileSystemItem {
  public path: string = '';
  constructor(public name: string) {}
}

export class File extends FileSystemItem {
  public state: FileState = FileState.Normal;

  constructor(name: string) {
    super(name);
  }
}

export class Directory extends FileSystemItem {
  public children: FileSystemItem[] = [];

  constructor(name: string, children: FileSystemItem[] = []) {
    super(name);
    this.children = children;
  }
}

export class Group extends FileSystemItem {
  public children: FileSystemItem[] = [];

  constructor(name: string, children: FileSystemItem[] = []) {
    super(name);
    this.children = children;
  }
}
