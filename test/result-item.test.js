import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ResultItem from '../src/core/components/ResultItem.vue';

function item( extra ) {
	return Object.assign( { id: 'x-0', label: 'Apple.jpg', actions: [] }, extra );
}

function render( extra ) {
	return mount( ResultItem, { props: { id: 'x-0', item: item( extra ) } } );
}

describe( 'ResultItem', () => {
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
