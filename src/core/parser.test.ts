import { describe, it, expect } from 'vitest';
import { parseOrderFile, OrderFile } from './parser';

describe('Order Parser', () => {
    it('should parse a simple file pattern', () => {
        const code = 'file.txt';
        const expectedAst: OrderFile = {
            statements: [
                {
                    type: 'filePattern',
                    pattern: 'file.txt',
                    directives: [],
                },
            ],
        };
        const ast = parseOrderFile(code);
        expect(ast).toEqual(expectedAst);
    });
});
