# Project Context

Framework: React 18
Language: TypeScript
Bundler: Vite
Testing: Jest + React Testing Library
Lint: ESLint
Formatter: Prettier

## Commands

Install: npm install
Dev: npm run dev
Build: npm run build
Test: npm run test
Lint: npm run lint

## Architecture Rules

- Functional components only
- Hooks over classes
- No inline large logic in JSX
- Services in /services
- Reusable components in /components
- Feature-based folder structure

## Code Standards

- Strict TypeScript
- No any
- No console.log in production
- Prefer composition over inheritance
- Avoid prop drilling
