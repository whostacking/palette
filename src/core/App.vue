<template>
	<cdx-dialog
		:open="store.open"
		class="tacp-palette"
		:title="msg( 'tacp-dialog-title' )"
		:aria-label="msg( 'tacp-dialog-title' )"
		:hide-title="true"
		@update:open="store.open = $event"
	>
		<template #header>
			<div class="tacp-header" @keyup.esc.stop>
				<cdx-icon class="tacp-header__icon" :icon="icons.search"></cdx-icon>
				<span v-if="currentMode" class="tacp-chip">
					<span class="tacp-chip__label">{{ modeLabel }}</span>
					<button
						type="button"
						class="tacp-chip__remove"
						:aria-label="msg( 'tacp-mode-leave', modeLabel )"
						@click="popMode"
					>
						<cdx-icon :icon="icons.close" size="x-small"></cdx-icon>
					</button>
				</span>
				<input
					ref="input"
					v-model="query"
					class="tacp-input"
					type="text"
					role="combobox"
					autocomplete="off"
					spellcheck="false"
					aria-autocomplete="list"
					:aria-label="msg( 'tacp-dialog-title' )"
					:aria-controls="listId"
					:aria-expanded="flat.length ? 'true' : 'false'"
					:aria-activedescendant="activeDescendant"
					:aria-describedby="listId + '-hint'"
					:placeholder="placeholder"
					@keydown="onKeydown"
					@click="focusInput"
				>
				<button
					v-if="suggestion"
					type="button"
					class="tacp-suggestion"
					:title="msg( 'tacp-query-suggestion', suggestion )"
					:aria-label="msg( 'tacp-query-suggestion', suggestion )"
					@mousedown.prevent
					@click="applySuggestion"
				>
					{{ suggestion }}
				</button>
				<cdx-button
					class="tacp-header__close"
					weight="quiet"
					:aria-label="msg( 'tacp-close' )"
					@click="store.open = false"
				>
					<cdx-icon :icon="icons.close"></cdx-icon>
				</cdx-button>
			</div>
		</template>

		<div
			:id="listId"
			class="tacp-results"
			role="listbox"
			:aria-label="msg( 'tacp-dialog-title' )"
		>
			<div
				v-for="group in view"
				:key="group.id"
				class="tacp-group"
				role="group"
				:aria-label="group.label || undefined"
			>
				<div
					v-if="group.label"
					class="tacp-group__label"
					aria-hidden="true"
				>
					{{ group.label }}
				</div>
				<div class="tacp-group__columns" role="presentation">
					<div
						v-for="( column, ci ) in group.columns"
						:key="ci"
						class="tacp-group__column"
						role="presentation"
					>
						<result-item
							v-for="entry in column"
							:id="entry.domId"
							:key="entry.domId"
							:item="entry.item"
							:query="query"
							:active="entry.index === activeIndex"
							:active-action="activeAction"
							@hover="hover( entry.index )"
							@activate="onClick( entry.item, $event )"
							@action="runAction"
						></result-item>
					</div>
				</div>
			</div>
		</div>
		<!-- Screen readers: how to use the list, what it holds, which action is chosen -->
		<span :id="listId + '-hint'" class="tacp-sr-only">{{ msg( 'tacp-sr-hint', modKey ) }}</span>
		<span class="tacp-sr-only" role="status">{{ resultsAnnouncement }}</span>
		<span class="tacp-sr-only" aria-live="assertive">{{ actionAnnouncement }}</span>
		<div v-if="emptyState" class="tacp-state">
			<cdx-icon class="tacp-state__icon" :icon="emptyState.icon"></cdx-icon>
			<p class="tacp-state__title">
				{{ emptyState.title }}
			</p>
			<p class="tacp-state__description">
				{{ emptyState.description }}
			</p>
		</div>

		<template #footer>
			<div class="tacp-footer" aria-hidden="true">
				<span><kbd>↑</kbd><kbd>↓</kbd> {{ msg( 'tacp-hint-navigate' ) }}</span>
				<span><kbd>↵</kbd> {{ msg( 'tacp-hint-open' ) }}</span>
				<span v-if="activeItem && activeItem.actions.length">
					<kbd>→</kbd> {{ msg( 'tacp-hint-actions' ) }}
				</span>
				<span><kbd>esc</kbd> {{ msg( 'tacp-hint-close' ) }}</span>
				<span><kbd>?</kbd> {{ msg( 'tacp-hint-help' ) }}</span>
			</div>
		</template>
	</cdx-dialog>
</template>

