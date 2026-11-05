import type {
	IAuthenticate,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ReduckApi implements ICredentialType {
	name = 'reduckApi';

	displayName = 'Reduck API';

	icon: Icon = { light: 'file:../nodes/Reduck/reduck.svg', dark: 'file:../nodes/Reduck/reduck.dark.svg' };

	documentationUrl = 'https://docs.reduck.ai/n8n/#credentials';

	// n8n's allowlist for this credential in the HTTP Request node. The Reduck node only calls the
	// credential's own Reduck URL, which the list never blocks, so the field would only add noise.
	hideDomainRestrictionFields = true;

	properties: INodeProperties[] = [
		// A notice shows by default; a field's description only in its tooltip.
		{
			displayName:
				'Create an API key at <a href="https://reduck.ai/api-keys?utm_source=n8n&utm_medium=credential" target="_blank">reduck.ai/api-keys</a>',
			name: 'notice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
		},
		// Another Reduck environment, for our tests, is set where the credential is imported.
		{
			displayName: 'Reduck URL',
			name: 'url',
			type: 'hidden',
			default: 'https://reduck.ai',
		},
	];

	authenticate: IAuthenticate = {
		type: 'generic',
		properties: { headers: { 'X-API-Key': '={{$credentials.apiKey}}' } },
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.url.replace(/\\/+$/, "")}}',
			url: '/api/me',
		},
	};
}
