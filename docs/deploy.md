# Website Deployment

The website is the Vite app in `packages/docs-site`.

## Vercel

Create a Vercel project with these settings:

```text
Framework Preset: Vite
Root Directory: packages/docs-site
Build Command: npm run build
Output Directory: dist
Install Command: npm ci
```

Recommended Git behavior:

```text
Production Branch: main
Preview Deployments: pull requests
```

Let Vercel deploy directly from GitHub instead of adding another GitHub Actions token. This keeps the release workflow focused on npm and MCP Registry publishing.

Expected behavior:

```text
Push or merge to main -> Vercel production deploys automatically
Open or update pull request -> Vercel preview deploys automatically
Manual GitHub Actions release -> npm + MCP Registry publish only, no website deploy
```

## Cloudflare DNS

Add the custom domain in Vercel first. Then create the DNS record in Cloudflare using the exact value Vercel shows.

For a subdomain such as `skill.counterxing.top`, the common setup is:

```text
Type: CNAME
Name: skill
Target: cname.vercel-dns.com
Proxy status: DNS only during verification
```

After Vercel verifies the domain and issues TLS, Cloudflare can usually stay `DNS only` for the least surprising behavior. If proxying through Cloudflare, use SSL/TLS mode `Full` or `Full (strict)`, not `Flexible`.

## Verification checklist

1. Vercel shows the domain as valid.
2. Vercel shows an active TLS certificate.
3. `https://skill.counterxing.top` opens the docs site.
4. README links point to the same production domain.
5. Cloudflare DNS no longer shows pending validation errors.
