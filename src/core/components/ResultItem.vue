<template>
	<!-- A real link where the item opens a page, so right-click, long-press and
		middle-click work as on any link; the input keeps the focus -->
	<component
		:is="href ? 'a' : 'div'"
		:id="id"
		ref="root"
		:href="href || undefined"
		:tabindex="href ? -1 : undefined"
		role="option"
		class="tacp-item"
		:class="{ 'tacp-item--active': active }"
		:aria-selected="active ? 'true' : 'false'"
		@mousemove="$emit( 'hover' )"
		@mousedown.prevent
		@click.prevent="$emit( 'activate', $event )"
	>
		<cdx-thumbnail
			v-if="item.thumbnail"
			:key="thumbUrl || ''"
			class="tacp-item__thumbnail"
			:thumbnail="thumbUrl ? { url: thumbUrl } : null"
		></cdx-thumbnail>
		<span v-else class="tacp-item__icon">
			<img
				v-if="item.iconUrl && item.iconUrl !== failedIconUrl"
				class="tacp-item__icon-image"
				:src="item.iconUrl"
				alt=""
				@error="failedIconUrl = item.iconUrl"
			>
			<cdx-icon v-else :icon="item.icon || defaultIcon"></cdx-icon>
		</span>
		<span class="tacp-item__text">
			<span class="tacp-item__title">
				<span class="tacp-item__label"><span
					v-if="item.namespace"
					class="tacp-item__namespace"
				>{{ item.namespace }}</span><template
					v-for="( part, i ) in parts"
					:key="i"><b v-if="part.match">
						{{ part.text }}
					</b><template v-else>
						{{ part.text }}
					</template></template></span>
				<span v-if="item.badge" class="tacp-item__badge">{{ item.badge }}</span>
			</span>
			<span v-if="item.description" class="tacp-item__description"><template
				v-for="( part, i ) in descriptionParts"
				:key="i"><b v-if="part.match">
					{{ part.text }}
				</b><template v-else>
					{{ part.text }}
				</template></template></span>
		</span>
		<span
			v-if="item.redirectFrom"
			class="tacp-item__metadata"
			:title="redirectText"
		>
			<cdx-icon
				class="tacp-item__metadata__icon"
				:icon="icons.articleRedirect"
				size="small"
			></cdx-icon>
			<span class="tacp-item__metadata__label">{{ item.redirectFrom }}</span>
		</span>
		<span v-if="item.actions.length" class="tacp-item__actions">
			<span class="tacp-item__buttons">
				<!-- Not focusable: reached with → from the input; inside an
					option it would not be exposed anyway, so the palette
					announces it -->
				<span
					v-for="( action, i ) in item.actions"
					:key="action.id"
					class="tacp-item__action"
					:class="{ 'tacp-item__action--active': active && activeAction === i }"
					:title="action.label"
					aria-hidden="true"
					@click.stop="$emit( 'action', action )"
				>
					<cdx-icon :icon="action.icon" size="small"></cdx-icon>
				</span>
			</span>
		</span>
	</component>
</template>

<script>
import { defineComponent, computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { CdxIcon, CdxThumbnail } from '@wikimedia/codex';
import icons from '../icons.js';
import { highlight, highlightWords, msg } from '../text.js';
import { thumbWidth, safeUrl } from '../items.js';
import { sharpThumb } from '../services/thumbs.js';

export default defineComponent( {
	name: 'ResultItem',
	components: { CdxIcon, CdxThumbnail },
	props: {
		id: { type: String, required: true },
		item: { type: Object, required: true },
		query: { type: String, default: '' },
		active: { type: Boolean, default: false },
		activeAction: { type: Number, default: -1 }
	},
	emits: [ 'hover', 'activate', 'action' ],
	setup( props ) {
		const root = ref( null );
		// Set once the image has loaded; until then CdxThumbnail shows its placeholder
		const thumbUrl = ref( null );
		// A file that cannot be shown as an image (e.g. audio) keeps its SVG icon.
		// Storing the URL, not a boolean, resets the fallback when the row is reused.
		const failedIconUrl = ref( null );
		let observer = null;
		let sharp = false;
		// Rows are keyed by their position, so the same instance is reused for
		// another item on every search. Ignore image loads from an older item.
		let generation = 0;

		function preload( url, isSharp, gen ) {
			const img = new Image();
			img.onload = () => {
				if ( gen !== generation ) {
					return;
				}
				// The plain thumbnail must not replace a sharper one that loaded first
				if ( isSharp || !sharp ) {
					sharp = sharp || isSharp;
					thumbUrl.value = url;
				}
			};
			img.src = url;
		}

		// The thumbnail as given, then, on screens that need more pixels than
		// it has (e.g. 60px at 2x), one at 40px × devicePixelRatio
		function load() {
			if ( !props.item.thumbnail ) {
				return;
			}
			const gen = generation;
			const { url, width } = props.item.thumbnail;
			preload( url, false, gen );
			if ( props.item.title && width && width < thumbWidth() ) {
				sharpThumb( props.item.title ).then( ( better ) => {
					if ( gen === generation && better && better !== url ) {
						preload( better, true, gen );
					}
				} );
			}
		}

		function invalidate() {
			generation++;
			if ( observer ) {
				observer.disconnect();
				observer = null;
			}
		}

		// Lazy: only once the row is near the visible part of the list
		function start() {
			if ( !props.item.thumbnail ) {
				return;
			}
			if ( typeof IntersectionObserver !== 'function' ) {
				load();
				return;
			}
			// A row can be swapped for a different kind of item (a link becomes
			// a div, or it moves to another column). Bind to this generation so
			// a callback queued for the previous item cannot disconnect the new
			// observer, and so it cannot load an image into the wrong row.
			const gen = generation;
			const io = new IntersectionObserver( ( entries ) => {
				if ( gen !== generation ) {
					io.disconnect();
					return;
				}
				if ( entries.some( ( e ) => e.isIntersecting ) ) {
					io.disconnect();
					observer = null;
					load();
				}
			}, { rootMargin: '100px' } );
			observer = io;
			if ( root.value ) {
				io.observe( root.value );
			} else {
				load();
			}
		}

		onMounted( start );
		onBeforeUnmount( invalidate );

		// A different result now occupies this row: drop the old image (and its
		// failed-icon fallback) and load the new one, even though the instance
		// itself is reused by Vue.
		watch( () => props.item, () => {
			invalidate();
			thumbUrl.value = null;
			failedIconUrl.value = null;
			sharp = false;
			start();
		}, { flush: 'post' } );

		return {
			root,
			thumbUrl,
			failedIconUrl,
			icons,
			defaultIcon: icons.article,
			// Only items that open their url (App.vue activate()); modes,
			// queries and commands do not
			href: computed( () => {
				const it = props.item;
				return it.mode || ( it.query !== null && it.query !== undefined ) || it.run ?
					null : safeUrl( it.url );
			} ),
			parts: computed( () => highlight( props.item.label, props.query ) ),
			descriptionParts: computed( () => highlightWords( props.item.description || '', props.query ) ),
			redirectText: computed( () => msg( 'tacp-redirected-from', props.item.redirectFrom ) )
		};
	}
} );
</script>
