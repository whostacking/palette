/* eslint-disable camelcase -- REST API field names */
import { describe, it, expect } from 'vitest';
import { mockFetch, siteinfo } from './setup.js';
import { searchTitles, searchText } from '../src/core/providers/search.js';
import { getRelated } from '../src/core/providers/related.js';
import { getGroups, normalizeGroups, exactFirst } from '../src/core/results.js';
import { createRegistry, defineMode } from '../src/core/services/registry.js';
import { builtinCommands } from '../src/core/providers/commands.js';
import { addRecent, getRecent, clearRecent } from '../src/core/services/recent.js';
import icons from '../src/core/icons.js';
import { pageItem, thumbWidth } from '../src/core/items.js';
import { sharpThumb } from '../src/core/services/thumbs.js';
import { newController } from '../src/core/services/api.js';

const context = Object.freeze( {
	title: 'Main_Page', namespace: 0, articleId: 1, isArticle: true, canEdit: true
} );

function registry() {
	const r = createRegistry( [] );
	r.register( defineMode( { id: 'tacp-user', trigger: '/user', label: 'tacp-mode-user', description: 'tacp-mode-user-desc', getResults: () => [] } ), true );
	builtinCommands.forEach( ( c ) => r.register( c, true ) );
	return r;
}

const restPages = {
	pages: [
		{ title: 'Apple', description: 'A fruit', thumbnail: { url: '//img/apple.jpg' }, matched_title: null },
		{ title: 'User:Apple', description: null, thumbnail: null, matched_title: 'Apples' }
	]
};

describe( 'search provider', () => {
	it( 'maps REST results to page items', async () => {
		mockFetch( { '/rest.php/v1/search/title': restPages } );
		const items = await searchTitles( 'app', new AbortController().signal );
		expect( items[ 0 ] ).toMatchObject( { label: 'Apple', description: 'A fruit', thumbnail: { url: '//img/apple.jpg' }, badge: '' } );
		expect( items[ 1 ] ).toMatchObject( { label: 'Apple', badge: 'User', redirectFrom: 'Apples', title: 'User:Apple' } );
		expect( items[ 0 ].actions.map( ( a ) => a.id ) ).toEqual( [ 'edit', 'history' ] );
	} );

	it( 'drops full text hits whose extract does not contain the query word', async () => {
		mockFetch( { 'list=search': { query: { search: [
			{ title: 'Miso', snippet: 'A savoury paste used in soup' },
			{ title: 'Flimsy spoon', snippet: 'A <span class="searchmatch">flimsy</span> wooden spoon' }
		] } } } );
		const { items } = await searchText( 'flimsy y', new AbortController().signal );
		expect( items.map( ( i ) => i.label ) ).toEqual( [ 'Flimsy spoon' ] );
		expect( items[ 0 ].description ).toBe( 'A flimsy wooden spoon' );
	} );

	it( 'falls back to opensearch when rest.php fails', async () => {
		mockFetch( {
			'/rest.php/': new Error( '404' ),
			'action=opensearch': [ 'app', [ 'Apple' ], [ 'A fruit' ], [] ]
		} );
		const items = await searchTitles( 'app', new AbortController().signal );
		expect( items.map( ( i ) => i.label ) ).toEqual( [ 'Apple' ] );
	} );
} );

describe( 'related provider', () => {
	it( 'uses CirrusSearch morelike: on content pages', async () => {
		const fetch = mockFetch( {
			'meta=siteinfo': siteinfo,
			'morelike:Main_Page': { query: { pages: [ { title: 'B', index: 2 }, { title: 'A', index: 1, description: 'first' } ] } }
		} );
		const items = await getRelated( context, new AbortController().signal );
		expect( items.map( ( i ) => i.label ) ).toEqual( [ 'A', 'B' ] );
		expect( fetch ).toHaveBeenCalledTimes( 2 );
	} );

	it( 'shows nothing outside content pages', async () => {
		expect( await getRelated( Object.assign( {}, context, { isArticle: false } ) ) ).toEqual( [] );
		mockFetch( { 'meta=siteinfo': siteinfo } );
		expect( await getRelated( Object.assign( {}, context, { namespace: 2 } ) ) ).toEqual( [] );
	} );
} );

describe( 'recent items', () => {
	it( 'keeps newest first without duplicates, up to 20', () => {
		for ( let i = 0; i < 25; i++ ) {
			addRecent( 'Page ' + i );
		}
		addRecent( 'Page 3' );
		const list = getRecent();
		expect( list ).toHaveLength( 20 );
		expect( list[ 0 ].title ).toBe( 'Page 3' );
		expect( list.filter( ( e ) => e.title === 'Page 3' ) ).toHaveLength( 1 );
		clearRecent();
		expect( getRecent() ).toEqual( [] );
	} );

	it( 'is empty when storage throws', () => {
		mw.storage.getObject = () => {
			throw new Error( 'denied' );
		};
		expect( getRecent() ).toEqual( [] );
	} );
} );

