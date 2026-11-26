import { apiGet, isAbort } from '../services/api.js';
import { pageItem, thumbWidth, safeUrl } from '../items.js';
import icons from '../icons.js';
import { msg, matches } from '../text.js';
import { exactFirst, queryActions, userCanEdit } from '../results.js';
import { getSiteInfo } from '../services/siteinfo.js';
import { specialPageItems } from './action.js';

const LIMIT = 10;

/**
 * Add each file's own thumbnail to File-namespace results, so the item can
 * show the image instead of the generic SVG icon. PageImages is for images
 * used on a page; imageinfo is the file itself, even for SVGs.
 *
 * @param {Object[]} items
 * @param {AbortSignal} signal
 * @return {Promise<Object[]>}
 */
function withFileIcons( items, signal ) {
	if ( !items.length ) {
		return Promise.resolve( items );
	}
	return apiGet( {
		action: 'query',
		titles: items.map( ( it ) => it.title ).join( '|' ),
		prop: 'imageinfo',
		iiprop: 'url',
		iiurlwidth: thumbWidth()
	}, signal ).then( ( data ) => {
		const q = data.query || {};
		const normalized = new Map( ( q.normalized || [] ).map( ( n ) => [ n.from, n.to ] ) );
		const redirects = new Map( ( q.redirects || [] ).map( ( r ) => [ r.from, r.to ] ) );
		const renamed = ( map, title ) => map.has( title ) ? map.get( title ) : title;
		const urls = new Map( ( q.pages || [] ).map( ( p ) => {
			const info = p.imageinfo && p.imageinfo[ 0 ];
			return [ p.title, info && ( info.thumburl || info.url ) ];
		} ) );
		return items.map( ( it ) => {
			const title = renamed( redirects, renamed( normalized, it.title ) );
			const url = safeUrl( urls.get( title ) );
			return url ? Object.assign( {}, it, { iconUrl: url } ) : it;
		} );
	} ).catch( ( err ) => {
		if ( isAbort( err ) ) {
			throw err;
		}
		mw.log.warn( 'TACP:', err );
		return items;
	} );
}

/**
 * Sub-mode entered after picking a namespace: page search within it.
 *
 * @param {number} ns
 * @param {string} name
 * @return {Object}
 */
function namespaceSearch( ns, name ) {
	return {
		id: 'tacp-ns-' + ns,
		label: name,
		getResults( query, context, signal ) {
			// A "}}" typed after "{{" (titles cannot hold braces)
			const q = query.replace( /\}\}\s*$/, '' ).trim();
			const params = q ?
				{ action: 'query', list: 'prefixsearch', pssearch: q, psnamespace: ns, pslimit: LIMIT } :
				{ action: 'query', list: 'allpages', apnamespace: ns, aplimit: LIMIT };
			const isFileNs = ns === mw.config.get( 'wgNamespaceIds' ).file;
			// Special pages have no allpages; siteinfo also matches their aliases
			const pages = ns === -1 ?
				getSiteInfo().then( ( info ) => specialPageItems( info, q ) ) :
				apiGet( params, signal ).then( ( data ) => ( data.query.prefixsearch || data.query.allpages || [] )
					.map( ( p ) => pageItem( p.title, isFileNs ? { icon: icons.image } : null ) )
					.filter( Boolean ) );
			const withIcons = isFileNs ?
				pages.then( ( found ) => withFileIcons( found, signal ) ) : pages;
			// Go to or create the typed title, as outside the namespace
			const t = q && mw.Title.makeTitle( ns, q );
			return Promise.all( [ withIcons, userCanEdit() ] ).then( ( [ items, canEdit ] ) => [ {
				id: 'pages',
				label: msg( 'tacp-group-pages' ),
				items: t ? exactFirst( items, t.getPrefixedText() ) : items
			}, {
				id: 'query',
				label: msg( 'tacp-group-query' ),
				items: t ? queryActions( t.getPrefixedText(), canEdit ) : []
			} ] );
		}
	};
}

/**
 * The namespace search for a namespace name typed before a colon, in any of
 * the forms the wiki accepts (local, canonical, aliases).
 *
 * @param {string} prefix e.g. "Template", "bản mẫu"
 * @return {Object|null} Mode, or null for the main namespace, Media: and non-namespaces
 */
export function namespaceForPrefix( prefix ) {
	const id = mw.config.get( 'wgNamespaceIds' )[ prefix.trim().replace( / /g, '_' ).toLowerCase() ];
	return id > 0 || id === -1 ? namespaceSearch( id, mw.config.get( 'wgFormattedNamespaces' )[ id ] ) : null;
}

export default {
	id: 'tacp-ns',
	trigger: '/ns',
	label: 'tacp-mode-ns',
	// "{{" goes in as a parameter: in the message text jqueryMsg would parse it
	// as a template and log a parse error. Read when the mode is registered,
	// after the messages are loaded.
	get description() {
		return msg( 'tacp-mode-ns-desc', '{{' );
	},
	icon: icons.folder,
	getResults( query ) {
		const names = mw.config.get( 'wgFormattedNamespaces' );
		const items = Object.keys( names )
			.map( Number )
			.filter( ( id ) => id >= -1 )
			.map( ( id ) => {
				const name = id === 0 ? msg( 'tacp-ns-main' ) : names[ id ];
				return { id: String( id ), label: name, badge: String( id ), icon: icons.folder, mode: namespaceSearch( id, name ) };
			} )
			.filter( ( item ) => matches( item.label, query ) );
		return [ { id: 'namespaces', label: msg( 'tacp-group-namespaces' ), items } ];
	}
};
