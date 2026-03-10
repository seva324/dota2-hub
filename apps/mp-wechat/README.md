# `apps/mp-wechat`

Taro + React WeChat Mini Program frontend for the `dota2-hub` workspace.

## Goals

- Keep the mini program lightweight and page-oriented
- Reuse shared DTOs and the shared API client where practical
- Preserve room for future subpackages as detail pages grow

## Local Development

Install dependencies from the repository root:

```bash
npm install
```

Start WeChat Mini Program development build:

```bash
npm run dev:weapp -w @dota2hub/mp-wechat
```

Create a production build:

```bash
npm run build:weapp -w @dota2hub/mp-wechat
```

Type-check the mini program:

```bash
npm run typecheck -w @dota2hub/mp-wechat
```

## Environment

Set `TARO_APP_API_BASE_URL` if you want to point the mini program at a non-default backend.

Default:

```text
https://dota2-hub.vercel.app
```

After the build finishes, open `apps/mp-wechat/dist` in WeChat DevTools as the mini program project directory.

## Structure

```text
src/
  components/
  pages/
    home/
    upcoming/
    tournaments/
    settings/
  packages/
    tournament/pages/detail/
    team/pages/detail/
    match/pages/detail/
  services/
  styles/
  types/
  utils/
```
