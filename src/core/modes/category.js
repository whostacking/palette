import { apiGet, isAbort } from '../services/api.js';
import { pageItem } from '../items.js';
import icons from '../icons.js';
import { msg, matches } from '../text.js';

const MEMBERS = 50;

function categoryItem( name, size ) {
	const t = mw.Title.makeTitle( 14, name );
	return t && pageItem( t, {
		label: t.getMainText(),
		badge: '',
		icon: icons.tag,
		description: size === undefined ? '' : msg( 'tacp-category-size', mw.language.convertNumber( size ), size ),
		actions: [ { id: 'open', label: msg( 'tacp-action-open' ), icon: icons.article, url: t.getUrl() } ],
		mode: members( t.getMainText() )
	} );
}

/**
 * Member counts for subcategories, which allcategories does not provide.
 * One batched request; a failed lookup only leaves its subtitle empty.
 *
 * @param {string[]} names Category names without the namespace prefix
 * @param {AbortSignal} signal
 * @return {Promise<Map<string, number>>}
 */
function categorySizes( names, signal ) {
	if ( !names.length ) {
		return Promise.resolve( new Map() );
	}
	return apiGet( {
		action: 'query',
		prop: 'categoryinfo',
		titles: names.map( ( name ) => mw.Title.makeTitle( 14, name ).getPrefixedText() ).join( '|' )
	}, signal ).then( ( data ) => {
		const found = new Map();
		( ( data.query || {} ).pages || [] ).forEach( ( page ) => {
			const categoryName = String( page.title || '' ).replace( /^[^:]+:/, '' );
			const size = page.categoryinfo && page.categoryinfo.size;
			if ( categoryName && typeof size === 'number' ) {
				found.set( categoryName, size );
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
 * Sub-mode listing a category's members, filtered as you type.
 *
 * @param {string} name Category name without namespace
 * @return {Object}
 */
function members( name ) {
	return {
		id: 'tacp-category-members',
		label: name,
		getResults( query, context, signal ) {
			return apiGet( {
				action: 'query',
				list: 'categorymembers',
				cmtitle: mw.Title.makeTitle( 14, name ).getPrefixedText(),
				cmprop: 'title|type',
				cmlimit: MEMBERS
			}, signal ).then( ( data ) => {
				const list = data.query.categorymembers
					.filter( ( m ) => matches( m.title, query ) );
				const subcats = list.filter( ( m ) => m.type === 'subcat' )
					.map( ( m ) => mw.Title.newFromText( m.title ).getMainText() );
				return categorySizes( subcats, signal ).then( ( sizes ) => {
					const subcatItems = subcats.map( ( subcatName ) => (
						categoryItem( subcatName, sizes.get( subcatName ) )
					) );
					return [ {
						id: 'subcats',
						label: msg( 'tacp-group-subcategories' ),
						items: subcatItems
					}, {
						id: 'pages',
						label: msg( 'tacp-group-pages' ),
						items: list.filter( ( m ) => m.type !== 'subcat' ).map( ( m ) => pageItem( m.title ) )
					} ];
				} );
			} );
		}
	};
}

export default {
	id: 'tacp-category',
	trigger: '/category',
	label: 'tacp-mode-category',
	description: 'tacp-mode-category-desc',
	icon: icons.tag,
	getResults( query, context, signal ) {
		const params = { action: 'query', list: 'allcategories', aclimit: 20, acprop: 'size' };
		const prefix = query.trim() && mw.Title.makeTitle( 14, query.trim() );
		if ( prefix ) {
			params.acprefix = prefix.getMainText();
		}
		return apiGet( params, signal ).then( ( data ) => [ {
			id: 'categories',
			label: msg( 'tacp-group-categories' ),
			items: data.query.allcategories.map( ( c ) => categoryItem( c.category, c.size ) )
		} ] );
	}
};
