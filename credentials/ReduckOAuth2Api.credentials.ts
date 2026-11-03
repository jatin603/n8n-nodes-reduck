import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

// Reduck publishes its OAuth metadata (RFC 9728, then RFC 8414) and lets a client register itself
// (RFC 7591). With dynamic client registration on, n8n reads both from the server URL, registers,
// and signs in with PKCE, so the user only presses "Connect".
export class ReduckOAuth2Api implements ICredentialType {
	name = 'reduckOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'Reduck OAuth2 API';

	icon: Icon = {
		light: 'file:../nodes/Reduck/reduck.svg',
		dark: 'file:../nodes/Reduck/reduck.dark.svg',
	};

	documentationUrl = 'https://docs.reduck.ai/n8n/#credentials';

	properties: INodeProperties[] = [
		// With no visible field, n8n connects without the credential window, which is where API Key
		// is chosen: this line keeps the window.
		{
			displayName: 'Select Connect to sign in to Reduck, or set OAuth2 to API Key to use a key',
			name: 'notice',
			type: 'callout',
			default: '',
		},
		// n8n's allowlist for the HTTP Request node, inherited from oAuth2Api. The Reduck node only
		// calls the credential's own Reduck URL, which the list never blocks.
		{
			displayName: 'Allowed HTTP Request Domains',
			name: 'allowedHttpRequestDomains',
			type: 'hidden',
			default: 'all',
		},
		{
			displayName: 'Use Dynamic Client Registration',
			name: 'useDynamicClientRegistration',
			type: 'hidden',
			default: true,
		},
		{
			displayName: 'Server URL',
			name: 'serverUrl',
			type: 'hidden',
			default: 'https://reduck.ai',
		},
	];
}
