const KEY = 'tacp-recent-' + mw.config.get( 'wgWikiID' );
const MAX = 20;

/**
 * Pages opened from the palette, newest first. Per browser, per wiki,
 * never sent anywhere. Empty when storage is unavailable.
 *
 * @return {{title: string}[]}
 */
export function getRecent() {
	let list;
	try {
		list = mw.storage.getObject( KEY );
	} catch ( e ) {
		return [];
	}
	return Array.isArray( list ) ? list.filter( ( e ) => e && typeof e.title === 'string' ) : [];
}

export function addRecent( title ) {
	const list = getRecent().filter( ( e ) => e.title !== title );
	list.unshift( { title } );
	try {
		mw.storage.setObject( KEY, list.slice( 0, MAX ) );
	} catch ( e ) {}
}

export function clearRecent() {
	try {
		mw.storage.remove( KEY );
	} catch ( e ) {}
}

/**
 * Forget one recently visited page, keeping the rest in order.
 *
 * @param {string} title
 */
export function removeRecent( title ) {
	try {
		mw.storage.setObject( KEY, getRecent().filter( ( e ) => e.title !== title ) );
	} catch ( e ) {}
}
