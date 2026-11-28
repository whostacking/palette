import icons from '../icons.js';
import { msg, matches, text } from '../text.js';
import { modeItem } from '../results.js';

/**
 * @param {Object} registry
 * @return {Object} Mode spec listing every mode available on this page
 */
export default function createHelpMode( registry ) {
	return {
		id: 'tacp-help',
		trigger: '/help',
		label: 'tacp-mode-help',
		description: 'tacp-mode-help-desc',
		icon: icons.help,
		getResults( query, context ) {
			const modes = registry.getModes( context )
				.filter( ( m ) => matches( m.trigger + ' ' + text( m.label ) + ' ' + text( m.description ), query ) )
				.map( modeItem );
			return [
				{ id: 'modes', label: msg( 'tacp-group-modes' ), items: modes }
			];
		}
	};
}
