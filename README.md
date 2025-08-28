# `.order` Plugin

⚠️ **Danger — Work in Progress** ⚠️
This project is not even remotely finished. Expect breaking changes, incomplete features, and rough edges. Use it at your own risk — **do not rely on it in production yet**. I uploaded this chaotic codebase to GitHub as a proof of concept and for learning purposes.

⚠️ **Danger — AI Generated** ⚠️
Substantial parts of the program (like the parser or the processor) are written by AI, specifically Gemini 2.5 Pro through the CLI and have **not yet been fully reviewed** by a human. It might not always work as expected, and spaghetti code is definitely present.

⚠️ **Danger — Tests Not Passing** ⚠️
The current test suite is **broken and incomplete**, so functionality is not guaranteed. Do not assume anything is stable.

Tired of your project files looking like a chaotic mess, sorted in a blend of alphabetical soup that hides the actual structure of your project? Or having to write `01-`, `02-`, `03-` in front of every file to make sure it's in the right order?
The **VSCode `.order` plugin** gives you the power to define a consistent, project-specific ordering system for files and directories — one that makes sense to you and your team.

Since VSCode doesn't support manual sorting, simply drop a `.order` file at the root of your project and everyone using the plugin will see the same clean, organized layout of your files in a **separate tab**.

## ✨ Features (in progress)

* Define **custom sorting rules** for files and directories explicitly, exactly how you want it to be.
* Support for **required files** (`@required`) that must always appear, or else you'll get a warning.
* Regex-based `@allow_if` and `@disallow_if` directives to control the **naming convention** of files or directories.
* **Group files** together logically (`@group`) regardless of their path for easier navigation.
* Ability to define `@group_by` rules for **grouping related files** (e.g., `Button.tsx`, `Button.test.tsx`, `Button.stories.tsx`).
* Apply **tiebreakers** (`@tiebreaker`) like `@alphabetical` or `@extension`, even `@natural`, and the ability to combine them (`@tiebreaker(@alphabetical, @extension)`)
* Hide build artifacts or anything you don't want to see (e.g., `*.meta` in Unity) with `@hidden`.
* Works recursively across directories with wildcard rules.
* Autocomplete for paths and directives in the `.order` DSL.
* Syntax highlighting for `.order` files.
