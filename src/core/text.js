/**
 * @param {string} key
 * @param {...*} params
 * @return {string}
 */
export function msg( key, ...params ) {
	return mw.message( key, ...params ).text();
}

/**
 * Resolve a label that may be a message key or a plain string.
 *
 * @param {string} keyOrText
 * @return {string}
 */
export function text( keyOrText ) {
	if ( typeof keyOrText !== 'string' ) {
		return keyOrText === undefined || keyOrText === null ? '' : String( keyOrText );
	}
	return mw.message( keyOrText ).exists() ? mw.message( keyOrText ).text() : keyOrText;
}

/**
 * Split text around the first case-insensitive match of query, so the
 * template can bold it without ever rendering HTML.
 *
 * @param {string} str
 * @param {string} query
 * @return {{text: string, match: boolean}[]}
 */
export function highlight( str, query ) {
	const q = query.trim().toLowerCase();
	const i = q ? str.toLowerCase().indexOf( q ) : -1;
	if ( i === -1 ) {
		return [ { text: str, match: false } ];
	}
	return [
		{ text: str.slice( 0, i ), match: false },
		{ text: str.slice( i, i + q.length ), match: true },
		{ text: str.slice( i + q.length ), match: false }
	].filter( ( part ) => part.text );
}

/**
 * @param {string} haystack
 * @param {string} query
 * @return {boolean}
 */
export function matches( haystack, query ) {
	return String( haystack ).toLowerCase().includes( query.trim().toLowerCase() );
}

function escapeRegExp( str ) {
	return str.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
}

/**
 * Meaningful words of a query: single letters match too much to be useful
 * when deciding whether an extract really is about the search.
 *
 * @param {string} query
 * @return {string[]}
 */
export function queryWords( query ) {
	return query.trim().toLowerCase().split( /\s+/ ).filter( ( word ) => word.length > 1 );
}

/**
 * True when at least one query word occurs as a whole word in the text.
 * CirrusSearch can return a page whose snippet does not contain the term at
 * all; those results are misleading in the "In page text" group.
 *
 * @param {string} description
 * @param {string} query
 * @return {boolean}
 */
export function descriptionMatches( description, query ) {
	const words = queryWords( query );
	const tokens = String( description ).toLowerCase().split( /\W+/ ).filter( Boolean );
	return words.some( ( word ) => tokens.includes( word ) );
}

/**
 * A short, readable slice of a long text, centred on the first query word.
 * The caller can filter against the full text and show this excerpt instead,
 * so a match deep in an article is not hidden past a one-line ellipsis.
 *
 * @param {string} str Full text
 * @param {string} query
 * @param {number} [length] Maximum characters of the excerpt
 * @return {string}
 */
export function excerptAround( str, query, length = 240 ) {
	const full = String( str || '' );
	if ( full.length <= length ) {
		return full;
	}
	const lower = full.toLowerCase();
	let at = -1;
	queryWords( query ).forEach( ( word ) => {
		const found = new RegExp( '\\b' + escapeRegExp( word ) + '\\b', 'i' ).exec( lower );
		if ( found && ( at === -1 || found.index < at ) ) {
			at = found.index;
		}
	} );
	if ( at === -1 ) {
		return full.slice( 0, length ).replace( /\s+$/, '' ) + '…';
	}
	// Leave about a third of the excerpt before the match, then fill the rest
	const start = Math.max( 0, at - Math.floor( length / 3 ) );
	const end = Math.min( full.length, start + length );
	return ( start > 0 ? '…' : '' ) +
		full.slice( start, end ).trim() +
		( end < full.length ? '…' : '' );
}

/**
 * Split text around every whole-word occurrence of a query word, so the
 * template can bold matches without ever rendering HTML.
 *
 * @param {string} str
 * @param {string} query
 * @return {{text: string, match: boolean}[]}
 */
export function highlightWords( str, query ) {
	const words = queryWords( query );
	if ( !words.length ) {
		return [ { text: str, match: false } ];
	}
	const re = new RegExp( '\\b(?:' + words.map( escapeRegExp ).join( '|' ) + ')\\b', 'gi' );
	const parts = [];
	let last = 0;
	let found;
	while ( ( found = re.exec( str ) ) ) {
		if ( found.index > last ) {
			parts.push( { text: str.slice( last, found.index ), match: false } );
		}
		parts.push( { text: found[ 0 ], match: true } );
		last = found.index + found[ 0 ].length;
	}
	if ( last < str.length ) {
		parts.push( { text: str.slice( last ), match: false } );
	}
	return parts.length ? parts : [ { text: str, match: false } ];
}
