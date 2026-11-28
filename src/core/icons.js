// Codex icons (MIT) bundled by TACP and offered to other gadgets as tacp.icons
import {
	cdxIconAdd, cdxIconArticle, cdxIconArticles, cdxIconClock, cdxIconClose, cdxIconCopy,
	cdxIconDie, cdxIconEdit, cdxIconFolderPlaceholder, cdxIconFunction, cdxIconHelp,
	cdxIconHistory, cdxIconImage, cdxIconLink, cdxIconListBullet, cdxIconNewWindow,
	cdxIconNext, cdxIconRecentChanges, cdxIconReload, cdxIconSearch, cdxIconSettings,
	cdxIconSpecialPages, cdxIconSpeechBubbles, cdxIconTag, cdxIconTrash, cdxIconUserAvatar,
	cdxIconUserContributions, cdxIconUserTalk, cdxIconAlert, cdxIconLanguage,
	cdxIconCode, cdxIconInfo, cdxIconLinkExternal, cdxIconVolumeUp
} from '@wikimedia/codex-icons';

// Codex articleRedirect icon (MIT), from Commons
// File:Codex_icon_articleRedirect_(v2.6).svg. Kept as a path string so
// CdxIcon colours it like every other bundled icon.
const cdxIconArticleRedirect = '<path fill-rule="evenodd" clip-rule="evenodd" d="M18 20H2V0H18V20ZM4 2C4 4.39292 4.48295 6.50713 5.66113 8.00684C6.66265 9.2815 8.26639 10.2355 10.8486 10.4521L8.89648 8.5L10.3105 7.08594L14.0176 10.793V12.207L10.3105 15.9141L8.89648 14.5L10.9336 12.4619C7.77342 12.2505 5.53819 11.0876 4.08887 9.24316C4.0579 9.20375 4.03015 9.16197 4 9.12207V18H16V2H4Z"/>';

export default Object.freeze( {
	add: cdxIconAdd,
	alert: cdxIconAlert,
	article: cdxIconArticle,
	articleRedirect: cdxIconArticleRedirect,
	articles: cdxIconArticles,
	clock: cdxIconClock,
	code: cdxIconCode,
	close: cdxIconClose,
	copy: cdxIconCopy,
	die: cdxIconDie,
	edit: cdxIconEdit,
	folder: cdxIconFolderPlaceholder,
	function: cdxIconFunction,
	help: cdxIconHelp,
	history: cdxIconHistory,
	image: cdxIconImage,
	info: cdxIconInfo,
	language: cdxIconLanguage,
	link: cdxIconLink,
	linkExternal: cdxIconLinkExternal,
	listBullet: cdxIconListBullet,
	newWindow: cdxIconNewWindow,
	next: cdxIconNext,
	recentChanges: cdxIconRecentChanges,
	reload: cdxIconReload,
	search: cdxIconSearch,
	settings: cdxIconSettings,
	specialPages: cdxIconSpecialPages,
	speechBubbles: cdxIconSpeechBubbles,
	tag: cdxIconTag,
	trash: cdxIconTrash,
	user: cdxIconUserAvatar,
	userContributions: cdxIconUserContributions,
	userTalk: cdxIconUserTalk,
	volumeUp: cdxIconVolumeUp
} );