describe( 'getGroups', () => {
	const signal = () => new AbortController().signal;

	it( 'shows recent and related, but no commands, for an empty query', async () => {
		mockFetch( { 'meta=siteinfo': siteinfo, morelike: { query: { pages: [ { title: 'Rel', index: 1 } ] } } } );
		addRecent( 'Seen' );
		const groups = await getGroups( { query: '', mode: null, context, registry: registry() }, signal() );
		expect( groups.map( ( g ) => g.label ) ).toEqual( [ 'Recent', 'Related' ] );
		expect( groups[ 1 ].items.map( ( i ) => i.label ) ).toEqual( [ 'Rel' ] );
	} );

	it( 'shows results, matching commands and query actions while typing', async () => {
		// REST was marked broken by the fallback test above, so opensearch answers
		mockFetch( { 'action=opensearch': [ 'random', [ 'Random walk' ], [ '' ], [] ] } );
		const groups = await getGroups( { query: 'random', mode: null, context, registry: registry() }, signal() );
		expect( groups.map( ( g ) => g.label ) ).toEqual( [ 'Results', 'Commands', 'More' ] );
		expect( groups[ 1 ].items.map( ( i ) => i.label ) ).toEqual( [ 'Random page' ] );
		expect( groups[ 2 ].items.map( ( i ) => i.label ) ).toEqual( [
			'Go to "Random"', 'Search full text for "random"', 'Create or edit "Random"'
		] );
	} );

	it( 'makes full text the Enter action when a typed title has no page', async () => {
		mockFetch( {
			'/rest.php/v1/search/title': { pages: [] },
			'action=opensearch': [ 'crystal bananas', [], [], [] ],
			'list=search': { query: { search: [] } },
			'list=allpages': { query: { allpages: [] } }
		} );
		const groups = await getGroups( {
			query: 'Crystal Bananas', mode: null, context, registry: registry()
		}, signal() );
		const actions = groups[ 0 ].items;
		// The first flat item is what Enter activates
		expect( actions.map( ( i ) => i.label ) ).toEqual( [
			'Search full text for "Crystal Bananas"',
			'Go to "Crystal Bananas"',
			'Create or edit "Crystal Bananas"'
		] );
		const searchUrl = decodeURIComponent( actions[ 0 ].url );
		expect( searchUrl ).toContain( 'Special:Search' );
		expect( searchUrl ).toContain( 'search=Crystal+Bananas' );
		expect( searchUrl ).toContain( 'fulltext=1' );
	} );

	it( 'lists modes for a query starting with /', async () => {
		const groups = await getGroups( { query: '/us', mode: null, context, registry: registry() }, signal() );
		expect( groups[ 0 ].items[ 0 ] ).toMatchObject( { label: 'Users', badge: '/user' } );
		expect( groups[ 0 ].items[ 0 ].mode.id ).toBe( 'tacp-user' );
	} );

	it( 'asks the active mode and keeps only safe output', async () => {
		const mode = { id: 'x-mode', getResults: ( q ) => [ {
			label: 'G',
			items: [
				// eslint-disable-next-line no-script-url -- must be dropped
				{ label: '<b>' + q + '</b>', url: 'javascript:alert(1)', icon: '<path d="M0"/>', actions: [ { label: 'bad', url: 'data:text/html,x' } ] },
				{ label: 'named', icon: 'reload', actions: [ { label: 'ok', url: '/wiki/X', icon: icons.edit } ] },
				null
			]
		} ] };
		const groups = await getGroups( { query: 'q', mode, context, registry: registry() }, signal() );
		expect( groups[ 0 ].items ).toHaveLength( 2 );
		expect( groups[ 0 ].items[ 0 ] ).toMatchObject( { label: '<b>q</b>', url: null, icon: undefined, actions: [] } );
		expect( groups[ 0 ].items[ 1 ].icon ).toBe( icons.reload );
		expect( groups[ 0 ].items[ 1 ].actions[ 0 ] ).toMatchObject( { icon: icons.edit, url: 'http://localhost:3000/wiki/X' } );
	} );

	it( 'keeps only safe icon image URLs', () => {
		const [ g ] = normalizeGroups( [ { items: [
			{ label: 'File', iconUrl: '//img/file.jpg' },
			// eslint-disable-next-line no-script-url -- must be dropped
			{ label: 'Bad', iconUrl: 'javascript:alert(1)' }
		] } ], 'x' );
		expect( g.items[ 0 ].iconUrl ).toBe( 'http://img/file.jpg' );
		expect( g.items[ 1 ].iconUrl ).toBe( null );
	} );

	it( 'drops empty groups and garbage', () => {
		expect( normalizeGroups( 'nope', 'x' ) ).toEqual( [] );
		expect( normalizeGroups( [ { label: 'Empty', items: [] } ], 'x' ) ).toEqual( [] );
		expect( normalizeGroups( [ { items: [ { label: '' }, { url: '/wiki/A' }, { label: 'Ok' } ] } ], 'x' )[ 0 ].items )
			.toEqual( [ expect.objectContaining( { label: 'Ok' } ) ] );
	} );
} );

