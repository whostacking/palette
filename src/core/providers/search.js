import { apiGet, restGet, isAbort } from '../services/api.js';
import { pageItem } from '../items.js';
import { descriptionMatches, excerptAround } from '../text.js';

const LIMIT = 10;
let restBroken = false;

// Mirrors TextExtracts' default $wgExtractsRemoveClasses. TextExtracts does
// not expose that setting to JS, so a wiki that customises it also needs
// mw.config.set( 'wgExtractsRemoveClasses', [ ... ] ) for the filtering below.
const REMOVE_CLASSES = [
	'table', 'div', 'figure', 'script', 'input', 'style', 'ul.gallery',
	'mw\\:editsection', 'editsection', 'meta', 'sup.reference',
	'ol.references', '.error', '.nomobile', '.noprint', '.noexcerpt', '.sortkey'
];

function removeSelectors() {
	const configured = mw.config.get( 'wgExtractsRemoveClasses' );
	const list = Array.isArray( configured ) ? configured :
		typeof configured === 'string' ? configured.split( /\s+/ ) : REMOVE_CLASSES;
	return list.filter( ( s ) => typeof s === 'string' && s );
}

function viaRest( query, signal ) {
	return restGet( '/v1/search/title?limit=' + LIMIT + '&q=' + encodeURIComponent( query ), signal )
		.then( ( data ) => data.pages.map( ( page ) => pageItem( page.title, {
			description: page.description || '',
			thumbnail: page.thumbnail && page.thumbnail.url ?
				{ url: page.thumbnail.url, width: page.thumbnail.width } : null,
			redirectFrom: page.matched_title || ''
		} ) ) );
}

function viaOpensearch( query, signal ) {
	return apiGet( { action: 'opensearch', search: query, limit: LIMIT }, signal )
		.then( ( data ) => data[ 1 ].map( ( title, i ) => pageItem( title, {
			description: data[ 2 ][ i ] || ''
		} ) ) );
}

/**
 * Title search: REST first, action=opensearch when rest.php is unavailable.
 *
 * @param {string} query
 * @param {AbortSignal} signal
 * @return {Promise<Object[]>} Page items
 */
export function searchTitles( query, signal ) {
	const run = restBroken ? viaOpensearch( query, signal ) :
		viaRest( query, signal ).catch( ( err ) => {
			if ( isAbort( err ) ) {
				throw err;
			}
			restBroken = true;
			return viaOpensearch( query, signal );
		} );
	return run.then( ( items ) => items.filter( Boolean ) );
}

function plainText( html ) {
	// DOMParser documents are inert: no scripts run, no images load
	const doc = new DOMParser().parseFromString( html, 'text/html' );
	removeSelectors().forEach( ( selector ) => {
		let found;
		try {
			found = doc.body.querySelectorAll( selector );
		} catch ( e ) {
			// A bad selector in the wiki's config must not break search.
			return;
		}
		found.forEach( ( element ) => element.remove() );
	} );
	return doc.body.textContent;
}

/**
 * Whole-page plain text extracts have $wgExtractsRemoveClasses applied on the
 * server, so entries such as stub notices never reach the description. No
 * exintro/exchars limit: the whole page is searched, not just its lead. One
 * batched request for all hits; without extracts (extension missing or API
 * error) the caller falls back to the snippet. Aborts propagate.
 *
 * @param {Object[]} pages Search hits
 * @param {AbortSignal} signal
 * @return {Promise<Map>} Lowercased title to clean extract
 */
function extractsFor( pages, signal ) {
	const titles = pages.map( ( page ) => page.title ).filter( Boolean );
	if ( !titles.length ) {
		return Promise.resolve( new Map() );
	}
	return apiGet( {
		action: 'query',
		prop: 'extracts',
		explaintext: 1,
		exlimit: 'max',
		titles: titles.join( '|' )
	}, signal ).then( ( data ) => {
		const found = new Map();
		const listed = ( data.query && data.query.pages ) || [];
		listed.forEach( ( page ) => {
			if ( typeof page.extract === 'string' && page.extract.trim() ) {
				found.set( String( page.title ).toLowerCase(), page.extract.trim() );
			}
		} );
		return found;
	} ).catch( ( err ) => {
		if ( isAbort( err ) ) {
			throw err;
		}
		return new Map();
	} );
}

/**
 * Full-text search through CirrusSearch: matching pages with their whole-page
 * plain text (or a snippet), and its "did you mean" suggestion.
 *
 * @param {string} query
 * @param {AbortSignal} signal
 * @return {Promise<{items: Object[], suggestion: string}>}
 */
export function searchText( query, signal ) {
	return apiGet( {
		action: 'query',
		list: 'search',
		srsearch: query,
		srlimit: 5,
		srprop: 'snippet',
		srinfo: 'suggestion'
	}, signal ).then( ( data ) => {
		const hits = ( data.query && data.query.search ) || [];
		return extractsFor( hits, signal ).then( ( extracts ) => ( {
			items: hits
				.map( ( page ) => {
					const full = extracts.get( page.title.toLowerCase() ) ||
						plainText( page.snippet || '' );
					// Filter against the whole page, but show a short slice
					// around the match so it is visible in the one-line label.
					if ( !descriptionMatches( full, query ) ) {
						return null;
					}
					const description = excerptAround( full, query );
					return pageItem( page.title, { description } );
				} )
				.filter( Boolean ),
			suggestion: ( data.query.searchinfo && data.query.searchinfo.suggestion ) || ''
		} ) );
	} );
}
