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

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Create one in the Reduck dashboard, under <a href="https://reduck.ai/api-keys" target="_blank">API keys</a>',
		},
		{
			displayName: 'Reduck URL',
			name: 'url',
			type: 'string',
			default: 'https://reduck.ai',
			description: 'Change it only to test against another Reduck environment',
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