describe( 'search box behaviour', () => {
	const signal = () => new AbortController().signal;

	it( 'puts the exact title, or the redirect to it, first', () => {
		const items = [ { title: 'Apple pie' }, { title: 'Apple' }, { title: 'Malus', redirectFrom: 'Crab apple' } ];
		expect( exactFirst( items, 'apple' ).map( ( i ) => i.title ) ).toEqual( [ 'Apple', 'Apple pie', 'Malus' ] );
		expect( exactFirst( items, 'crab apple' )[ 0 ].title ).toBe( 'Malus' );
		expect( exactFirst( items, 'pear' ) ).toBe( items );
	} );

	it( 'matches exact titles and redirects regardless of case', () => {
		const items = [ { title: 'Apple' }, { title: 'Passive block', redirectFrom: 'Passive Block' } ];
		expect( exactFirst( items, 'passive block' )[ 0 ].title ).toBe( 'Passive block' );
		expect( exactFirst( items, 'PASSIVE BLOCK' )[ 0 ].title ).toBe( 'Passive block' );
		expect( exactFirst( items, 'apple' )[ 0 ].title ).toBe( 'Apple' );
	} );

	it( 'shows a redirect whose title only differs in capitalisation', async () => {
		const fetch = mockFetch( {
			'meta=siteinfo': siteinfo,
			'action=opensearch': [ 'passive block', [], [ '' ], [] ],
			'list=search': { query: { search: [] } },
			'list=allpages': { query: { allpages: [ { title: 'Passive Blocked' }, { title: 'Passive Block' } ] } },
			'redirects=1': { query: { redirects: [ { from: 'Passive Block', to: 'Category:Passive-Blocked Fish' } ] } }
		} );
		const groups = await getGroups( { query: 'passive block', mode: null, context, registry: registry() }, signal() );
		expect( groups[ 0 ].items[ 0 ] ).toMatchObject( {
			title: 'Category:Passive-Blocked Fish', redirectFrom: 'Passive Block'
		} );
		const lookup = decodeURIComponent( fetch.mock.calls.find(
			( c ) => c[ 0 ].includes( 'list=allpages' ) )[ 0 ] );
		expect( lookup ).toContain( 'apprefix=passive' );
		expect( lookup ).toContain( 'apfilterredir=redirects' );
	} );

	it( 'adds CirrusSearch full text and its suggestion while typing', async () => {
		mockFetch( {
			'meta=siteinfo': siteinfo,
			'action=opensearch': [ 'aple', [ 'Apple' ], [ '' ], [] ],
			'list=search': { query: {
				searchinfo: { suggestion: 'apple' },
				search: [
					{ title: 'Apple', snippet: 'dup' },
					{ title: 'Orchard', snippet: 'an <span class="searchmatch">aple</span> &amp; pear <img src=x onerror=alert(1)>' }
				]
			} }
		} );
		const groups = await getGroups( { query: 'aple', mode: null, context, registry: registry() }, signal() );
		expect( groups.map( ( g ) => g.label ) ).toEqual( [ 'Results', 'In page text', 'More' ] );
		expect( groups[ 1 ].items ).toHaveLength( 1 );
		expect( groups[ 1 ].items[ 0 ] ).toMatchObject( { label: 'Orchard', description: 'an aple & pear ' } );
		expect( groups[ 2 ].items[ 0 ] ).toMatchObject( { label: 'Did you mean "apple"?', query: 'apple', url: null } );
	} );

	it( 'does not repeat a full-text result that differs only in case', async () => {
		mockFetch( {
			'meta=siteinfo': siteinfo,
			'action=opensearch': [ 'apple', [ 'Apple pie' ], [ '' ], [] ],
			'list=search': { query: { search: [ { title: 'APPLE PIE', snippet: 'dup' } ] } }
		} );
		const groups = await getGroups( { query: 'apple', mode: null, context, registry: registry() }, signal() );
		expect( groups.map( ( g ) => g.label ) ).not.toContain( 'In page text' );
		expect( groups[ 0 ].items.map( ( i ) => i.label ) ).toEqual( [ 'Apple pie' ] );
	} );

	it( 'skips full text for short input', async () => {
		const fetch = mockFetch( { 'action=opensearch': [ 'ap', [ 'Apple' ], [ '' ], [] ] } );
		await getGroups( { query: 'ap', mode: null, context, registry: registry() }, signal() );
		expect( fetch.mock.calls.some( ( c ) => c[ 0 ].includes( 'list=search' ) ) ).toBe( false );
	} );
} );

