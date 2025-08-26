import {
  createToken,
  Lexer,
  CstParser,
  ParserMethod,
  CstNode,
  IToken,
} from 'chevrotain';

// Token definitions
const Identifier = createToken({
  name: 'Identifier',
  pattern: /[a-zA-Z0-9_\+\*\.\-\/]+/,
});

const RegexLiteral = createToken({
  name: 'RegexLiteral',
  pattern: /\/(?:[^\/\\\r\n]|\\.)+\/[gimuy]*/,
});

const StringLiteral = createToken({
  name: 'StringLiteral',
  pattern: /"(?:[^"\\]|\\.)*"/,
});

const CaptureGroupRef = createToken({
  name: 'CaptureGroupRef',
  pattern: /\$[0-9]+|\$[a-zA-Z_][a-zA-Z0-9_]*/,
});

const LCurly = createToken({ name: 'LCurly', pattern: /{/ });
const RCurly = createToken({ name: 'RCurly', pattern: /}/ });
const LBracket = createToken({ name: 'LBracket', pattern: /\[/ });
const RBracket = createToken({ name: 'RBracket', pattern: /\]/ });
const LParen = createToken({ name: 'LParen', pattern: /\(/ });
const RParen = createToken({ name: 'RParen', pattern: /\)/ });
const At = createToken({ name: 'At', pattern: /@/ });
const Comma = createToken({ name: 'Comma', pattern: /,/ });

const Comment = createToken({
  name: 'Comment',
  pattern: /#.*/,
  group: Lexer.SKIPPED,
});

const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

// All tokens in order of precedence
const allTokens = [
  WhiteSpace,
  Comment,
  RegexLiteral,
  StringLiteral,
  CaptureGroupRef,
  LCurly,
  RCurly,
  LBracket,
  RBracket,
  LParen,
  RParen,
  At,
  Comma,
  Identifier,
];

export const OrderLexer = new Lexer(allTokens);

// AST Node types
export interface OrderFile {
  statements: Statement[];
}

export interface Statement {
  type: 'pathBlock' | 'filePattern' | 'directive';
  pattern?: string;
  directives?: Directive[];
  block?: Statement[];
  directive?: Directive;
}

export interface Directive {
  name: string;
  args?: (string | CaptureGroupRef | Directive)[];
}

export interface CaptureGroupRef {
  type: 'captureGroup';
  ref: string;
}

// Parser class
class OrderParser extends CstParser {
  orderFile: ParserMethod<[], CstNode>;
  statement: ParserMethod<[], CstNode>;
  pathBlock: ParserMethod<[], CstNode>;
  filePattern: ParserMethod<[], CstNode>;
  directive: ParserMethod<[], CstNode>;
  directiveArg: ParserMethod<[], CstNode>;
  pattern: ParserMethod<[], CstNode>;

  constructor() {
    super(allTokens);

    this.orderFile = this.RULE('orderFile', () => {
      this.MANY(() => this.SUBRULE(this.statement));
    });

    this.statement = this.RULE('statement', () => {
      this.OR([
        {
          GATE: this.BACKTRACK(this.pathBlock),
          ALT: () => this.SUBRULE(this.pathBlock),
        },
        {
          GATE: this.BACKTRACK(this.filePattern),
          ALT: () => this.SUBRULE(this.filePattern),
        },
        {
          ALT: () => this.SUBRULE(this.directive),
        },
      ]);
    });

    this.pathBlock = this.RULE('pathBlock', () => {
      this.SUBRULE(this.pattern);
      this.CONSUME(LCurly);
      this.MANY(() => this.SUBRULE(this.statement));
      this.CONSUME(RCurly);
    });

    this.filePattern = this.RULE('filePattern', () => {
      this.SUBRULE(this.pattern);
      this.MANY(() => this.SUBRULE(this.directive));
      this.OPTION(() => {
        this.CONSUME(LCurly);
        this.MANY2(() => this.SUBRULE2(this.directive));
        this.CONSUME(RCurly);
      });
    });

    this.directive = this.RULE('directive', () => {
      this.CONSUME(At);
      this.CONSUME(Identifier);
      this.OPTION(() => {
        this.CONSUME(LParen);
        this.OPTION2(() => {
          this.SUBRULE(this.directiveArg);
          this.MANY(() => {
            this.CONSUME(Comma);
            this.SUBRULE2(this.directiveArg);
          });
        });
        this.CONSUME(RParen);
      });
    });

    this.directiveArg = this.RULE('directiveArg', () => {
      this.OR([
        { ALT: () => this.CONSUME(StringLiteral) },
        { ALT: () => this.CONSUME(RegexLiteral) },
        { ALT: () => this.CONSUME(CaptureGroupRef) },
        { ALT: () => this.CONSUME(Identifier) },
        { ALT: () => this.SUBRULE(this.directive) },
      ]);
    });

    this.pattern = this.RULE('pattern', () => {
      this.OR([
        { ALT: () => this.CONSUME(RegexLiteral) },
        { ALT: () => this.CONSUME(Identifier) },
      ]);
    });

    this.performSelfAnalysis();
  }
}

