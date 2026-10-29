/**
 * Host half of the Background Map bundle.
 *
 * v2 ships no bundled picture: the client paints a dark blank background until
 * the user uploads their own. This Host keeps the authenticated `/api` channel
 * route alive as the plugin's presence marker (a small JSON status document),
 * so the bundle keeps the same shape as before and future asset routes have a
 * place to land. Nothing is served from disk.
 *
 * @module @local/dsh-background
 */

/** Absolute registration path of the plugin status document. */
const ROUTE_PATH = '/api/background'

export const name = 'background'

/** The authenticated Fetch channel this route belongs to. */
export const inject = ['connection']

/**
 * Register the status route and answer every GET with the static status.
 * @param ctx - composed Host context.
 */
export function apply(ctx) {
	ctx.connection.fetch.register({
		path: ROUTE_PATH,
		methods: ['GET'],
		requestBody: 'buffered',
			fetch: async () =>
				Response.json({ ok: true, name: 'background' }, {
					headers: { 'cache-control': 'no-store' },
				}),
	})
}
