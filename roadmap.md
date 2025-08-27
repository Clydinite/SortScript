## Roadmap

**Phase 1: Revert to a Stable State**
1.  **Revert `src/core/fileOrderProcessor.ts`:** Restore the file to its state from the last successful test run (before the major refactoring attempts). This will ensure all existing tests pass.
2.  **Verify Tests:** Run `npm test --ignore-scripts` to confirm that all tests pass after the revert.

**Phase 2: Implement DSL Change (Directives on Block Patterns) - Incremental**
1.  **Parser Changes (`src/core/parser.ts`):**
    *   Modify `pathBlock` rule to allow directives between the pattern and the opening curly brace.
    *   Modify `Statement` interface to add `blockDirectives?: Directive[]` to `pathBlock` type.
    *   Modify `visitPathBlock` in `OrderFileInterpreter` to extract and store these directives.
    *   **Verify:** Run `npm run compile` to ensure no compilation errors.
2.  **FileOrderProcessor - Initial Adaptation (`src/core/fileOrderProcessor.ts`):**
    *   Introduce a mechanism to pass down "effective directives" (including tiebreakers) during processing. This will likely involve modifying the `orderFiles` function signature and its recursive calls.
    *   Modify `processStatements` to interpret `blockDirectives` and update the `tiebreakers` for the current scope.
    *   **Verify:** Run `npm test --ignore-scripts` to ensure existing tests still pass. (This might require temporary workarounds if the new structure breaks existing assumptions).
3.  **FileOrderProcessor - Directive Precedence Logic:**
    *   Implement the logic to apply directives based on precedence (file pattern > block scope > global > default). This will involve modifying `applyRulesToChildren` and potentially `orderFileGroup`.
    *   **Verify:** Add new unit tests specifically for the DSL change (directives on block patterns) and their precedence. Run `npm test --ignore-scripts`.

**Phase 3: Address Regex Coverage**
1.  **Review Existing Regex Usage:** Identify all places where regex is used in directives (`@allow_if`, `@group_by`).
2.  **Add Comprehensive Unit Tests:** Create new unit tests to cover various regex scenarios for these directives, including edge cases.
3.  **Verify:** Run `npm test --ignore-scripts`.
