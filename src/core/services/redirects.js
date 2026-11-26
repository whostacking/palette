import { apiGet, isAbort } from './api.js';

// Typed title (lower case) → { from, to } or null, for the session
const cache = new Map();

function same( a, b ) {
	const x = a && mw.Title.newFromText( a );
	const y = b && mw.Title.newFromText( b );
	return !!x && !!y && x.getPrefixedText().toLowerCase() === y.getPrefixedText().toLowerCase();
}

/**
 * Find the redirect whose title equals the typed title ignoring case, and
 * the page it points to. REST/opensearch only report a redirect when the
 * query matches its exact capitalisation, so "passive block" would otherwise
 * miss a "Passive Block" redirect entirely.
 *
 * @param {string} text
 * @param {AbortSignal} signal
 * @return {Promise<{from: string, to: string}|null>}
 */
export function redirectFor( text, signal ) {
	const q = text.trim();
	if ( !q ) {
		return Promise.resolve( null );
	}
	const key = q.toLowerCase();
	if ( cache.has( key ) ) {
		return Promise.resolve( cache.get( key ) );
	}
	const t = mw.Title.newFromText( q );
	if ( !t || t.getNamespaceId() < 0 ) {
		cache.set( key, null );
		return Promise.resolve( null );
	}
	return apiGet( {
		action: 'query',
		list: 'allpages',
		apprefix: t.getMainText(),
		apnamespace: t.getNamespaceId(),
		apfilterredir: 'redirects',
		aplimit: 10
	}, signal ).then( ( data ) => {
		const titles = ( ( data.query || {} ).allpages || [] ).map( ( p ) => p.title );
		const from = titles.filter( ( title ) => same( title, q ) )[ 0 ];
		if ( !from ) {
			cache.set( key, null );
			return null;
		}
		return apiGet( { action: 'query', titles: from, redirects: 1 }, signal ).then( ( data2 ) => {
			const redirects = ( data2.query || {} ).redirects || [];
			const found = { from, to: redirects.length ? redirects[ 0 ].to : from };
			cache.set( key, found );
			return found;
		} );
	} ).catch( ( err ) => {
		if ( isAbort( err ) ) {
			throw err;
		}
		mw.log.warn( 'TACP:', err );
		return null;
	} );
}