export const orderParser = new OrderParser();

// CST to AST converter
export class OrderFileInterpreter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(cstNode: CstNode): any {
    switch (cstNode.name) {
      case 'orderFile':
        return this.visitOrderFile(cstNode);
      case 'statement':
        return this.visitStatement(cstNode);
      case 'pathBlock':
        return this.visitPathBlock(cstNode);
      case 'filePattern':
        return this.visitFilePattern(cstNode);
      case 'directive':
        return this.visitDirective(cstNode);
      case 'directiveArg':
        return this.visitDirectiveArg(cstNode);
      case 'pattern':
        return this.visitPattern(cstNode);
      default:
        throw new Error(`Unknown CST node: ${cstNode.name}`);
    }
  }

  visitOrderFile(cstNode: CstNode): OrderFile {
    const statements =
      cstNode.children.statement?.map((stmt) => this.visit(stmt as CstNode)) ||
      [];
    return { statements };
  }

  visitStatement(cstNode: CstNode): Statement {
    if (cstNode.children.pathBlock) {
      return this.visit(cstNode.children.pathBlock[0] as CstNode);
    } else if (cstNode.children.filePattern) {
      return this.visit(cstNode.children.filePattern[0] as CstNode);
    } else if (cstNode.children.directive) {
      return {
        type: 'directive',
        directive: this.visit(cstNode.children.directive[0] as CstNode),
      };
    }
    throw new Error('Invalid statement');
  }

  visitPathBlock(cstNode: CstNode): Statement {
    const pattern = this.visit(cstNode.children.pattern[0] as CstNode);
    const statements =
      cstNode.children.statement?.map((stmt) => this.visit(stmt as CstNode)) ||
      [];
    return {
      type: 'pathBlock',
      pattern,
      block: statements,
    };
  }

  visitFilePattern(cstNode: CstNode): Statement {
    const pattern = this.visit(cstNode.children.pattern[0] as CstNode);
    const directives =
      cstNode.children.directive?.map((dir) => this.visit(dir as CstNode)) ||
      [];
    return {
      type: 'filePattern',
      pattern,
      directives,
    };
  }

  visitDirective(cstNode: CstNode): Directive {
    const nameToken = cstNode.children.Identifier[0] as IToken;
    const name = nameToken.image;
    const args =
      cstNode.children.directiveArg?.map((arg) => this.visit(arg as CstNode)) ||
      [];
    return { name, args };
  }

  visitDirectiveArg(cstNode: CstNode): string | CaptureGroupRef | Directive {
    if (cstNode.children.StringLiteral) {
      const token = cstNode.children.StringLiteral[0] as IToken;
      return token.image.slice(1, -1); // Remove quotes
    } else if (cstNode.children.RegexLiteral) {
      const token = cstNode.children.RegexLiteral[0] as IToken;
      return token.image;
    } else if (cstNode.children.CaptureGroupRef) {
      const token = cstNode.children.CaptureGroupRef[0] as IToken;
      return { type: 'captureGroup', ref: token.image };
    } else if (cstNode.children.Identifier) {
      const token = cstNode.children.Identifier[0] as IToken;
      return token.image;
    } else if (cstNode.children.directive) {
      return this.visit(cstNode.children.directive[0] as CstNode);
    }
    throw new Error('Invalid directive argument');
  }

  visitPattern(cstNode: CstNode): string {
    if (cstNode.children.RegexLiteral) {
      const token = cstNode.children.RegexLiteral[0] as IToken;
      return token.image;
    } else if (cstNode.children.Identifier) {
      const token = cstNode.children.Identifier[0] as IToken;
      return token.image;
    }
    throw new Error('Invalid pattern');
  }
}

export const interpreter = new OrderFileInterpreter();

// Parse function
export function parseOrderFile(text: string): OrderFile | null {
  const lexResult = OrderLexer.tokenize(text);

  if (lexResult.errors.length > 0) {
    console.error('Lexing errors:', lexResult.errors);
    return null;
  }

  orderParser.input = lexResult.tokens;
  const cst = orderParser.orderFile();

  if (orderParser.errors.length > 0) {
    console.error('Parsing errors:', orderParser.errors);
    return null;
  }

  try {
    return interpreter.visit(cst);
  } catch (error) {
    console.error('AST conversion error:', error);
    return null;
  }
}
