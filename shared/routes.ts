/**
 * Page URLs of the app. Anything not listed here is a 404, in development and in production.
 * - `/` is the galaxy (galaxy/index.html, a plain page)
 * - `/learn` is the lecture list view (learn.html → web-interface/src)
 * - `/arena…` and `/room/:id` are Versus (index.html → src/)
 * `/translation/index.html` is not a page of its own: it is the document viewer the galaxy and
 * the list view embed in an iframe.
 */
export const isGalaxyPath = (path: string) => path === '/';
export const isLearnPath = (path: string) => /^\/learn\/?$/.test(path);
export const isVersusPath = (path: string) => /^\/(arena(\/(history|leaderboard|profile|java))?|room\/[A-Za-z0-9]+)\/?$/.test(path);
export const isDocumentViewerPath = (path: string) => path === '/translation/index.html';
