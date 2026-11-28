import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ResultItem from '../src/core/components/ResultItem.vue';

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