<script>
import { defineComponent, ref, shallowRef, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { CdxButton, CdxDialog, CdxIcon } from '@wikimedia/codex';
import * as loader from 'ext.gadget.TACP';
import ResultItem from './components/ResultItem.vue';
import store from './store.js';
import icons from './icons.js';
import { msg, text } from './text.js';
import { getGroups } from './results.js';
import { parseTrigger } from './input.js';
import { isAbort, newController } from './services/api.js';
import { addRecent } from './services/recent.js';

const DEBOUNCE = 150;
const MAX_PREFILL = 100;
// Keep in sync with the two-column rules in styles.less
const TWO_COLUMNS = 'screen and (min-width: 1119px)';

function getContext() {
	const c = mw.config;
	return Object.freeze( {
		title: c.get( 'wgPageName' ),
		namespace: c.get( 'wgNamespaceNumber' ),
		articleId: c.get( 'wgArticleId' ),
		revisionId: c.get( 'wgRevisionId' ),
		action: c.get( 'wgAction' ),
		isArticle: !!c.get( 'wgIsArticle' ),
		canEdit: !!c.get( 'wgIsProbablyEditable' ),
		userName: c.get( 'wgUserName' ),
		skin: c.get( 'skin' )
	} );
}

function selectedText() {
	const s = String( window.getSelection ? window.getSelection() : '' ).replace( /\s+/g, ' ' ).trim();
	return s && s.length < MAX_PREFILL ? s : null;
}

// queryActions() supplies the "did you mean" item; it is shown as a chip in
// the header rather than as a row in the list
function isSuggestion( item ) {
	return typeof item.id === 'string' && item.id.endsWith( ':suggestion' );
}

function remember( item ) {
	const t = item.title && mw.Title.newFromText( item.title );
	if ( t ) {
		addRecent( t.getPrefixedText() );
	}
}

export default defineComponent( {
	name: 'TacpApp',
	components: { CdxButton, CdxDialog, CdxIcon, ResultItem },
	props: {
		registry: { type: Object, required: true }
	},
	setup( props ) {
		const input = ref( null );
		const query = ref( '' );
		const modeStack = shallowRef( [] );
		const groups = shallowRef( [] );
		const status = ref( 'ready' );
		const activeIndex = ref( 0 );
		const activeAction = ref( -1 );
		const listId = 'tacp-results';
		let context = getContext();
		let controller = null;
		let timer = null;
		// Enter pressed before the results for the current input arrived
		let pendingEnter = null;

		// Two columns only where there is room for them. On phones (and other
		// narrow viewports) the rows stay in one flat list, in result order.
		const wideScreen = ref( false );
		let media = null;
		function updateWide() {
			wideScreen.value = !!media && media.matches;
		}
		onMounted( () => {
			if ( typeof window.matchMedia !== 'function' ) {
				return;
			}
			media = window.matchMedia( TWO_COLUMNS );
			updateWide();
			if ( media.addEventListener ) {
				media.addEventListener( 'change', updateWide );
			} else if ( media.addListener ) {
				media.addListener( updateWide );
			}
		} );
		onBeforeUnmount( () => {
			if ( !media ) {
				return;
			}
			if ( media.removeEventListener ) {
				media.removeEventListener( 'change', updateWide );
			} else if ( media.removeListener ) {
				media.removeListener( updateWide );
			}
		} );

		// iOS Safari does not shrink the layout viewport when the keyboard
		// opens: a full-height sheet ends up behind it, with no reachable
		// scroll area. Track the visual viewport instead.
		function syncViewport() {
			const vv = window.visualViewport;
			if ( vv ) {
				document.documentElement.style.setProperty(
					'--tacp-viewport-height', Math.round( vv.height ) + 'px' );
			}
		}
		onMounted( () => {
			if ( window.visualViewport ) {
				window.visualViewport.addEventListener( 'resize', syncViewport );
				syncViewport();
			}
		} );
		onBeforeUnmount( () => {
			if ( window.visualViewport ) {
				window.visualViewport.removeEventListener( 'resize', syncViewport );
			}
			document.documentElement.style.removeProperty( '--tacp-viewport-height' );
		} );

		const currentMode = computed( () => modeStack.value[ modeStack.value.length - 1 ] || null );
		const modeLabel = computed( () => currentMode.value ? text( currentMode.value.label ) : '' );
		const rawFlat = computed( () => groups.value.reduce(
			( all, g ) => all.concat( g.items ), [] ) );
		const suggestion = computed( () => {
			const found = rawFlat.value.find( isSuggestion );
			return found ? found.query : '';
		} );
		const view = computed( () => {
			let index = 0;
			return groups.value.map( ( g ) => {
				const visible = g.items.filter( ( item ) => !isSuggestion( item ) );
				const entries = visible.map( ( item ) => {
					const i = index++;
					return { item, index: i, domId: listId + '-' + i };
				} );
				// On wide screens fill each column top to bottom, then start the
				// next one. The flat index stays in that same order, so
				// ArrowDown/ArrowUp move down a column. Narrow screens get a
				// single column with every item in result order.
				const rows = wideScreen.value ? Math.ceil( entries.length / 2 ) : entries.length;
				const columns = [];
				for ( let i = 0; i < entries.length; i += rows ) {
					columns.push( entries.slice( i, i + rows ) );
				}
				return { id: g.id, label: g.label, columns };
			} );
		} );
		const flat = computed( () => rawFlat.value.filter( ( item ) => !isSuggestion( item ) ) );
		const activeItem = computed( () => flat.value[ activeIndex.value ] || null );
		const activeDescendant = computed( () => {
			if ( !activeItem.value ) {
				return undefined;
			}
			// Always the option: what is inside an option is not exposed to
			// assistive technology, so the chosen action is announced instead
			return listId + '-' + activeIndex.value;
		} );
		// Not "loading": announced on every keystroke, it would talk over typing
		const resultsAnnouncement = computed( () => {
			if ( status.value === 'error' ) {
				return msg( 'tacp-state-error-title' );
			}
			return flat.value.length ? msg( 'tacp-sr-results', flat.value.length ) :
				query.value.trim() ? msg( 'tacp-state-noresults-title' ) : '';
		} );
		const actionAnnouncement = computed( () => {
			const item = activeItem.value;
			const action = item && item.actions[ activeAction.value ];
			return action ?
				msg( 'tacp-sr-action', action.label, activeAction.value + 1, item.actions.length ) : '';
		} );
		const placeholder = computed( () => currentMode.value ?
			msg( 'tacp-placeholder-mode', modeLabel.value ) :
			msg( 'tacp-placeholder' ) );
		const emptyState = computed( () => {
			if ( flat.value.length && status.value !== 'error' ) {
				return null;
			}
			const state = status.value === 'error' ? 'error' :
				status.value === 'loading' ? 'loading' :
					query.value.trim() ? 'noresults' :
						// A mode with nothing to list on this page, e.g. no other languages
						currentMode.value ? 'modeempty' : 'empty';
			const icon = {
				error: icons.alert,
				loading: icons.clock,
				noresults: icons.search,
				modeempty: icons.search,
				empty: icons.search
			}[ state ];
			return {
				icon,
				title: msg( 'tacp-state-' + state + '-title' ),
				description: msg( 'tacp-state-' + state + '-desc', query.value.trim() )
			};
		} );

		function close() {
			store.open = false;
		}

		function focusInput() {
			if ( !input.value ) {
				return;
			}
			// A tap on the input is a user gesture: focusing here (instead of
			// only from a timer) is what opens the keyboard on mobile.
			input.value.focus();
			// The loader may have focused a hidden input synchronously during
			// the opening tap so iOS would show the keyboard before the core
			// finished loading. The real input now owns it.
			loader.releaseKeyboard();
		}

		function applySuggestion() {
			if ( suggestion.value ) {
				query.value = suggestion.value;
				focusInput();
			}
		}

		function go( url ) {
			close();
			location.assign( url );
		}

		function pushMode( mode, rest ) {
			modeStack.value = modeStack.value.concat( mode );
			query.value = rest || '';
		}

		function popMode() {
			modeStack.value = modeStack.value.slice( 0, -1 );
			query.value = '';
			focusInput();
		}

		function activate( item, how ) {
			if ( !item ) {
				return;
			}
			if ( how === 'newtab' && item.url ) {
				remember( item );
				window.open( item.url, '_blank', 'noopener' );
			} else if ( how === 'edit' && item.title ) {
				remember( item );
				go( mw.util.getUrl( item.title, { action: 'edit' } ) );
			} else if ( item.mode ) {
				pushMode( item.mode );
			} else if ( item.query !== null && item.query !== undefined ) {
				// e.g. "did you mean": search for the suggestion instead
				query.value = item.query;
			} else if ( item.run || item.url ) {
				remember( item );
				runAction( item );
			}
		}

		function runAction( action ) {
			if ( action.id === 'remove-recent' ) {
				// Removing a single recent page keeps the palette open and
				// rebuilds the list without that row
				action.run();
				refresh();
			} else if ( action.run ) {
				close();
				action.run();
			} else if ( action.url ) {
				go( action.url );
			}
		}

		function refresh() {
			const modes = props.registry.getModes( context );
			if ( !currentMode.value ) {
				const parsed = parseTrigger( query.value, modes );
				const help = query.value === '?' && modes.find( ( m ) => m.id === 'tacp-help' );
				if ( parsed || help ) {
					pushMode( parsed ? parsed.mode : help, parsed ? parsed.rest : '' );
					return;
				}
			}
			clearTimeout( timer );
			if ( controller ) {
				controller.abort();
			}
			const ctrl = controller = newController();
			status.value = 'loading';
			const state = {
				query: query.value,
				mode: currentMode.value,
				context,
				registry: props.registry
			};
			timer = setTimeout( () => {
				getGroups( state, ctrl.signal ).then( ( result ) => {
					if ( ctrl.signal.aborted ) {
						return;
					}
					groups.value = result;
					status.value = 'ready';
					activeIndex.value = 0;
					activeAction.value = -1;
					if ( pendingEnter ) {
						const how = pendingEnter;
						pendingEnter = null;
						activate( flat.value[ 0 ], how );
					}
				}, ( err ) => {
					if ( ctrl.signal.aborted || isAbort( err ) ) {
						return;
					}
					mw.log.warn( 'TACP:', err );
					groups.value = [];
					status.value = 'error';
					pendingEnter = null;
				} );
			}, query.value.trim() && query.value.charAt( 0 ) !== '/' ? DEBOUNCE : 0 );
		}

		function move( delta ) {
			const n = flat.value.length;
			if ( !n ) {
				return;
			}
			activeIndex.value = ( activeIndex.value + delta + n ) % n;
			activeAction.value = -1;
			nextTick( () => {
				const el = document.getElementById( activeDescendant.value );
				if ( el ) {
					el.scrollIntoView( { block: 'nearest' } );
				}
			} );
		}

		function hover( index ) {
			if ( index !== activeIndex.value ) {
				activeIndex.value = index;
				activeAction.value = -1;
			}
		}

		function onClick( item, e ) {
			activate( item, e.ctrlKey || e.metaKey ? 'newtab' : e.shiftKey ? 'edit' : 'open' );
		}

		function onKeydown( e ) {
			if ( e.isComposing ) {
				return;
			}
			const item = activeItem.value;
			switch ( e.key ) {
				case 'Escape':
					// Codex closes the dialog on keyup at the backdrop, so the
					// header stops that event. Leave a mode first, close on the
					// next Escape when already searching the whole wiki.
					e.preventDefault();
					e.stopPropagation();
					if ( modeStack.value.length ) {
						popMode();
					} else {
						close();
					}
					break;
				case 'ArrowDown':
				case 'ArrowUp':
					e.preventDefault();
					move( e.key === 'ArrowDown' ? 1 : -1 );
					break;
				case 'ArrowRight':
					// Only once the caret is at the end, so the input stays editable
					if ( item && activeAction.value < item.actions.length - 1 &&
						e.target.selectionStart === e.target.value.length ) {
						e.preventDefault();
						activeAction.value++;
					}
					break;
				case 'ArrowLeft':
					if ( activeAction.value >= 0 ) {
						e.preventDefault();
						activeAction.value--;
					}
					break;
				case 'Enter': {
					e.preventDefault();
					const how = e.ctrlKey || e.metaKey ? 'newtab' : e.shiftKey ? 'edit' : 'open';
					if ( status.value === 'loading' ) {
						pendingEnter = how;
					} else if ( item && activeAction.value >= 0 ) {
						runAction( item.actions[ activeAction.value ] );
					} else {
						activate( item, how );
					}
					break;
				}
				case 'Backspace':
					if ( !query.value && modeStack.value.length ) {
						e.preventDefault();
						popMode();
					}
					break;
			}
		}

		watch( [ query, () => modeStack.value.length ], refresh );

		watch( () => store.open, ( isOpen ) => {
			if ( isOpen ) {
				context = getContext();
				const fromSelection = store.prefill === null ? selectedText() : null;
				modeStack.value = [];
				groups.value = [];
				query.value = store.prefill !== null ? store.prefill : fromSelection || '';
				// Enter pressed while the core loaded: runs on the first results
				pendingEnter = store.enter;
				store.enter = null;
				const restoreFocus = ( select ) => {
					focusInput();
					if ( select && input.value ) {
						input.value.select();
					}
				};
				// Focus on nextTick: that is still part of the opening user
				// gesture, so the phone keyboard opens on the first tap.
				nextTick( () => restoreFocus( fromSelection ) );
				// Also once CdxDialog has finished its own nextTick focus handling
				setTimeout( () => restoreFocus( fromSelection ) );
				// Also when reopened with an unchanged query, which the watch above misses
				refresh();
			} else {
				clearTimeout( timer );
				if ( controller ) {
					controller.abort();
				}
				pendingEnter = null;
			}
		} );

		// Key names, not translated: what screen readers read for aria-keyshortcuts
		const modKey = /Mac|iPhone|iPad/.test( navigator.platform ) ? 'Command' : 'Control';

		return {
			store, icons, msg, input, query, listId, view, flat, suggestion,
			activeIndex, activeAction,
			activeItem, activeDescendant, resultsAnnouncement, actionAnnouncement,
			currentMode, modeLabel,
			placeholder, emptyState, modKey,
			focusInput, applySuggestion, popMode, hover, onClick, onKeydown, runAction
		};
	}
} );
</script>
