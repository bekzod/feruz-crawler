# React + Vite

## API host

The frontend uses `VITE_API_BASE_URL` as the API base URL and falls back to `/api`.

For local development, leaving it unset uses the Vite proxy in `vite.config.js`, which forwards `/api/*` to `http://localhost:3000`.

For Vercel, set this environment variable on the web project before building:

```bash
VITE_API_BASE_URL=https://your-api-host.example.com
```

Then requests like `/makers` will go to `https://your-api-host.example.com/makers` instead of the web app's own `/api/makers`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
