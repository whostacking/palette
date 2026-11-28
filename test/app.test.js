import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import App from '../src/core/App.vue';
import store from '../src/core/store.js';
import { createRegistry, defineMode } from '../src/core/services/registry.js';

// Longer than the 150 ms search debounce
const tick = () => new Promise( ( resolve ) => {
	setTimeout( resolve, 200 );
} ).then( flushPromises );
let wrapper = null;

function setup() {
	const registry = createRegistry( [] );
	const run = vi.fn();
	registry.register( defineMode( {
		id: 'mygadget-fruit',
		trigger: '/fruit',
		label: 'Fruit',
		description: 'Pick a fruit',
		getResults: ( q ) => [ { label: 'Fruit', items: [
			{ id: 'a', label: 'Apple', run },
			{ id: 'b', label: 'Banana', run }
		].filter( ( i ) => i.label.toLowerCase().includes( q ) ) } ]
	} ) );
	wrapper = mount( App, { props: { registry }, attachTo: document.body } );
	return { run };
}

async function openWith( prefill ) {
	store.prefill = prefill;
	store.open = true;
	await nextTick();
	await tick();
	return document.querySelector( '.tacp-input' );
}

async function type( input, value ) {
	input.value = value;
	input.dispatchEvent( new Event( 'input' ) );
	await tick();
}

function key( input, k, extra ) {
	input.dispatchEvent( new KeyboardEvent( 'keydown', Object.assign( { key: k, bubbles: true }, extra ) ) );
	return tick();
}

afterEach( () => {
	store.open = false;
	wrapper.unmount();
	document.body.innerHTML = '';
	vi.unstubAllGlobals();
} );

