import { describe, it, expect, afterEach } from 'vitest';
import { primeKeyboard, releaseKeyboard } from '../src/loader/keyboard.js';

afterEach( () => {
	releaseKeyboard();
	document.body.innerHTML = '';
} );

describe( 'iOS keyboard seed', () => {
	it( 'focuses a hidden but focusable input synchronously', () => {
		primeKeyboard();
		const seed = document.querySelector( '.tacp-keyboard-seed' );
		expect( seed ).not.toBeNull();
		expect( seed ).toBe( document.activeElement );
		expect( seed.getAttribute( 'aria-hidden' ) ).toBe( 'true' );
		expect( seed.tabIndex ).toBe( -1 );
	} );

	it( 'reuses the seed if the opening gesture fires more than once', () => {
		primeKeyboard();
		const first = document.querySelector( '.tacp-keyboard-seed' );
		primeKeyboard();
		expect( document.querySelectorAll( '.tacp-keyboard-seed' ) ).toHaveLength( 1 );
		expect( document.activeElement ).toBe( first );
	} );

	it( 'removes the seed when the palette input takes over', () => {
		primeKeyboard();
		const input = document.createElement( 'input' );
		input.className = 'tacp-input';
		document.body.appendChild( input );
		input.focus();
		releaseKeyboard();
		expect( document.querySelector( '.tacp-keyboard-seed' ) ).toBeNull();
		expect( document.activeElement ).toBe( input );
	} );
} );
