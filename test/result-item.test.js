import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ResultItem from '../src/core/components/ResultItem.vue';
import icons from '../src/core/icons.js';

function item( extra ) {
	return Object.assign( { id: 'x-0', label: 'Apple.jpg', actions: [] }, extra );
}

function render( extra ) {
	return mount( ResultItem, { props: { id: 'x-0', item: item( extra ) } } );
}

afterEach( () => vi.unstubAllGlobals() );

describe( 'ResultItem', () => {
	it( 'reloads the image when the row is reused for another search result', async () => {
		const loads = [];
		vi.stubGlobal( 'Image', class {
			set src( url ) {
				loads.push( this );
				this.url = url;
			}
		} );
		const wrapper = render( { thumbnail: { url: '/img/one.jpg', width: 40 } } );
		expect( loads.length ).toBe( 1 );
		loads[ 0 ].onload();
		await nextTick();
		expect( wrapper.vm.thumbUrl ).toBe( '/img/one.jpg' );

		await wrapper.setProps( { item: item( {
			id: 'x-1',
			label: 'Banana.jpg',
			thumbnail: { url: '/img/two.jpg', width: 40 }
		} ) } );
		// The old image is dropped and the new one is fetched for this row
		expect( wrapper.vm.thumbUrl ).toBe( null );
		const nextLoad = loads.find( ( load ) => load.url === '/img/two.jpg' );
		expect( nextLoad ).toBeDefined();
		nextLoad.onload();
		await nextTick();
		expect( wrapper.vm.thumbUrl ).toBe( '/img/two.jpg' );
	} );

	it( 'ignores an old image that finishes loading after the item changed', async () => {
		const loads = [];
		vi.stubGlobal( 'Image', class {
			set src( url ) {
				loads.push( this );
				this.url = url;
			}
		} );
		const wrapper = render( { thumbnail: { url: '/img/one.jpg', width: 40 } } );
		await wrapper.setProps( { item: item( {
			id: 'x-1',
			label: 'Banana.jpg',
			thumbnail: { url: '/img/two.jpg', width: 40 }
		} ) } );
		loads[ 0 ].onload();
		loads[ 1 ].onload();
		await nextTick();
		expect( wrapper.vm.thumbUrl ).toBe( '/img/two.jpg' );
	} );

	it( 'observes the new row element after a fast result change', async () => {
		const observed = [];
		vi.stubGlobal( 'IntersectionObserver', class {
			constructor( callback ) {
				this.callback = callback;
			}

			observe( el ) {
				observed.push( el );
			}

			disconnect() {}
		} );
		const wrapper = render( {
			label: 'Apple.jpg',
			title: 'Apple',
			url: '/wiki/Apple',
			thumbnail: { url: '/img/apple.jpg', width: 40 }
		} );
		const before = wrapper.find( '.tacp-item' ).element;
		await wrapper.setProps( { item: item( {
			label: 'Banana.jpg',
			thumbnail: { url: '/img/banana.jpg', width: 40 }
		} ) } );
		const after = wrapper.find( '.tacp-item' ).element;
		// A link became a div, so Vue replaced the root node. The lazy image
		// observer must be attached to the new one, not the detached one.
		expect( after.tagName ).not.toBe( before.tagName );
		expect( observed[ observed.length - 1 ] ).toBe( after );
	} );

	it( 'renders the namespace as a bold span inside the label', () => {
		const wrapper = mount( ResultItem, { props: {
			id: 'x-0',
			item: item( { namespace: 'Help:', query: undefined } )
		} } );
		const label = wrapper.find( '.tacp-item__label' );
		const ns = label.find( '.tacp-item__namespace' );
		expect( ns.exists() ).toBe( true );
		expect( ns.text() ).toBe( 'Help:' );
		expect( label.text() ).toBe( 'Help:Apple.jpg' );
		expect( wrapper.find( '.tacp-item__badge' ).exists() ).toBe( false );
	} );

	it( 'bolds query words in the description', () => {
		const wrapper = mount( ResultItem, { props: {
			id: 'x-0',
			item: item( { description: 'A flimsy spoon' } ),
			query: 'flimsy y'
		} } );
		const bold = wrapper.find( '.tacp-item__description b' );
		expect( bold.exists() ).toBe( true );
		expect( bold.text() ).toBe( 'flimsy' );
	} );

	it( 'shows the redirect source before the actions overlay', () => {
		const wrapper = mount( ResultItem, { props: {
			id: 'x-0',
			item: item( {
				redirectFrom: 'C$',
				actions: [
					{ id: 'edit', label: 'Edit', icon: icons.edit, url: '/wiki/X?action=edit' },
					{ id: 'history', label: 'History', icon: icons.history, url: '/wiki/X?action=history' }
				]
			} )
		} } );
		expect( wrapper.find( '.tacp-item__redirect' ).exists() ).toBe( false );
		const metadata = wrapper.find( '.tacp-item__metadata' );
		expect( metadata.text() ).toBe( 'C$' );
		const overlay = wrapper.find( '.tacp-item__actions' );
		expect( overlay.find( '.tacp-item__buttons' ).exists() ).toBe( true );
		expect( overlay.findAll( '.tacp-item__action' ) ).toHaveLength( 2 );
		expect( metadata.element.nextElementSibling ).toBe( overlay.element );
	} );

	it( 'shows the file image in the icon slot when iconUrl is set', () => {
		const wrapper = render( { iconUrl: '/img/apple.jpg' } );
		const img = wrapper.find( '.tacp-item__icon img' );
		expect( img.exists() ).toBe( true );
		expect( img.attributes( 'src' ) ).toBe( '/img/apple.jpg' );
		expect( wrapper.find( '.tacp-item__icon svg' ).exists() ).toBe( false );
	} );

	it( 'falls back to the SVG icon when the image fails to load', async () => {
		const wrapper = render( { iconUrl: '/img/broken.jpg' } );
		await wrapper.find( '.tacp-item__icon img' ).trigger( 'error' );
		expect( wrapper.find( '.tacp-item__icon img' ).exists() ).toBe( false );
		expect( wrapper.find( '.tacp-item__icon svg' ).exists() ).toBe( true );
	} );

	it( 'shows the SVG icon when there is no image', () => {
		const wrapper = render( {} );
		expect( wrapper.find( '.tacp-item__icon img' ).exists() ).toBe( false );
		expect( wrapper.find( '.tacp-item__icon svg' ).exists() ).toBe( true );
	} );
} );
