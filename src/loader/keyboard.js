// iOS Safari only shows the software keyboard when an input is focused in
// response to a user gesture. WebKit's position is explicit in bug 195884:
// programmatic focus outside a gesture must not bring the keyboard up.
//
// The first palette open is asynchronous (the core is still loading), so by
// the time its real input exists the tap's gesture is gone. Focus a hidden but
// focusable input synchronously in the tap, keep it focused while the core
// loads, then let the real input take over. The keyboard stays up across that
// hand-off.

let seed = null;

/**
 * Focus a temporary input inside the current user gesture.
 * Must be called synchronously from the click/mousedown handler.
 */
export function primeKeyboard() {
	if ( seed ) {
		seed.focus();
		return;
	}
	const el = document.createElement( 'input' );
	el.type = 'text';
	el.className = 'tacp-keyboard-seed';
	el.tabIndex = -1;
	el.autocomplete = 'off';
	// This input is focused, so it must not be aria-hidden (Chrome blocks
	// aria-hidden on a focused element). It is visually hidden only. Give it
	// a name instead of leaving an unlabelled input exposed.
	el.setAttribute( 'aria-label', 'Search' );
	( document.body || document.documentElement ).appendChild( el );
	seed = el;
	el.focus();
}

/**
 * Remove the temporary input once the palette's own input has focus.
 */
export function releaseKeyboard() {
	if ( !seed ) {
		return;
	}
	const el = seed;
	seed = null;
	el.blur();
	el.remove();
}