describe( 'page items', () => {
	it( 'excludes change history subpages', () => {
		expect( pageItem( 'Fisch/Change History' ) ).toBe( null );
		expect( pageItem( 'Fisch/change_history' ) ).toBe( null );
		expect( pageItem( 'Fisch/History' ) ).not.toBe( null );
	} );

	it( 'gives file results from any provider a standard thumbnail', () => {
		const item = pageItem( 'File:Apple.jpg' );
		expect( item.icon ).toBe( icons.image );
		expect( decodeURIComponent( item.thumbnail.url ) ).toContain( 'Special:Redirect/file/Apple.jpg' );
		expect( item.thumbnail.url ).toContain( 'width=40' );
		expect( item.thumbnail.width ).toBe( 40 );
		expect( pageItem( 'Apple' ).thumbnail ).toBeUndefined();
	} );

	it( 'keeps a thumbnail supplied by the provider, including an explicit null', () => {
		const found = pageItem( 'File:Apple.jpg', { thumbnail: { url: '//img/apple.jpg', width: 60 } } );
		expect( found.thumbnail ).toEqual( { url: '//img/apple.jpg', width: 60 } );
		expect( pageItem( 'File:Apple.jpg', { thumbnail: null } ).thumbnail ).toEqual( {
			url: expect.any( String ), width: 40
		} );
	} );

	it( 'uses the volume icon for audio files, with no thumbnail', () => {
		const mp3 = pageItem( 'File:Sound.MP3' );
		expect( mp3.icon ).toBe( icons.volumeUp );
		expect( mp3.thumbnail ).toBeUndefined();
		expect( pageItem( 'File:Sound.ogg' ).icon ).toBe( icons.volumeUp );
	} );
} );

describe( 'thumbnails', () => {
	it( 'fetches sharp thumbnails in one batched, cached request', async () => {
		window.devicePixelRatio = 2;
		const fetch = mockFetch( { 'prop=pageimages': ( url ) => {
			expect( url ).toContain( 'pithumbsize=80' );
			return { query: {
				normalized: [ { from: 'apple', to: 'Apple' } ],
				pages: [ { title: 'Apple', thumbnail: { source: '//img/80px-apple.jpg' } }, { title: 'Pear' } ]
			} };
		} } );
		const urls = await Promise.all( [ sharpThumb( 'apple' ), sharpThumb( 'Pear' ), sharpThumb( 'apple' ) ] );
		expect( urls ).toEqual( [ '//img/80px-apple.jpg', null, '//img/80px-apple.jpg' ] );
		expect( await sharpThumb( 'Pear' ) ).toBe( null );
		expect( fetch ).toHaveBeenCalledTimes( 1 );
		expect( decodeURIComponent( fetch.mock.calls[ 0 ][ 0 ] ) ).toContain( 'titles=apple|Pear' );
		window.devicePixelRatio = 1;
	} );

	it( 'sizes thumbnails by device pixel ratio, between 1x and 3x', () => {
		const dpr = window.devicePixelRatio;
		[ [ 1, 40 ], [ 1.5, 60 ], [ 2, 80 ], [ 4, 120 ], [ 0.5, 40 ] ].forEach( ( [ r, w ] ) => {
			window.devicePixelRatio = r;
			expect( thumbWidth() ).toBe( w );
		} );
		window.devicePixelRatio = dpr;
	} );
} );

describe( 'newController', () => {
	it( 'stands in for AbortController where the browser has none', () => {
		const real = global.AbortController;
		global.AbortController = undefined;
		const ctrl = newController();
		expect( ctrl.signal.aborted ).toBe( false );
		ctrl.signal.addEventListener( 'abort', () => {} );
		ctrl.abort();
		expect( ctrl.signal.aborted ).toBe( true );
		global.AbortController = real;
		expect( newController() ).toBeInstanceOf( real );
	} );
} );
