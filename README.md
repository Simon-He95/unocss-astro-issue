# uno-astro reproduction

this might be generally a vite issue with uno, but found in the context with astro and might possibly be something with how astro processes things.

for context, the error in question

```
[ERROR] [vite] x Build failed in 525ms
[unocss:global:build:bundle] [plugin unocss:global:build:bundle] [unocss] does not found CSS placeholder in the generated chunks
This is likely an internal bug of unocss vite plugin
```

this is emitted from `@unocss/vite`. the `index.mjs` for that should be open in this Stackblitz.

a quick overview of the workspace:

this is a minimal astro project with a single layout at [src/layouts/main.astro](./src/layouts/main.astro) which imports a css file.

a markdown page uses this layout, and the index page does not, but does import the css the layout uses.

this workspace is in a state where there are multiple atomic changes that make the error go away, i.e. any one of the following changes on their own makes the error go away:

- in [astro.config.ts](./astro.config.ts), change `injectReset` to `true`
- exclude [src/pages/markdown-page.md](./src/pages/markdown-page.md) from the build, e.g. by prefixing the filename with `_` or giving it an invalid astro pages file extension (e.g. give it a `.bak` suffix)
- use the `<Layout>` component, which imports the css, in [src/pages/index.astro](./src/pages/index.astro). this is in spite of `index.astro` already importing the css
- remove a single character from [src/layouts/styles.css](./src/layouts/styles.css), whose minified css totals to 4096 bytes

## personal explorations

at `unocss:global:build:generate :: renderChunk()`, we have

```js
// console.log(fakeCssId)
"~/chunks/index.aa1e1d2b_!~{003}~.mjs-unocss-hash.css"

// console.log(css)
`
#--unocss-layer-start--__ALL__--{start:__ALL__}

...

#--unocss-layer-end--__ALL__--{end:__ALL__}
`
```

at `unocss:global:build:bundle :: generateBundle()`, we have

```js
// console.log(replaced, Object.keys(bundle))
false [
  '_noop-middleware.mjs',
  'pages/markdown-page.astro.mjs',
  'pages/index.astro.mjs',
  'renderers.mjs',
  '_astro/markdown-page.Dx1_b9jR.css',
  'chunks/astro/server_B8o6paE-.mjs',
  'chunks/markdown-page_9jAen53V.mjs',
  'chunks/index_DwcWHv-2.mjs'
]
```

so `renderChunk` does get hit and produce the unocss base styles, but they aren't included in the chunks passed into `generateBundle()` for whatever reason.

### fix: inject reset

when `injectReset` is true, we get another chunk for the reset,
```diff
false [
  '_noop-middleware.mjs',
  'pages/markdown-page.astro.mjs',
  'pages/index.astro.mjs',
  'renderers.mjs',
  '_astro/markdown-page.Dx1_b9jR.css',
+ '_astro/index.Cq_Iye27.css',
  'chunks/astro/server_B8o6paE-.mjs',
  'chunks/markdown-page_CpF_AzXG.mjs',
  'chunks/index_CBtUNDkz.mjs'
]
```

both css chunks are of type `"asset"` with a string `source`, and `replaceAsync` succeeds on the reset css, setting `replaced` to true (so the error doesn't show up).
note that `replaceAsync` succeeds because the unocss base styles (i.e. defining all the variables and whatnot) is injected somewhere along the way of the vite pipeline to the reset css, which doesn't seem to happen for the other styles.

### fix: omit markdown page from build

with the markdown page removed from the build, the chunks become simplified to
```diff
false [
  '_noop-middleware.mjs',
- 'pages/markdown-page.astro.mjs',
  'pages/index.astro.mjs',
  'renderers.mjs',
- '_astro/markdown-page.Dx1_b9jR.css',
+ '_astro/index.7okYXY0X.css',
  'chunks/astro/server_BgB_1vLl.mjs',
- 'chunks/markdown-page_CpF_AzXG.mjs',
  'chunks/index_B-B9cs2x.mjs'
]
```

(the `chunks/whatever` hashes are different, but that's not too relevant here)

the more interesting difference is that in this case, the generated `_astro/index.hash.css` _does_ have the unocss base styles properly injected.

### fix: use `<Layout>` in index page

here we get

```diff
false [
  '_noop-middleware.mjs',
  'pages/markdown-page.astro.mjs',
  'pages/index.astro.mjs',
  'renderers.mjs',
- '_astro/markdown-page.Dx1_b9jR.css',
+ '_astro/index.BZ3fFgBA.css',
  'chunks/astro/server_BQhmjwHP.mjs',
  'chunks/markdown-page_ByVqCnuj.mjs',
  'chunks/index_CSetcPTB.mjs',
+ 'chunks/main_BvBivXBN.mjs'
]
```

and the `_astro/index.hash.css` has the unocss base styles properly injected.

### fix: remove character from `styles.css`

when `styles.css` is brought below the 4096 byte limit, we no longer have a css chunk since it's inlined (?).
this means `files` is empty and `generateBundle()` doesn't do anything since the css gets inlined.

however, it does also mean the uno placeholders are left in the generated css, i.e.

```css
#--unocss--{
  layer:__ALL__;
  escape-view:\"\'\`\\;
}
#--unocss-layer-start--__ALL__--{
  start:__ALL__;
}

/* ... */

#--unocss-layer-end--__ALL__-- {
  end: __ALL__;
}
```