describe( 'App', () => {
	it( 'enters a mode from a typed trigger and runs the highlighted item', async () => {
		const { run } = setup();
		const input = await openWith( '/fruit ' );
		expect( document.querySelector( '.tacp-chip__label' ).textContent ).toBe( 'Fruit' );
		expect( input.value ).toBe( '' );

		await type( input, 'an' );
		const options = document.querySelectorAll( '[role="option"]' );
		expect( [ ...options ].map( ( o ) => o.textContent.trim() ) ).toEqual( [ 'Banana' ] );
		expect( input.getAttribute( 'aria-activedescendant' ) ).toBe( options[ 0 ].id );

		await key( input, 'Enter' );
		expect( run ).toHaveBeenCalledTimes( 1 );
		expect( store.open ).toBe( false );
	} );

	it( 'moves the highlight with the arrow keys and wraps', async () => {
		setup();
		const input = await openWith( '/fruit ' );
		const selected = () => document.querySelector( '[aria-selected="true"]' ).textContent.trim();
		expect( selected() ).toBe( 'Apple' );
		await key( input, 'ArrowDown' );
		expect( selected() ).toBe( 'Banana' );
		await key( input, 'ArrowDown' );
		expect( selected() ).toBe( 'Apple' );
		await key( input, 'ArrowUp' );
		expect( selected() ).toBe( 'Banana' );
	} );

	it( 'fills two columns top-to-bottom and moves down a column', async () => {
		vi.stubGlobal( 'matchMedia', () => ( {
			matches: true,
			addEventListener() {},
			removeEventListener() {}
		} ) );
		const registry = createRegistry( [] );
		registry.register( defineMode( {
			id: 'mygadget-many', trigger: '/many', label: 'Many', description: 'Many',
			getResults: () => [ { items: Array.from( { length: 10 }, ( _, i ) => ( {
				id: String( i ), label: 'Item ' + ( i + 1 ), run() {}
			} ) ) } ]
		} ) );
		wrapper = mount( App, { props: { registry }, attachTo: document.body } );
		const input = await openWith( '/many ' );
		const columns = document.querySelectorAll( '.tacp-group__column' );
		expect( columns.length ).toBe( 2 );
		const labels = ( column ) => [ ...column.querySelectorAll( '[role="option"]' ) ]
			.map( ( o ) => o.textContent.trim() );
		expect( labels( columns[ 0 ] ) ).toEqual( [ 'Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5' ] );
		expect( labels( columns[ 1 ] ) ).toEqual( [ 'Item 6', 'Item 7', 'Item 8', 'Item 9', 'Item 10' ] );

		const selected = () => document.querySelector( '[aria-selected="true"]' ).textContent.trim();
		for ( let i = 0; i < 4; i++ ) {
			await key( input, 'ArrowDown' );
		}
		expect( selected() ).toBe( 'Item 5' );
		await key( input, 'ArrowDown' );
		expect( selected() ).toBe( 'Item 6' );
	} );

	it( 'keeps one flat column in result order on narrow screens', async () => {
		const registry = createRegistry( [] );
		registry.register( defineMode( {
			id: 'mygadget-narrow', trigger: '/narrow', label: 'Narrow', description: 'Narrow',
			getResults: () => [ { items: Array.from( { length: 10 }, ( _, i ) => ( {
				id: String( i ), label: 'Item ' + ( i + 1 ), run() {}
			} ) ) } ]
		} ) );
		wrapper = mount( App, { props: { registry }, attachTo: document.body } );
		const input = await openWith( '/narrow ' );
		const columns = document.querySelectorAll( '.tacp-group__column' );
		expect( columns.length ).toBe( 1 );
		expect( [ ...columns[ 0 ].querySelectorAll( '[role="option"]' ) ]
			.map( ( o ) => o.textContent.trim() ) ).toEqual( [
			'Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5',
			'Item 6', 'Item 7', 'Item 8', 'Item 9', 'Item 10'
		] );
		const selected = () => document.querySelector( '[aria-selected="true"]' ).textContent.trim();
		for ( let i = 0; i < 5; i++ ) {
			await key( input, 'ArrowDown' );
		}
		expect( selected() ).toBe( 'Item 6' );
	} );

	it( 'focuses the input on tap so the phone keyboard opens', async () => {
		setup();
		const input = await openWith( '/fruit ' );
		input.blur();
		expect( document.activeElement ).not.toBe( input );
		input.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) );
		await nextTick();
		expect( document.activeElement ).toBe( input );
	} );

	it( 'tells screen readers the result count and the chosen action', async () => {
		const registry = createRegistry( [] );
		registry.register( defineMode( {
			id: 'mygadget-tools', trigger: '/tools', label: 'Tools', description: 'Tools',
			getResults: () => [ { items: [ { id: 'x', label: 'X', run() {}, actions: [
				{ id: 'e', label: 'Edit', run() {} }, { id: 'h', label: 'History', run() {} }
			] } ] } ]
		} ) );
		wrapper = mount( App, { props: { registry }, attachTo: document.body } );
		const input = await openWith( '/tools ' );
		const status = document.querySelector( '[role="status"]' );
		const hint = document.getElementById( input.getAttribute( 'aria-describedby' ) );
		expect( hint.textContent ).toMatch( /Enter/ );
		expect( status.textContent ).toBe( '1 result' );
		await key( input, 'ArrowRight' );
		const option = document.querySelector( '[role="option"]' );
		expect( input.getAttribute( 'aria-activedescendant' ) ).toBe( option.id );
		expect( document.querySelector( '[aria-live="assertive"]' ).textContent ).toBe( 'Edit, action 1 of 2' );
		await key( input, 'ArrowLeft' );
		expect( document.querySelector( '[aria-live="assertive"]' ).textContent ).toBe( '' );
	} );

	it( 'shows a did-you-mean chip beside the input and applies it on click', async () => {
		const registry = createRegistry( [] );
		registry.register( defineMode( {
			id: 'mygadget-suggest', trigger: '/sug', label: 'Suggest', description: 'Suggest',
			getResults: () => [ { items: [
				{ id: 'suggestion', label: 'Did you mean "apple"?', query: 'apple' }
			] } ]
		} ) );
		wrapper = mount( App, { props: { registry }, attachTo: document.body } );
		const input = await openWith( '/sug ' );
		const chip = document.querySelector( '.tacp-suggestion' );
		expect( chip.textContent.trim() ).toBe( 'apple' );
		expect( document.querySelectorAll( '[role="option"]' ) ).toHaveLength( 0 );
		chip.click();
		await nextTick();
		expect( input.value ).toBe( 'apple' );
	} );

	it( 'runs the first result when Enter was pressed before the palette loaded', async () => {
		const { run } = setup();
		store.enter = 'open';
		await openWith( '/fruit ban' );
		expect( run ).toHaveBeenCalledTimes( 1 );
		expect( store.enter ).toBe( null );
	} );

	it( 'leaves the mode with Backspace in an empty input', async () => {
		setup();
		const input = await openWith( '/fruit ' );
		await key( input, 'Backspace' );
		expect( document.querySelector( '.tacp-chip' ) ).toBe( null );
	} );

	it( 'Escape leaves a mode, then closes the palette', async () => {
		setup();
		const input = await openWith( '/fruit ' );
		expect( document.querySelector( '.tacp-chip' ) ).not.toBe( null );

		await key( input, 'Escape' );
		expect( document.querySelector( '.tacp-chip' ) ).toBe( null );
		expect( store.open ).toBe( true );

		await key( input, 'Escape' );
		expect( store.open ).toBe( false );
	} );

	it( 'lists modes after / and enters one with Enter', async () => {
		setup();
		const input = await openWith( '/fr' );
		expect( document.querySelector( '.tacp-item__badge' ).textContent ).toBe( '/fruit' );
		await key( input, 'Enter' );
		expect( document.querySelector( '.tacp-chip__label' ).textContent ).toBe( 'Fruit' );
	} );

	it( 'labels the dialog and shows a no-results state', async () => {
		setup();
		const input = await openWith( '/fruit ' );
		await type( input, 'zzz' );
		expect( document.querySelector( '[role="dialog"]' ).getAttribute( 'aria-label' ) ).toBe( 'Command palette' );
		expect( document.querySelector( '.tacp-state__title' ).textContent.trim() ).toBe( 'No results' );
	} );

	it( 'says the mode is empty, not that "" matched nothing, when nothing is typed', async () => {
		// A mode that lists nothing, like @ on a page with no other languages
		const registry = createRegistry( [] );
		registry.register( defineMode( { id: 'mygadget-none', trigger: '/none', label: 'None', description: 'Nothing', getResults: () => [] } ) );
		wrapper = mount( App, { props: { registry }, attachTo: document.body } );
		await openWith( '/none ' );
		expect( document.querySelector( '.tacp-state__title' ).textContent.trim() ).toBe( 'Nothing here' );
		expect( document.querySelector( '.tacp-state__description' ).textContent ).not.toContain( '""' );
	} );
} );
