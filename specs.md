### Core Syntax

```order
<path_glob> @directive1 @directive2(arg1, arg2)
<path_glob> {
  <path_glob>
  <path_glob>
  @directive3
  @directive4(arg)
}
<path_glob> {
  <path_glob> @directive5
}
```

### React Project Example

```order
# Global configuration
@root {
  @tiebreaker(@extension, @alphabetical)
}

# Core important files
README.md @required
CHANGELOG.md
CONTRIBUTING.md
LICENSE

# Config files (not a real directory)
@group("Config") {
  package.json
  tsconfig.json
  vite.config.ts
  .eslintrc.js
  .prettierrc
  .gitignore
}

# Documentation
docs/ 
*.md {
  setup_tutorial.md
  faq.md
  error_codes.md
  @tiebreaker(@alphabetical)
}

# Source code
public/
src/ {
  index.tsx @required
  App.tsx   @required
  main.tsx
  globals.css
  reset.css

  # Components
  *.tsx @group_by(@basename) # groups stuff like Button.tsx, Button.test.tsx, Button.stories.tsx
  *.ts
  *.css
}
src/** {
  *.tsx @group_by(@basename)
  *.ts
  *.css
}

# Tests
__tests__/

# Static assets
assets/ {
  images/
  icons/
  fonts/
}

# Build artifacts
dist/** @hidden
build/** @hidden
```
