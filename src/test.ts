import { parseOrderFile } from './parser';

// Test the parser with a simple .order file
const testOrderFile = `
# Test .order file
README.md @required
package.json @required

src/ {
  index.ts @required
  *.ts {
    @allowif(/^[a-z]/)
    @tiebreaker(@alphabetical)
  }
  
  /^([A-Z][a-z]+)\.(ts|tsx|test\.ts)$/ {
    @groupby($1)
    @tiebreaker(@enum($2, ["ts", "tsx", "test.ts"]))
  }
}

@tiebreaker(@alphabetical)
`;

console.log('Testing .order file parser...');
const result = parseOrderFile(testOrderFile);

if (result) {
  console.log('✅ Parser test successful!');
  console.log('Parsed AST:', JSON.stringify(result, null, 2));
} else {
  console.log('❌ Parser test failed!');
}

